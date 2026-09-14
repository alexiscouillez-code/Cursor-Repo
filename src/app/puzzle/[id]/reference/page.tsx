"use client";

import { useRef, useState } from "react";
import { usePuzzle } from "@/features/puzzle/PuzzleProvider";
import { ProjectGate } from "@/features/puzzle/ProjectGate";
import { PuzzleReferenceAnalyzer } from "@/lib/analysis/PuzzleReferenceAnalyzer";
import { PrimaryButton } from "@/components/ui/Sheet";

export default function ReferencePage() {
  const { update } = usePuzzle();
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <ProjectGate>
      {(project) => {
        const onFile = (file: File | null) => {
          if (!file) return;
          if (file.size > 12 * 1024 * 1024) {
            setStatus("Image trop lourde (max 12 Mo).");
            return;
          }
          const reader = new FileReader();
          reader.onload = () => {
            void update({
              ...project,
              referenceImageDataUrl: String(reader.result),
              history: [
                {
                  id: crypto.randomUUID(),
                  puzzleId: project.id,
                  type: "reference_added",
                  payload: {},
                  timestamp: Date.now(),
                  undoable: false,
                },
                ...project.history,
              ],
            }).then(
              () => setStatus("Image de référence importée."),
              (error: unknown) =>
                setStatus(
                  error instanceof Error
                    ? error.message
                    : "Échec d'enregistrement (stockage plein ?)",
                ),
            );
          };
          reader.readAsDataURL(file);
        };

        const analyze = async () => {
          setBusy(true);
          setStatus("Analyse des zones (moteur local)…");
          const analyzer = new PuzzleReferenceAnalyzer();
          try {
            const analysis = project.referenceImageDataUrl
              ? await analyzer.analyzeImageDataUrl(project.referenceImageDataUrl)
              : analyzer.analyzeFromColors(
                  project.pieces[0]?.colors.dominantColors ?? [
                    "#6BA3C7",
                    "#2F5D3A",
                    "#8B7355",
                  ],
                );

            const pieces = project.pieces.map((p) => ({
              ...p,
              regionHint: analyzer.classifyPieceRegion(p, analysis),
            }));

            await update({
              ...project,
              referenceAnalysis: analysis,
              pieces,
            });
            setStatus(
              `${analysis.source === "engine" ? "Moteur" : "Heuristique"} : ${analysis.regions.length} zone(s)`,
            );
          } catch (error) {
            setStatus(
              error instanceof Error
                ? error.message
                : "Échec de l'analyse locale.",
            );
          } finally {
            setBusy(false);
          }
        };

        return (
          <>
            <header className="mb-5">
              <p className="text-[11px] uppercase tracking-[0.2em] text-cyan-400/80">
                Image de référence
              </p>
              <h1 className="text-2xl text-white">Boîte / puzzle terminé</h1>
              <p className="mt-1 text-xs text-zinc-500">
                Analyse locale par grille couleur — sans IA externe
              </p>
            </header>

            <div className="mb-4 overflow-hidden rounded-2xl border border-white/10 bg-black">
              {project.referenceImageDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={project.referenceImageDataUrl}
                  alt="Référence"
                  className="aspect-video w-full object-contain"
                />
              ) : (
                <div className="flex aspect-video items-center justify-center text-sm text-zinc-500">
                  Aucune image
                </div>
              )}
            </div>

            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => onFile(e.target.files?.[0] ?? null)}
            />

            <div className="flex gap-2">
              <PrimaryButton onClick={() => inputRef.current?.click()}>
                Importer
              </PrimaryButton>
              <PrimaryButton
                variant="ghost"
                disabled={!project.referenceImageDataUrl || busy}
                onClick={() => void analyze()}
              >
                Analyser zones
              </PrimaryButton>
            </div>

            {status && <p className="mt-3 text-sm text-cyan-200">{status}</p>}

            {project.referenceAnalysis && (
              <section className="mt-6 space-y-2">
                <h2 className="text-xs uppercase tracking-[0.2em] text-zinc-500">
                  Régions ({project.referenceAnalysis.source})
                </h2>
                <p className="text-xs text-zinc-500">
                  {project.referenceAnalysis.summary}
                </p>
                {project.referenceAnalysis.regions.map((r) => (
                  <div
                    key={`${r.name}-${r.position}`}
                    className="rounded-xl border border-white/10 bg-[#12151a] px-4 py-3 text-sm"
                  >
                    <div className="text-white">{r.name}</div>
                    <div className="text-xs text-zinc-500">
                      {r.position} · {(r.confidence * 100).toFixed(0)}%
                      {r.colorHints?.length
                        ? ` · ${r.colorHints.join(", ")}`
                        : ""}
                    </div>
                  </div>
                ))}
              </section>
            )}

            <section className="mt-6 space-y-2">
              <h2 className="text-xs uppercase tracking-[0.2em] text-zinc-500">
                Classification pièces
              </h2>
              {project.pieces
                .filter((p) => p.regionHint)
                .slice(0, 20)
                .map((p) => (
                  <div key={p.id} className="text-sm text-zinc-300">
                    {p.code} → {p.regionHint?.name} (
                    {((p.regionHint?.confidence ?? 0) * 100).toFixed(0)}%)
                  </div>
                ))}
              {project.pieces.every((p) => !p.regionHint) && (
                <p className="text-sm text-zinc-500">
                  Lance une analyse pour classer les pièces par zone.
                </p>
              )}
            </section>
          </>
        );
      }}
    </ProjectGate>
  );
}
