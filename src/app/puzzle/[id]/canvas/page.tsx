"use client";

import { useState } from "react";
import { usePuzzle } from "@/features/puzzle/PuzzleProvider";
import { ProjectGate } from "@/features/puzzle/ProjectGate";
import { PuzzleCanvas } from "@/components/canvas/PuzzleCanvas";
import {
  AssistantPanel,
  NextActionButton,
} from "@/features/assistant/AssistantPanel";
import { PrimaryButton } from "@/components/ui/Sheet";

export default function CanvasPage() {
  const { store, update } = usePuzzle();
  const [assistantOpen, setAssistantOpen] = useState(false);

  return (
    <ProjectGate>
      {(project) => {
        const p = project.progress;
        return (
          <>
            <header className="mb-4">
              <p className="text-[11px] uppercase tracking-[0.2em] text-cyan-400/80">
                Reconstruction
              </p>
              <h1 className="text-2xl text-white">Puzzle Canvas</h1>
            </header>

            <div className="mb-4 grid grid-cols-2 gap-2 text-xs text-zinc-400">
              <div className="rounded-xl border border-white/10 bg-[#12151a] p-3">
                Pièces
                <div className="text-lg text-white">
                  {p.piecesIdentified} / {p.piecesTotal}
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-[#12151a] p-3">
                Connexions
                <div className="text-lg text-white">{p.connectionsConfirmed}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-[#12151a] p-3">
                Groupes
                <div className="text-lg text-white">{p.groupsCount}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-[#12151a] p-3">
                Progression
                <div className="text-lg text-cyan-300">{p.estimatedPercent}%</div>
              </div>
            </div>

            <PuzzleCanvas
              pieces={project.pieces}
              placements={project.placements}
              matches={project.matches}
              groups={project.groups}
              onMove={(pieceId, x, y) => {
                void update({
                  ...project,
                  placements: project.placements.map((pl) =>
                    pl.pieceId === pieceId ? { ...pl, x, y } : pl,
                  ),
                });
              }}
            />

            <div className="mt-3">
              <PrimaryButton
                variant="ghost"
                onClick={() => void update(store.undoLast(project))}
              >
                Annuler dernière association
              </PrimaryButton>
            </div>

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
        );
      }}
    </ProjectGate>
  );
}
