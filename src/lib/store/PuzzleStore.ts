import type {
  HistoryEntry,
  PieceMatch,
  PuzzleProgress,
  PuzzleProject,
} from "@/types/puzzle";
import { PuzzleMatchingEngine } from "@/lib/matching/PuzzleMatchingEngine";
import { PuzzleGroupEngine } from "@/lib/reconstruction/PuzzleGroupEngine";
import {
  PuzzleProgressEngine,
  PuzzleReconstructionEngine,
} from "@/lib/reconstruction/PuzzleReconstructionEngine";
import { PuzzleReferenceAnalyzer } from "@/lib/ai/PuzzleAIAssistant";

const STORAGE_KEY = "puzzle-solver-v5-projects";

function emptyProgress(): PuzzleProgress {
  return {
    piecesTotal: 0,
    piecesIdentified: 0,
    connectionsConfirmed: 0,
    groupsCount: 0,
    borderPiecesPlaced: 0,
    spatialCoverage: 0,
    averageConfidence: 0,
    estimatedPercent: 0,
  };
}

export function createPuzzle(name: string, expectedPieces: number): PuzzleProject {
  const now = Date.now();
  return {
    id: cryptoId(),
    name,
    expectedPieces,
    createdAt: now,
    updatedAt: now,
    scans: [],
    pieces: [],
    matches: [],
    groups: [],
    placements: [],
    history: [],
    progress: { ...emptyProgress(), piecesTotal: expectedPieces },
  };
}

export class PuzzleStore {
  private matching = new PuzzleMatchingEngine();
  private groups = new PuzzleGroupEngine();
  private reconstruction = new PuzzleReconstructionEngine();
  private progress = new PuzzleProgressEngine();
  private reference = new PuzzleReferenceAnalyzer();

  list(): PuzzleProject[] {
    if (typeof window === "undefined") return [];
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      return JSON.parse(raw) as PuzzleProject[];
    } catch {
      return [];
    }
  }

  get(id: string): PuzzleProject | null {
    return this.list().find((p) => p.id === id) ?? null;
  }

  save(project: PuzzleProject): void {
    if (typeof window === "undefined") return;
    const all = this.list().filter((p) => p.id !== project.id);
    all.unshift({ ...project, updatedAt: Date.now() });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  }

  delete(id: string): void {
    if (typeof window === "undefined") return;
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(this.list().filter((p) => p.id !== id)),
    );
  }

  recomputeMatches(project: PuzzleProject): PuzzleProject {
    const rejected = new Set(
      project.matches
        .filter((m) => m.status === "rejected")
        .map((m) => m.id),
    );
    const confirmed = project.matches.filter((m) => m.status === "confirmed");
    const candidates = this.matching.findCandidates(project.pieces, {
      rejectedKeys: rejected,
    });

    const withRegions = {
      ...project,
      pieces: project.pieces.map((p) => ({
        ...p,
        regionHint:
          this.reference.classifyPieceRegion(p, project.referenceAnalysis) ??
          p.regionHint,
      })),
    };

    const refreshedCandidates = this.matching.findCandidates(withRegions.pieces, {
      rejectedKeys: rejected,
    });

    const next: PuzzleProject = {
      ...withRegions,
      matches: [...confirmed, ...refreshedCandidates.filter((c) => !confirmed.some((x) => x.id === c.id))],
      placements:
        project.placements.length > 0
          ? project.placements
          : this.reconstruction.initializePlacements(withRegions.pieces),
    };

    next.progress = this.progress.compute({
      expectedPieces: next.expectedPieces,
      pieces: next.pieces,
      confirmedMatches: confirmed,
      groups: next.groups,
    });

    // silence unused
    void candidates;
    return next;
  }

  confirmMatch(project: PuzzleProject, matchId: string): PuzzleProject {
    const match = project.matches.find((m) => m.id === matchId);
    if (!match || match.status === "confirmed") return project;

    const matches = project.matches.map((m) =>
      m.id === matchId ? { ...m, status: "confirmed" as const } : m,
    );
    const confirmed = matches.find((m) => m.id === matchId)!;
    const nextCode =
      project.groups.reduce((max, g) => {
        const n = parseInt(g.code.replace(/\D/g, ""), 10);
        return Number.isFinite(n) ? Math.max(max, n) : max;
      }, 0) + 1;

    const { groups, created, merged } = this.groups.createFromMatch(
      project.id,
      confirmed,
      project.groups,
      nextCode,
    );

    const groupId = (created ?? merged)?.id;
    const placements = this.reconstruction.applyConfirmedMatch(
      project.placements.length
        ? project.placements
        : this.reconstruction.initializePlacements(project.pieces),
      confirmed,
      project.pieces,
      groupId,
    );

    const history = this.pushHistory(project.history, {
      id: cryptoId(),
      puzzleId: project.id,
      type: created ? "group_created" : "match_confirmed",
      payload: { matchId, groupId, previousGroups: project.groups },
      timestamp: Date.now(),
      undoable: true,
    });

    const next: PuzzleProject = {
      ...project,
      matches,
      groups,
      placements,
      history,
    };
    next.progress = this.progress.compute({
      expectedPieces: next.expectedPieces,
      pieces: next.pieces,
      confirmedMatches: matches.filter((m) => m.status === "confirmed"),
      groups,
    });
    return next;
  }

  rejectMatch(project: PuzzleProject, matchId: string): PuzzleProject {
    const matches = project.matches.map((m) =>
      m.id === matchId ? { ...m, status: "rejected" as const } : m,
    );
    const history = this.pushHistory(project.history, {
      id: cryptoId(),
      puzzleId: project.id,
      type: "match_rejected",
      payload: { matchId },
      timestamp: Date.now(),
      undoable: true,
    });
    return { ...project, matches, history };
  }

  undoLast(project: PuzzleProject): PuzzleProject {
    const last = [...project.history].reverse().find((h) => h.undoable);
    if (!last) return project;

    if (last.type === "match_confirmed" || last.type === "group_created") {
      const matchId = last.payload.matchId as string;
      const previousGroups = last.payload.previousGroups as typeof project.groups;
      const matches = project.matches.map((m) =>
        m.id === matchId ? { ...m, status: "candidate" as const } : m,
      );
      const history = this.pushHistory(
        project.history.filter((h) => h.id !== last.id),
        {
          id: cryptoId(),
          puzzleId: project.id,
          type: "match_undone",
          payload: { matchId },
          timestamp: Date.now(),
          undoable: false,
        },
      );
      const next = {
        ...project,
        matches,
        groups: previousGroups ?? this.groups.undoMatch(project.groups, matchId),
        history,
      };
      next.progress = this.progress.compute({
        expectedPieces: next.expectedPieces,
        pieces: next.pieces,
        confirmedMatches: matches.filter((m) => m.status === "confirmed"),
        groups: next.groups,
      });
      return next;
    }

    if (last.type === "match_rejected") {
      const matchId = last.payload.matchId as string;
      return {
        ...project,
        matches: project.matches.map((m) =>
          m.id === matchId ? { ...m, status: "candidate" as const } : m,
        ),
        history: project.history.filter((h) => h.id !== last.id),
      };
    }

    return project;
  }

  private pushHistory(
    history: HistoryEntry[],
    entry: HistoryEntry,
  ): HistoryEntry[] {
    return [entry, ...history].slice(0, 200);
  }
}

function cryptoId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `id_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function rejectedMatchKeys(matches: PieceMatch[]): Set<string> {
  return new Set(matches.filter((m) => m.status === "rejected").map((m) => m.id));
}
