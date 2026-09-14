"use client";

import type { PieceMatch, PuzzlePiece } from "@/types/puzzle";

function centerOf(piece: PuzzlePiece): { x: number; y: number } {
  return {
    x: piece.boundingBox.x + piece.boundingBox.width / 2,
    y: piece.boundingBox.y + piece.boundingBox.height / 2,
  };
}

function lineStyle(match: PieceMatch): {
  stroke: string;
  strokeWidth: number;
  dash?: string;
  opacity: number;
} {
  if (match.status === "confirmed") {
    return { stroke: "#34d399", strokeWidth: 4, opacity: 0.95 };
  }
  const score = match.score.global;
  if (score >= 85) {
    return { stroke: "#22d3ee", strokeWidth: 3.5, opacity: 0.9 };
  }
  if (score >= 70) {
    return { stroke: "#fbbf24", strokeWidth: 3, dash: "8 6", opacity: 0.85 };
  }
  return { stroke: "#a78bfa", strokeWidth: 2.5, dash: "5 7", opacity: 0.7 };
}

/** Draws match links + tap targets + X marks over a scan image. */
export function ScanPieceOverlay({
  pieces,
  matches = [],
  imageWidth,
  imageHeight,
  onToggleAssembled,
}: {
  pieces: PuzzlePiece[];
  matches?: PieceMatch[];
  imageWidth: number;
  imageHeight: number;
  onToggleAssembled: (pieceId: string) => void;
}) {
  if (!pieces.length || !imageWidth || !imageHeight) return null;

  const pieceMap = new Map(pieces.map((p) => [p.id, p]));
  const pieceIds = new Set(pieces.map((p) => p.id));

  const links = matches
    .filter(
      (m) =>
        m.status !== "rejected" &&
        pieceIds.has(m.pieceAId) &&
        pieceIds.has(m.pieceBId),
    )
    .sort((a, b) => {
      const rank = (m: PieceMatch) =>
        m.status === "confirmed" ? 1000 : m.score.global;
      return rank(b) - rank(a);
    })
    .slice(0, 24);

  return (
    <div className="pointer-events-none absolute inset-0">
      <svg
        className="absolute inset-0 h-full w-full overflow-visible"
        viewBox={`0 0 ${imageWidth} ${imageHeight}`}
        preserveAspectRatio="none"
        aria-hidden
      >
        {links.map((match) => {
          const a = pieceMap.get(match.pieceAId);
          const b = pieceMap.get(match.pieceBId);
          if (!a || !b) return null;
          const ca = centerOf(a);
          const cb = centerOf(b);
          const style = lineStyle(match);
          return (
            <g key={match.id}>
              <line
                x1={ca.x}
                y1={ca.y}
                x2={cb.x}
                y2={cb.y}
                stroke={style.stroke}
                strokeWidth={style.strokeWidth}
                strokeOpacity={style.opacity}
                strokeDasharray={style.dash}
                strokeLinecap="round"
              />
              <circle
                cx={(ca.x + cb.x) / 2}
                cy={(ca.y + cb.y) / 2}
                r={Math.max(10, Math.min(a.boundingBox.width, b.boundingBox.width) * 0.08)}
                fill={style.stroke}
                fillOpacity={0.2}
                stroke={style.stroke}
                strokeWidth={1.5}
                strokeOpacity={0.9}
              />
              <text
                x={(ca.x + cb.x) / 2}
                y={(ca.y + cb.y) / 2}
                textAnchor="middle"
                dominantBaseline="central"
                fill={style.stroke}
                fontSize={Math.max(11, Math.min(imageWidth, imageHeight) * 0.018)}
                fontWeight={700}
              >
                {match.status === "confirmed" ? "OK" : `${match.score.global}`}
              </text>
            </g>
          );
        })}
      </svg>

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
