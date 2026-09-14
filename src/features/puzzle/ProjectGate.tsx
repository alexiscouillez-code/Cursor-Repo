"use client";

import type { ReactNode } from "react";
import type { PuzzleProject } from "@/types/puzzle";
import { usePuzzle } from "./PuzzleProvider";

export function ProjectGate({
  children,
}: {
  children: (project: PuzzleProject) => ReactNode;
}) {
  const { project, loading, storageError } = usePuzzle();

  if (loading) {
    return <p className="text-sm text-zinc-400">Chargement…</p>;
  }

  if (!project) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-zinc-400">Puzzle introuvable.</p>
        {storageError ? (
          <p className="text-xs text-amber-300">{storageError}</p>
        ) : null}
      </div>
    );
  }

  return <>{children(project)}</>;
}
