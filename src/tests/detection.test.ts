import { describe, expect, it } from "vitest";
import { PuzzlePieceDetector } from "@/lib/vision/PuzzlePieceDetector";

function syntheticPiecesImage(
  width: number,
  height: number,
  rects: Array<{ x: number; y: number; w: number; h: number }>,
): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  // dark background
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 20;
    data[i + 1] = 20;
    data[i + 2] = 24;
    data[i + 3] = 255;
  }
  for (const r of rects) {
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.w; x++) {
        const i = (y * width + x) * 4;
        data[i] = 200;
        data[i + 1] = 180;
        data[i + 2] = 120;
        data[i + 3] = 255;
      }
    }
  }
  return { data, width, height, colorSpace: "srgb" } as ImageData;
}

describe("piece detection", () => {
  it("detects separated blobs and numbers them", async () => {
    const image = syntheticPiecesImage(200, 120, [
      { x: 10, y: 10, w: 40, h: 40 },
      { x: 70, y: 15, w: 35, h: 35 },
      { x: 130, y: 20, w: 45, h: 40 },
    ]);
    const detector = new PuzzlePieceDetector();
    const result = await detector.detectFromImageData(image, {
      puzzleId: "p1",
      scanId: "s1",
      minAreaRatio: 0.005,
    });
    expect(result.pieceCount).toBeGreaterThanOrEqual(3);
    expect(result.pieces[0]?.code).toBe("P001");
    expect(result.pieces[1]?.code).toBe("P002");
  });

  it("warns when nothing is detected", async () => {
    const image = syntheticPiecesImage(80, 80, []);
    const detector = new PuzzlePieceDetector();
    const result = await detector.detectFromImageData(image, {
      puzzleId: "p1",
      scanId: "s1",
    });
    expect(result.pieceCount).toBe(0);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("can remove a false piece and renumber", () => {
    const detector = new PuzzlePieceDetector();
    const pieces = [
      {
        id: "a",
        code: "P001",
        puzzleId: "p",
        scanId: "s",
        boundingBox: { x: 0, y: 0, width: 10, height: 10 },
        geometry: {
          contour: [],
          area: 1,
          perimeter: 1,
          width: 10,
          height: 10,
          center: { x: 5, y: 5 },
          orientation: 0,
          ratio: 1,
          convexity: 1,
        },
        edges: [],
        colors: {
          dominantColors: [],
          histogram: [],
          meanBrightness: 0,
          meanSaturation: 0,
          edgeZoneColors: { TOP: [], RIGHT: [], BOTTOM: [], LEFT: [] },
        },
        textures: {
          gradientMagnitude: 0,
          lineOrientation: 0,
          edgeContinuityHints: { TOP: [], RIGHT: [], BOTTOM: [], LEFT: [] },
          textureEnergy: 0,
        },
        isCorner: false,
        isBorder: false,
        createdAt: 0,
      },
      {
        id: "b",
        code: "P002",
        puzzleId: "p",
        scanId: "s",
        boundingBox: { x: 20, y: 0, width: 10, height: 10 },
        geometry: {
          contour: [],
          area: 1,
          perimeter: 1,
          width: 10,
          height: 10,
          center: { x: 25, y: 5 },
          orientation: 0,
          ratio: 1,
          convexity: 1,
        },
        edges: [],
        colors: {
          dominantColors: [],
          histogram: [],
          meanBrightness: 0,
          meanSaturation: 0,
          edgeZoneColors: { TOP: [], RIGHT: [], BOTTOM: [], LEFT: [] },
        },
        textures: {
          gradientMagnitude: 0,
          lineOrientation: 0,
          edgeContinuityHints: { TOP: [], RIGHT: [], BOTTOM: [], LEFT: [] },
          textureEnergy: 0,
        },
        isCorner: false,
        isBorder: false,
        createdAt: 0,
      },
    ];
    const next = detector.removePiece(pieces, "a");
    expect(next).toHaveLength(1);
    expect(next[0]?.code).toBe("P001");
  });
});
