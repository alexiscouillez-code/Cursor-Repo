"use client";

import type { PuzzlePiece } from "@/types/puzzle";
import { PuzzlePieceDetector } from "@/lib/vision/PuzzlePieceDetector";
import { PrimaryButton } from "@/components/ui/Sheet";

export function PieceCorrectionBar({
  pieces,
  onChange,
}: {
  pieces: PuzzlePiece[];
  onChange: (pieces: PuzzlePiece[]) => void;
}) {
  const detector = new PuzzlePieceDetector();

  if (pieces.length === 0) return null;

  return (
    <div className="space-y-2 rounded-2xl border border-white/10 bg-[#12151a] p-3">
      <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
        Correction détection
      </p>
      <div className="flex max-h-40 flex-wrap gap-2 overflow-auto">
        {pieces.map((p) => (
          <button
            key={p.id}
            type="button"
            className="rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-xs text-cyan-200"
            onClick={() => onChange(detector.removePiece(pieces, p.id))}
            title="Supprimer fausse pièce"
          >
            {p.code} ✕
          </button>
        ))}
      </div>
      {pieces.length >= 2 && (
        <PrimaryButton
          variant="ghost"
          onClick={() =>
            onChange(detector.mergePieces(pieces, pieces[0]!.id, pieces[1]!.id))
          }
        >
          Fusionner P001 + P002
        </PrimaryButton>
      )}
    </div>
  );
}
