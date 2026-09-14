import { describe, expect, it } from "vitest";
import type { PieceMatch, PuzzlePiece } from "@/types/puzzle";

function filterScanLinks(
  pieces: Array<Pick<PuzzlePiece, "id">>,
  matches: Array<
    Pick<PieceMatch, "id" | "pieceAId" | "pieceBId" | "status" | "score">
  >,
) {
  const ids = new Set(pieces.map((p) => p.id));
  return matches
    .filter(
      (m) =>
        m.status !== "rejected" &&
        ids.has(m.pieceAId) &&
        ids.has(m.pieceBId),
    )
    .sort((a, b) => {
      const rank = (m: (typeof matches)[number]) =>
        m.status === "confirmed" ? 1000 : m.score.global;
      return rank(b) - rank(a);
    })
    .slice(0, 24);
}

describe("scan match links", () => {
  it("keeps only non-rejected pairs present on the photo", () => {
    const links = filterScanLinks(
      [{ id: "a" }, { id: "b" }, { id: "c" }],
      [
        {
          id: "1",
          pieceAId: "a",
          pieceBId: "b",
          status: "candidate",
          score: { geometry: 0, color: 0, texture: 0, continuity: 0, referenceContext: null, global: 90 },
        },
        {
          id: "2",
          pieceAId: "a",
          pieceBId: "z",
          status: "candidate",
          score: { geometry: 0, color: 0, texture: 0, continuity: 0, referenceContext: null, global: 99 },
        },
        {
          id: "3",
          pieceAId: "b",
          pieceBId: "c",
          status: "rejected",
          score: { geometry: 0, color: 0, texture: 0, continuity: 0, referenceContext: null, global: 95 },
        },
        {
          id: "4",
          pieceAId: "b",
          pieceBId: "c",
          status: "confirmed",
          score: { geometry: 0, color: 0, texture: 0, continuity: 0, referenceContext: null, global: 70 },
        },
      ],
    );
    expect(links.map((l) => l.id)).toEqual(["4", "1"]);
  });
});
