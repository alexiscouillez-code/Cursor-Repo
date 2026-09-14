"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { createPuzzle, PuzzleStore } from "@/lib/store/PuzzleStore";
import type { PuzzlePiece, PuzzleProject, PuzzleScan } from "@/types/puzzle";

const Ctx = createContext<{
  store: PuzzleStore;
  project: PuzzleProject | null;
  refresh: () => void;
  update: (project: PuzzleProject) => void;
} | null>(null);

export function PuzzleProvider({
  puzzleId,
  children,
}: {
  puzzleId: string;
  children: ReactNode;
}) {
  const store = useMemo(() => new PuzzleStore(), []);
  const [project, setProject] = useState<PuzzleProject | null>(() =>
    store.get(puzzleId),
  );

  const refresh = useCallback(() => {
    setProject(store.get(puzzleId));
  }, [store, puzzleId]);

  const update = useCallback(
    (next: PuzzleProject) => {
      store.save(next);
      setProject(next);
    },
    [store],
  );

  // Re-sync when puzzleId changes without an effect cascade on mount
  const [activeId, setActiveId] = useState(puzzleId);
  if (activeId !== puzzleId) {
    setActiveId(puzzleId);
    setProject(store.get(puzzleId));
  }

  return (
    <Ctx.Provider value={{ store, project, refresh, update }}>
      {children}
    </Ctx.Provider>
  );
}

export function usePuzzle() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("usePuzzle must be used within PuzzleProvider");
  return ctx;
}

export function useHomePuzzles() {
  const store = useMemo(() => new PuzzleStore(), []);
  const [projects, setProjects] = useState<PuzzleProject[]>(() => store.list());

  const reload = useCallback(() => {
    setProjects(store.list());
  }, [store]);

  const create = (name: string, expectedPieces: number) => {
    const p = createPuzzle(name, expectedPieces);
    store.save(p);
    reload();
    return p;
  };

  const remove = (id: string) => {
    store.delete(id);
    reload();
  };

  return { projects, create, remove, reload, store };
}

export function applyScanToProject(
  project: PuzzleProject,
  scan: PuzzleScan,
  pieces: PuzzlePiece[],
  store: PuzzleStore,
): PuzzleProject {
  const mergedPieces = [...project.pieces, ...pieces];
  const renumbered = mergedPieces.map((p, i) => ({
    ...p,
    code: `P${String(i + 1).padStart(3, "0")}`,
  }));
  let next: PuzzleProject = {
    ...project,
    scans: [scan, ...project.scans],
    pieces: renumbered,
    history: [
      {
        id: crypto.randomUUID(),
        puzzleId: project.id,
        type: "scan",
        payload: { scanId: scan.id, count: pieces.length },
        timestamp: Date.now(),
        undoable: false,
      },
      ...project.history,
    ],
  };
  next = store.recomputeMatches(next);
  return next;
}
