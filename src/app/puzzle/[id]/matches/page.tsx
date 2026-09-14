"use client";

import { useMemo, useState } from "react";
import { usePuzzle } from "@/features/puzzle/PuzzleProvider";
import { ProjectGate } from "@/features/puzzle/ProjectGate";
import { BottomSheet, PrimaryButton, ScoreBar } from "@/components/ui/Sheet";
import type { PieceMatch } from "@/types/puzzle";
import {
  AssistantPanel,
  NextActionButton,
} from "@/features/assistant/AssistantPanel";

export default function MatchesPage() {
  const { project, store, update } = usePuzzle();
  const [selected, setSelected] = useState<PieceMatch | null>(null);
  const [assistantOpen, setAssistantOpen] = useState(false);

  const candidates = useMemo(
    () =>
      (project?.matches ?? [])
        .filter((m) => m.status === "candidate")
        .sort((a, b) => b.score.global - a.score.global),
    [project],
  );

  const confirmed = useMemo(
    () => (project?.matches ?? []).filter((m) => m.status === "confirmed"),
    [project],
  );

  return (
    <ProjectGate>
      {(project) => (
        <>
          <header className="mb-5">
            <p className="text-[11px] uppercase tracking-[0.2em] text-cyan-400/80">
              Associations
            </p>
            <h1 className="text-2xl text-white">Candidats</h1>
            <p className="mt-1 text-xs text-zinc-500">
              Géométrie prioritaire · score ≠ confiance
            </p>
          </header>

          <div className="mb-4 flex gap-2">
            <PrimaryButton
              variant="ghost"
              onClick={() => void update(store.undoLast(project))}
            >
              Annuler
            </PrimaryButton>
            <PrimaryButton
              variant="ghost"
              onClick={() => void update(store.recomputeMatches(project))}
            >
              Recalculer
            </PrimaryButton>
          </div>

          <section className="mb-6 space-y-2">
            {candidates.length === 0 && (
              <p className="text-sm text-zinc-500">
                Aucun candidat. Scanne des pièces pour démarrer le matching.
              </p>
            )}
            {candidates.slice(0, 40).map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setSelected(m)}
                className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-[#12151a] px-4 py-3 text-left"
              >
                <div>
                  <div className="text-sm text-white">
                    {m.pieceACode} + {m.pieceBCode}
                  </div>
                  <div className="text-[11px] text-zinc-500">
                    {m.sideA} ↔ {m.sideB} · conf.{" "}
                    {(m.confidence * 100).toFixed(0)}%
                  </div>
                </div>
                <div className="text-lg font-semibold text-cyan-300">
                  {m.score.global}%
                </div>
              </button>
            ))}
          </section>

          {confirmed.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-xs uppercase tracking-[0.2em] text-zinc-500">
                Confirmées ({confirmed.length})
              </h2>
              {confirmed.map((m) => (
                <div
                  key={m.id}
                  className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-100"
                >
                  {m.pieceACode} + {m.pieceBCode} · {m.score.global}%
                </div>
              ))}
            </section>
          )}

          <BottomSheet
            open={Boolean(selected)}
            title={
              selected
                ? `${selected.pieceACode} + ${selected.pieceBCode}`
                : "Association"
            }
            onClose={() => setSelected(null)}
          >
            {selected && (
              <div className="space-y-4">
                <div className="text-3xl font-semibold text-cyan-300">
                  {selected.score.global}%
                  <span className="ml-2 text-sm font-normal text-zinc-500">
                    conf. {(selected.confidence * 100).toFixed(0)}%
                  </span>
                </div>
                <ScoreBar label="Geometry" value={selected.score.geometry} />
                <ScoreBar label="Color" value={selected.score.color} />
                <ScoreBar label="Texture" value={selected.score.texture} />
                <ScoreBar label="Continuity" value={selected.score.continuity} />
                {selected.score.referenceContext !== null && (
                  <ScoreBar
                    label="Reference"
                    value={selected.score.referenceContext}
                  />
                )}
                <ul className="space-y-1 text-sm text-zinc-300">
                  {selected.explanations.map((e) => (
                    <li key={e.label}>
                      {e.positive ? "✓" : "✗"} {e.label}
                    </li>
                  ))}
                </ul>
                <div className="flex gap-2">
                  <PrimaryButton
                    variant="success"
                    onClick={() => {
                      void update(store.confirmMatch(project, selected.id));
                      setSelected(null);
                    }}
                  >
                    Confirmer
                  </PrimaryButton>
                  <PrimaryButton
                    variant="danger"
                    onClick={() => {
                      void update(store.rejectMatch(project, selected.id));
                      setSelected(null);
                    }}
                  >
                    Rejeter
                  </PrimaryButton>
                </div>
              </div>
            )}
          </BottomSheet>

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
