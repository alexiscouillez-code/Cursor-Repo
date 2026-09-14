"use client";

import type { PuzzlePiece } from "@/types/puzzle";

/** Draws tap targets + X marks on assembled pieces over a scan image. */
export function ScanPieceOverlay({
  pieces,
  imageWidth,
  imageHeight,
  onToggleAssembled,
}: {
  pieces: PuzzlePiece[];
  imageWidth: number;
  imageHeight: number;
  onToggleAssembled: (pieceId: string) => void;
}) {
  if (!pieces.length || !imageWidth || !imageHeight) return null;

  return (
    <div className="pointer-events-none absolute inset-0">
      {pieces.map((piece) => {
        const left = (piece.boundingBox.x / imageWidth) * 100;
        const top = (piece.boundingBox.y / imageHeight) * 100;
        const width = (piece.boundingBox.width / imageWidth) * 100;
        const height = (piece.boundingBox.height / imageHeight) * 100;
        return (
          <button
            key={piece.id}
            type="button"
            className={`pointer-events-auto absolute box-border border ${
              piece.isAssembled
                ? "border-rose-400/80 bg-rose-500/15"
                : "border-cyan-400/50 bg-cyan-400/5"
            }`}
            style={{
              left: `${left}%`,
              top: `${top}%`,
              width: `${width}%`,
              height: `${height}%`,
            }}
            onClick={() => onToggleAssembled(piece.id)}
            title={
              piece.isAssembled
                ? `${piece.code} assemblée — toucher pour annuler`
                : `${piece.code} — marquer assemblée`
            }
            aria-label={
              piece.isAssembled
                ? `Retirer croix ${piece.code}`
                : `Marquer ${piece.code} assemblée`
            }
          >
            <span className="absolute left-0.5 top-0.5 rounded bg-black/70 px-1 text-[9px] text-white">
              {piece.code}
            </span>
            {piece.isAssembled && (
              <span
                className="absolute inset-0 flex items-center justify-center"
                aria-hidden
              >
                <span className="relative block h-[55%] w-[55%]">
                  <span className="absolute left-1/2 top-0 h-full w-[4px] -translate-x-1/2 rotate-45 rounded-full bg-rose-400" />
                  <span className="absolute left-1/2 top-0 h-full w-[4px] -translate-x-1/2 -rotate-45 rounded-full bg-rose-400" />
                </span>
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
