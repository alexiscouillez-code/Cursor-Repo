"use client";

import Link from "next/link";
import {
  applyScanToProject,
  usePuzzle,
} from "@/features/puzzle/PuzzleProvider";
import { ProjectGate } from "@/features/puzzle/ProjectGate";
import { ScannerPanel } from "@/features/scanner/ScannerPanel";
import { PieceCorrectionBar } from "@/features/pieces/PieceCorrectionBar";
import {
  AssistantPanel,
  NextActionButton,
} from "@/features/assistant/AssistantPanel";
import { useState } from "react";

export default function ScannerPage() {
  const { store, update } = usePuzzle();
  const [assistantOpen, setAssistantOpen] = useState(false);

  return (
    <ProjectGate>
      {(project) => (
        <>
          <header className="mb-5 flex items-end justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-cyan-400/80">
                Scanner
              </p>
              <h1 className="text-2xl text-white">{project.name}</h1>
            </div>
            <Link
              href={`/puzzle/${project.id}/reference`}
              className="text-xs text-zinc-400 underline-offset-2 hover:text-cyan-300"
            >
              Référence
            </Link>
          </header>

          <ScannerPanel
            puzzleId={project.id}
            initialPreview={project.scans[0]?.imageDataUrl ?? null}
            onDetected={({ scan, pieces, warnings }) => {
              const next = applyScanToProject(project, scan, pieces, store);
              void update(next);
              if (warnings.length) {
                console.info(warnings);
              }
            }}
          />

          {project.pieces.length > 0 && (
            <div className="mt-4 space-y-3">
              <p className="text-sm text-zinc-400">
                Total pièces : {project.pieces.length} · Progression{" "}
                {project.progress.estimatedPercent}%
              </p>
              <PieceCorrectionBar
                pieces={project.pieces}
                onChange={(pieces) => {
                  void update(store.recomputeMatches({ ...project, pieces }));
                }}
              />
            </div>
          )}

          <NextActionButton
            project={project}
            onOpenAssistant={() => setAssistantOpen(true)}
          />
          <AssistantPanel
            project={project}
            open={assistantOpen}
            onClose={() => setAssistantOpen(false)}
          />
        </>
      )}
    </ProjectGate>
  );
}
