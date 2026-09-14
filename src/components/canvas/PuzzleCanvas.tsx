"use client";

import { useMemo, useRef, useState } from "react";
import type { PieceMatch, PuzzleGroup, PuzzlePiece, ReconstructionPlacement } from "@/types/puzzle";

export function PuzzleCanvas({
  pieces,
  placements,
  matches,
  groups,
  onMove,
  onToggleAssembled,
}: {
  pieces: PuzzlePiece[];
  placements: ReconstructionPlacement[];
  matches: PieceMatch[];
  groups: PuzzleGroup[];
  onMove: (pieceId: string, x: number, y: number) => void;
  onToggleAssembled?: (pieceId: string) => void;
}) {
  const [scale, setScale] = useState(0.45);
  const [offset, setOffset] = useState({ x: 40, y: 40 });
  const [showNumbers, setShowNumbers] = useState(true);
  const drag = useRef<{
    pieceId: string | null;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    panning: boolean;
  }>({
    pieceId: null,
    startX: 0,
    startY: 0,
    originX: 0,
    originY: 0,
    panning: false,
  });

  const pieceMap = useMemo(() => new Map(pieces.map((p) => [p.id, p])), [pieces]);
  const confirmed = matches.filter((m) => m.status === "confirmed");

  return (
    <div className="space-y-3 pb-24">
      <div className="flex flex-wrap gap-2 text-xs">
        <button
          type="button"
          className="min-h-11 rounded-lg bg-white/5 px-3 text-zinc-300"
          onClick={() => setScale((s) => Math.min(2, s + 0.1))}
        >
          Zoom +
        </button>
        <button
          type="button"
          className="min-h-11 rounded-lg bg-white/5 px-3 text-zinc-300"
          onClick={() => setScale((s) => Math.max(0.15, s - 0.1))}
        >
          Zoom −
        </button>
        <button
          type="button"
          className="min-h-11 rounded-lg bg-white/5 px-3 text-zinc-300"
          onClick={() => setShowNumbers((v) => !v)}
        >
          {showNumbers ? "Masquer n°" : "Afficher n°"}
        </button>
        <span className="flex min-h-11 items-center text-zinc-500">
          {groups.length} groupe{groups.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div
        className="relative h-[62vh] overflow-hidden rounded-2xl border border-white/10 bg-[linear-gradient(180deg,#0b0d10,#101820)] touch-none"
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).dataset.piece) return;
          drag.current.panning = true;
          drag.current.startX = e.clientX;
          drag.current.startY = e.clientY;
          drag.current.originX = offset.x;
          drag.current.originY = offset.y;
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (drag.current.panning) {
            setOffset({
              x: drag.current.originX + (e.clientX - drag.current.startX),
              y: drag.current.originY + (e.clientY - drag.current.startY),
            });
            return;
          }
          if (!drag.current.pieceId) return;
          const dx = (e.clientX - drag.current.startX) / scale;
          const dy = (e.clientY - drag.current.startY) / scale;
          onMove(
            drag.current.pieceId,
            drag.current.originX + dx,
            drag.current.originY + dy,
          );
        }}
        onPointerUp={() => {
          drag.current.pieceId = null;
          drag.current.panning = false;
        }}
      >
        <div
          className="absolute origin-top-left"
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
          }}
        >
          <svg className="pointer-events-none absolute inset-0 overflow-visible" width={4000} height={4000}>
            {confirmed.map((m) => {
              const a = placements.find((p) => p.pieceId === m.pieceAId);
              const b = placements.find((p) => p.pieceId === m.pieceBId);
              const pa = pieceMap.get(m.pieceAId);
              const pb = pieceMap.get(m.pieceBId);
              if (!a || !b || !pa || !pb) return null;
              return (
                <line
                  key={m.id}
                  x1={a.x + pa.boundingBox.width / 2}
                  y1={a.y + pa.boundingBox.height / 2}
                  x2={b.x + pb.boundingBox.width / 2}
                  y2={b.y + pb.boundingBox.height / 2}
                  stroke="#22d3ee"
                  strokeWidth={3}
                  strokeOpacity={0.7}
                />
              );
            })}
          </svg>

          {placements.map((placement) => {
            const piece = pieceMap.get(placement.pieceId);
            if (!piece) return null;
            return (
              <div
                key={placement.pieceId}
                data-piece="1"
                className="absolute cursor-grab active:cursor-grabbing"
                style={{
                  left: placement.x,
                  top: placement.y,
                  width: piece.boundingBox.width,
                  height: piece.boundingBox.height,
                  transform: `rotate(${placement.rotation}deg)`,
                }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  drag.current.pieceId = placement.pieceId;
                  drag.current.startX = e.clientX;
                  drag.current.startY = e.clientY;
                  drag.current.originX = placement.x;
                  drag.current.originY = placement.y;
                  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  onToggleAssembled?.(piece.id);
                }}
              >
                {piece.thumbnailDataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={piece.thumbnailDataUrl}
                    alt={piece.code}
                    className={`h-full w-full rounded-sm border object-cover ${
                      piece.isAssembled
                        ? "border-rose-400/50 opacity-45 grayscale"
                        : "border-cyan-500/30"
                    }`}
                    draggable={false}
                  />
                ) : (
                  <div
                    className={`flex h-full w-full items-center justify-center rounded-sm border text-[10px] ${
                      piece.isAssembled
                        ? "border-rose-400/50 bg-rose-500/10 text-rose-200"
                        : "border-cyan-500/30 bg-white/5 text-cyan-200"
                    }`}
                  >
                    {piece.code}
                  </div>
                )}
                {piece.isAssembled && (
                  <span
                    className="pointer-events-none absolute inset-0 flex items-center justify-center"
                    aria-hidden
                  >
                    <span className="relative block h-[55%] w-[55%]">
                      <span className="absolute left-1/2 top-0 h-full w-[4px] -translate-x-1/2 rotate-45 rounded-full bg-rose-400" />
                      <span className="absolute left-1/2 top-0 h-full w-[4px] -translate-x-1/2 -rotate-45 rounded-full bg-rose-400" />
                    </span>
                  </span>
                )}
                {showNumbers && (
                  <span className="absolute left-1 top-1 rounded bg-black/70 px-1 text-[10px] text-cyan-200">
                    {piece.code}
                    {piece.isAssembled ? " ✓" : ""}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
