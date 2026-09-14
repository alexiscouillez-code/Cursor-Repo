"use client";

import type { PuzzlePiece } from "@/types/puzzle";
import { PuzzlePieceDetector } from "@/lib/vision/PuzzlePieceDetector";
import { PrimaryButton } from "@/components/ui/Sheet";

export function PieceCorrectionBar({
  pieces,
  onChange,
  onToggleAssembled,
}: {
  pieces: PuzzlePiece[];
  onChange: (pieces: PuzzlePiece[]) => void;
  onToggleAssembled: (pieceId: string) => void;
}) {
  const detector = new PuzzlePieceDetector();

  if (pieces.length === 0) return null;

  const assembledCount = pieces.filter((p) => p.isAssembled).length;
  const pending = pieces.filter((p) => !p.isAssembled);

  return (
    <div className="space-y-3 rounded-2xl border border-white/10 bg-[#12151a] p-3">
      <div className="flex items-end justify-between gap-2">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
            Pièces détectées
          </p>
          <p className="mt-1 text-xs text-zinc-400">
            Touche une pièce quand elle est assemblée → croix sur l&apos;image
          </p>
        </div>
        <p className="shrink-0 text-xs text-cyan-300">
          {assembledCount}/{pieces.length} OK
        </p>
      </div>

      <div className="grid max-h-72 grid-cols-3 gap-2 overflow-auto sm:grid-cols-4">
        {pieces.map((p) => (
          <div
            key={p.id}
            className={`relative overflow-hidden rounded-xl border ${
              p.isAssembled
                ? "border-emerald-400/40 bg-emerald-500/10"
                : "border-white/10 bg-black/40"
            }`}
          >
            <button
              type="button"
              className="relative block w-full"
              onClick={() => onToggleAssembled(p.id)}
              title={
                p.isAssembled
                  ? "Retirer la croix (pas encore assemblée)"
                  : "Marquer comme assemblée"
              }
              aria-pressed={Boolean(p.isAssembled)}
            >
              <div className="relative aspect-square w-full">
                {p.thumbnailDataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.thumbnailDataUrl}
                    alt={p.code}
                    className={`h-full w-full object-cover ${
                      p.isAssembled ? "opacity-45 grayscale" : ""
                    }`}
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-xs text-zinc-500">
                    {p.code}
                  </div>
                )}
                {p.isAssembled && (
                  <span
                    className="pointer-events-none absolute inset-0 flex items-center justify-center"
                    aria-hidden
                  >
                    <span className="relative block h-[70%] w-[70%]">
                      <span className="absolute left-1/2 top-0 h-full w-[3px] -translate-x-1/2 rotate-45 rounded-full bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.8)]" />
                      <span className="absolute left-1/2 top-0 h-full w-[3px] -translate-x-1/2 -rotate-45 rounded-full bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.8)]" />
                    </span>
                  </span>
                )}
              </div>
              <span className="block truncate px-1.5 py-1 text-center text-[11px] text-cyan-100">
                {p.code}
                {p.isAssembled ? " · OK" : ""}
              </span>
            </button>
            <button
              type="button"
              className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-xs text-zinc-300"
              onClick={() => onChange(detector.removePiece(pieces, p.id))}
              title="Supprimer fausse détection"
              aria-label={`Supprimer ${p.code}`}
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      {pending.length >= 2 && (
        <PrimaryButton
          variant="ghost"
          onClick={() =>
            onChange(
              detector.mergePieces(pieces, pending[0]!.id, pending[1]!.id),
            )
          }
        >
          Fusionner {pending[0]!.code} + {pending[1]!.code}
        </PrimaryButton>
      )}
    </div>
  );
}
