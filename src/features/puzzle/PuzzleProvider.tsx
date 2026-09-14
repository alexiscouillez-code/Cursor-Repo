"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { createPuzzle, PuzzleStore } from "@/lib/store/PuzzleStore";
import type {
  PuzzlePiece,
  PuzzleProject,
  PuzzleScan,
  UserSession,
} from "@/types/puzzle";

const Ctx = createContext<{
  store: PuzzleStore;
  project: PuzzleProject | null;
  loading: boolean;
  storageError: string | null;
  refresh: () => Promise<void>;
  update: (project: PuzzleProject) => Promise<void>;
} | null>(null);

export function PuzzleProvider({
  puzzleId,
  children,
}: {
  puzzleId: string;
  children: ReactNode;
}) {
  const store = useMemo(() => new PuzzleStore(), []);
  const [project, setProject] = useState<PuzzleProject | null>(null);
  const [loading, setLoading] = useState(true);
  const [storageError, setStorageError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setProject(await store.get(puzzleId));
      setStorageError(null);
    } catch (error) {
      setStorageError(
        error instanceof Error ? error.message : "Erreur de stockage",
      );
    } finally {
      setLoading(false);
    }
  }, [store, puzzleId]);

  const update = useCallback(
    async (next: PuzzleProject) => {
      try {
        await store.save(next);
        setProject(next);
        setStorageError(null);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Quota de stockage dépassé";
        setStorageError(message);
        // Keep in-memory state so the session remains usable
        setProject(next);
        // Soft warning: data was saved in a reduced form — don't fail callers
        if (
          error instanceof Error &&
          error.name === "StorageSoftQuotaWarning"
        ) {
          return;
        }
        throw error;
      }
    },
    [store],
  );

  useEffect(() => {
    let cancelled = false;
    // Async load from IndexedDB — intentional mount/id sync
    void (async () => {
      try {
        const next = await store.get(puzzleId);
        if (cancelled) return;
        setProject(next);
        setStorageError(null);
      } catch (error) {
        if (cancelled) return;
        setStorageError(
          error instanceof Error ? error.message : "Erreur de stockage",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [store, puzzleId]);

  // Reset loading flag when navigating between puzzles
  const [seenId, setSeenId] = useState(puzzleId);
  if (seenId !== puzzleId) {
    setSeenId(puzzleId);
    setLoading(true);
  }

  return (
    <Ctx.Provider
      value={{ store, project, loading, storageError, refresh, update }}
    >
      {storageError && (
        <div className="mx-auto max-w-lg px-4 pt-3">
          <p className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
            {storageError}
          </p>
        </div>
      )}
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
  const [projects, setProjects] = useState<PuzzleProject[]>([]);
  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [activeSession, setActiveSession] = useState<UserSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [storageError, setStorageError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [sessionList, active, list] = await Promise.all([
        store.listSessions(),
        store.getActiveSession(),
        store.list(),
      ]);
      setSessions(sessionList);
      setActiveSession(active);
      setProjects(list);
      setStorageError(null);
    } catch (error) {
      setStorageError(
        error instanceof Error ? error.message : "Erreur de stockage",
      );
    } finally {
      setLoading(false);
    }
  }, [store]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [sessionList, active, list] = await Promise.all([
          store.listSessions(),
          store.getActiveSession(),
          store.list(),
        ]);
        if (cancelled) return;
        setSessions(sessionList);
        setActiveSession(active);
        setProjects(list);
        setStorageError(null);
      } catch (error) {
        if (cancelled) return;
        setStorageError(
          error instanceof Error ? error.message : "Erreur de stockage",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [store]);

  const create = async (name: string, expectedPieces: number) => {
    const session = activeSession ?? (await store.getActiveSession());
    const p = createPuzzle(name, expectedPieces, session.id);
    try {
      await store.save(p);
      await reload();
      setStorageError(null);
    } catch (error) {
      setStorageError(
        error instanceof Error
          ? error.message
          : "Quota de stockage dépassé",
      );
      throw error;
    }
    return p;
  };

  const remove = async (id: string) => {
    await store.delete(id);
    await reload();
  };

  const selectSession = async (sessionId: string) => {
    await store.setActiveSession(sessionId);
    await reload();
  };

  const addSession = async (name: string) => {
    await store.createSession(name);
    await reload();
  };

  const renameActiveSession = async (sessionId: string, name: string) => {
    await store.renameSession(sessionId, name);
    await reload();
  };

  const removeSession = async (sessionId: string) => {
    await store.deleteSession(sessionId);
    await reload();
  };

  return {
    projects,
    sessions,
    activeSession,
    create,
    remove,
    selectSession,
    addSession,
    renameActiveSession,
    removeSession,
    reload,
    store,
    loading,
    storageError,
  };
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
    scans: [scan, ...project.scans].slice(0, 12),
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
