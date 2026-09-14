import { complementarySides, profileCorrelation } from "@/lib/geometry/math";
import type {
  EdgeSide,
  EdgeTabType,
  MatchExplanation,
  MatchScoreBreakdown,
  MatchWeights,
  PieceMatch,
  PuzzlePiece,
} from "@/types/puzzle";
import { DEFAULT_MATCH_WEIGHTS as WEIGHTS } from "@/types/puzzle";

function areTabTypesCompatible(a: EdgeTabType, b: EdgeTabType): boolean {
  if (a === "EDGE" || b === "EDGE") return false;
  if (a === "TAB" && b === "BLANK") return true;
  if (a === "BLANK" && b === "TAB") return true;
  if (a === "INNER" && b === "INNER") return true;
  return false;
}

function histogramSimilarity(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += Math.min(a[i] ?? 0, b[i] ?? 0);
  }
  return Math.min(1, sum);
}

function continuityScore(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) return 0;
  let err = 0;
  for (let i = 0; i < n; i++) {
    err += Math.abs((a[i] ?? 0) - (b[n - 1 - i] ?? 0));
  }
  return Math.max(0, 1 - err / n);
}

export class PuzzleMatchingEngine {
  constructor(private weights: MatchWeights = WEIGHTS) {}

  findCandidates(
    pieces: PuzzlePiece[],
    options?: {
      rejectedKeys?: Set<string>;
      maxPerPiece?: number;
      lengthTolerance?: number;
    },
  ): PieceMatch[] {
    const rejected = options?.rejectedKeys ?? new Set<string>();
    const maxPerPiece = options?.maxPerPiece ?? 8;
    const lengthTolerance = options?.lengthTolerance ?? 0.22;
    const matches: PieceMatch[] = [];

    // Index edges by tab type for candidate filtering (avoid naïve N² explosion)
    type EdgeRef = { piece: PuzzlePiece; side: EdgeSide };
    const byType: Record<string, EdgeRef[]> = {
      TAB: [],
      BLANK: [],
      INNER: [],
    };

    for (const piece of pieces) {
      for (const edge of piece.edges) {
        if (edge.type === "EDGE") continue;
        byType[edge.type]?.push({ piece, side: edge.side });
      }
    }

    const pairsTried = new Set<string>();

    const consider = (a: EdgeRef, b: EdgeRef) => {
      if (a.piece.id === b.piece.id) return;
      if (complementarySides(a.side) !== b.side) return;

      const edgeA = a.piece.edges.find((e) => e.side === a.side);
      const edgeB = b.piece.edges.find((e) => e.side === b.side);
      if (!edgeA || !edgeB) return;
      if (!areTabTypesCompatible(edgeA.type, edgeB.type)) return;

      const lengthRatio =
        Math.abs(edgeA.length - edgeB.length) / Math.max(edgeA.length, edgeB.length);
      if (lengthRatio > lengthTolerance) return;

      const key = this.matchKey(a.piece.id, b.piece.id, a.side, b.side);
      if (rejected.has(key) || pairsTried.has(key)) return;
      pairsTried.add(key);

      const scored = this.scorePair(a.piece, b.piece, a.side, b.side);
      if (scored.score.global < 45) return;

      matches.push(scored);
    };

    // TAB ↔ BLANK
    for (const a of byType.TAB ?? []) {
      for (const b of byType.BLANK ?? []) consider(a, b);
    }
    // INNER ↔ INNER
    for (let i = 0; i < (byType.INNER?.length ?? 0); i++) {
      for (let j = i + 1; j < (byType.INNER?.length ?? 0); j++) {
        consider(byType.INNER![i]!, byType.INNER![j]!);
      }
    }

    // Keep top candidates per piece
    const byPiece = new Map<string, PieceMatch[]>();
    for (const m of matches) {
      for (const id of [m.pieceAId, m.pieceBId]) {
        const list = byPiece.get(id) ?? [];
        list.push(m);
        byPiece.set(id, list);
      }
    }

    const kept = new Set<string>();
    for (const list of byPiece.values()) {
      list
        .sort((a, b) => b.score.global - a.score.global)
        .slice(0, maxPerPiece)
        .forEach((m) => kept.add(m.id));
    }

    return matches
      .filter((m) => kept.has(m.id))
      .sort((a, b) => b.score.global - a.score.global);
  }

  scorePair(
    pieceA: PuzzlePiece,
    pieceB: PuzzlePiece,
    sideA: EdgeSide,
    sideB: EdgeSide,
    extras?: { referenceContext?: number | null },
  ): PieceMatch {
    const edgeA = pieceA.edges.find((e) => e.side === sideA)!;
    const edgeB = pieceB.edges.find((e) => e.side === sideB)!;
    const explanations: MatchExplanation[] = [];

    let geometry = 0;
    if (!areTabTypesCompatible(edgeA.type, edgeB.type)) {
      geometry = 0;
      explanations.push({ label: "types de côtés incompatibles", positive: false });
    } else {
      explanations.push({
        label: `profils ${edgeA.type} ↔ ${edgeB.type}`,
        positive: true,
      });
      const corr = profileCorrelation(
        edgeA.signature.normalizedProfile,
        edgeB.signature.normalizedProfile,
      );
      const lengthScore =
        1 -
        Math.abs(edgeA.length - edgeB.length) / Math.max(edgeA.length, edgeB.length);
      geometry = Math.max(0, Math.min(1, 0.55 * ((corr + 1) / 2) + 0.45 * lengthScore)) * 100;
      if (lengthScore > 0.85) {
        explanations.push({ label: "longueur compatible", positive: true });
      }
      if (corr > 0.35) {
        explanations.push({ label: "forme complémentaire", positive: true });
      }
    }

    // Geometry veto: incompatible geometry cannot get excellent global score
    const color = histogramSimilarity(
      edgeA.side ? pieceA.colors.edgeZoneColors[sideA] : [],
      pieceB.colors.edgeZoneColors[sideB],
    ) * 100;
    if (color > 60) {
      explanations.push({ label: "couleurs cohérentes sur le bord", positive: true });
    }

    const texture =
      continuityScore(
        pieceA.textures.edgeContinuityHints[sideA],
        pieceB.textures.edgeContinuityHints[sideB],
      ) * 100;
    const continuity = texture;
    if (continuity > 55) {
      explanations.push({ label: "motif potentiellement continu", positive: true });
    }

    const referenceContext = extras?.referenceContext ?? this.referenceBonus(pieceA, pieceB);

    if (referenceContext !== null && referenceContext > 50) {
      explanations.push({ label: "zone de référence compatible", positive: true });
    }

    const score = this.combineScores({
      geometry,
      color,
      texture,
      continuity,
      referenceContext,
      global: 0,
    });

    // Hard clamp: geometry-incompatible pairs stay low
    if (geometry < 35) {
      score.global = Math.min(score.global, 40);
    }

    const confidence = Math.min(
      0.98,
      0.4 +
        (edgeA.signature.confidence + edgeB.signature.confidence) / 4 +
        (geometry / 100) * 0.3,
    );

    return {
      id: this.matchKey(pieceA.id, pieceB.id, sideA, sideB),
      puzzleId: pieceA.puzzleId,
      pieceAId: pieceA.id,
      pieceBId: pieceB.id,
      pieceACode: pieceA.code,
      pieceBCode: pieceB.code,
      sideA,
      sideB,
      score,
      confidence,
      explanations,
      status: "candidate",
      createdAt: Date.now(),
    };
  }

  combineScores(parts: MatchScoreBreakdown): MatchScoreBreakdown {
    const w = this.weights;
    let totalW = w.geometry + w.color + w.texture + w.continuity;
    let sum =
      parts.geometry * w.geometry +
      parts.color * w.color +
      parts.texture * w.texture +
      parts.continuity * w.continuity;

    if (parts.referenceContext !== null) {
      totalW += w.referenceContext;
      sum += parts.referenceContext * w.referenceContext;
    }

    return {
      ...parts,
      global: Math.round(Math.max(0, Math.min(100, sum / totalW))),
    };
  }

  matchKey(
    pieceAId: string,
    pieceBId: string,
    sideA: EdgeSide,
    sideB: EdgeSide,
  ): string {
    const ordered =
      pieceAId < pieceBId
        ? `${pieceAId}:${sideA}|${pieceBId}:${sideB}`
        : `${pieceBId}:${sideB}|${pieceAId}:${sideA}`;
    return ordered;
  }

  private referenceBonus(a: PuzzlePiece, b: PuzzlePiece): number | null {
    if (!a.regionHint || !b.regionHint) return null;
    if (a.regionHint.name === b.regionHint.name) {
      return Math.round(
        ((a.regionHint.confidence + b.regionHint.confidence) / 2) * 100,
      );
    }
    return Math.round(
      (1 - Math.abs(a.regionHint.confidence - b.regionHint.confidence)) * 35,
    );
  }
}

export class PuzzleEdgeAnalyzer {
  complementaryType(type: EdgeTabType): EdgeTabType | null {
    if (type === "TAB") return "BLANK";
    if (type === "BLANK") return "TAB";
    if (type === "INNER") return "INNER";
    return null;
  }
}
