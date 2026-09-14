import { describe, expect, it } from "vitest";
import {
  complementarySides,
  normalizeProfile,
  profileCorrelation,
  polygonArea,
} from "@/lib/geometry/math";
import { PuzzlePieceAnalyzer } from "@/lib/geometry/PuzzlePieceAnalyzer";
import { PuzzleMatchingEngine } from "@/lib/matching/PuzzleMatchingEngine";
import { PuzzleGroupEngine } from "@/lib/reconstruction/PuzzleGroupEngine";
import { PuzzleProgressEngine } from "@/lib/reconstruction/PuzzleReconstructionEngine";
import { PuzzleAssistant } from "@/lib/analysis/PuzzleAssistant";
import {
  parseReferenceAnalysis,
  PuzzleReferenceAnalyzer,
} from "@/lib/analysis/PuzzleReferenceAnalyzer";
import type { PieceMatch, PuzzlePiece, PuzzleProject } from "@/types/puzzle";

function makePiece(
  code: string,
  edges: Array<{ side: "TOP" | "RIGHT" | "BOTTOM" | "LEFT"; type: "EDGE" | "TAB" | "BLANK" | "INNER"; profile?: number[] }>,
): PuzzlePiece {
  const analyzer = new PuzzlePieceAnalyzer();
  const contour = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ];
  const geometry = analyzer.analyzeGeometry(contour);
  const fullEdges = analyzer.analyzeEdges(contour, geometry).map((e) => {
    const override = edges.find((x) => x.side === e.side);
    if (!override) return e;
    const profile = override.profile ?? e.profile;
    return {
      ...e,
      type: override.type,
      profile,
      signature: {
        ...e.signature,
        tabType: override.type,
        normalizedProfile: profile,
      },
    };
  });

  return {
    id: code,
    code,
    puzzleId: "p1",
    scanId: "s1",
    boundingBox: { x: 0, y: 0, width: 100, height: 100 },
    geometry,
    edges: fullEdges,
    colors: {
      dominantColors: ["#224466"],
      histogram: Array.from({ length: 24 }, () => 1 / 24),
      meanBrightness: 0.5,
      meanSaturation: 0.3,
      edgeZoneColors: {
        TOP: Array.from({ length: 8 }, () => 0.125),
        RIGHT: Array.from({ length: 8 }, () => 0.125),
        BOTTOM: Array.from({ length: 8 }, () => 0.125),
        LEFT: Array.from({ length: 8 }, () => 0.125),
      },
    },
    textures: {
      gradientMagnitude: 1,
      lineOrientation: 0,
      edgeContinuityHints: {
        TOP: Array.from({ length: 32 }, () => 0.5),
        RIGHT: Array.from({ length: 32 }, (_, i) => i / 32),
        BOTTOM: Array.from({ length: 32 }, () => 0.5),
        LEFT: Array.from({ length: 32 }, (_, i) => (31 - i) / 32),
      },
      textureEnergy: 1,
    },
    isCorner: fullEdges.filter((e) => e.type === "EDGE").length === 2,
    isBorder: fullEdges.some((e) => e.type === "EDGE"),
    createdAt: 0,
  };
}

describe("geometry", () => {
  it("computes polygon area", () => {
    expect(polygonArea([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ])).toBe(100);
  });

  it("correlates complementary profiles", () => {
    const a = normalizeProfile([0, 0, 1, 2, 1, 0, 0]);
    const b = normalizeProfile([0, 0, -1, -2, -1, 0, 0]);
    expect(profileCorrelation(a, b)).toBeGreaterThan(0.5);
  });

  it("maps complementary sides", () => {
    expect(complementarySides("RIGHT")).toBe("LEFT");
    expect(complementarySides("TOP")).toBe("BOTTOM");
  });
});

describe("edge classification", () => {
  it("detects corner pieces", () => {
    const analyzer = new PuzzlePieceAnalyzer();
    const piece = makePiece("P001", [
      { side: "TOP", type: "EDGE" },
      { side: "LEFT", type: "EDGE" },
      { side: "RIGHT", type: "TAB" },
      { side: "BOTTOM", type: "BLANK" },
    ]);
    expect(analyzer.isCornerPiece(piece.edges)).toBe(true);
  });
});

describe("matching", () => {
  it("rejects TAB-TAB", () => {
    const engine = new PuzzleMatchingEngine();
    const a = makePiece("P001", [
      { side: "RIGHT", type: "TAB", profile: normalizeProfile([0, 1, 2, 1, 0]) },
      { side: "LEFT", type: "BLANK" },
      { side: "TOP", type: "INNER" },
      { side: "BOTTOM", type: "INNER" },
    ]);
    const b = makePiece("P002", [
      { side: "LEFT", type: "TAB", profile: normalizeProfile([0, 1, 2, 1, 0]) },
      { side: "RIGHT", type: "BLANK" },
      { side: "TOP", type: "INNER" },
      { side: "BOTTOM", type: "INNER" },
    ]);
    const match = engine.scorePair(a, b, "RIGHT", "LEFT");
    expect(match.score.geometry).toBeLessThan(35);
    expect(match.score.global).toBeLessThanOrEqual(40);
  });

  it("scores TAB-BLANK highly when profiles complement", () => {
    const engine = new PuzzleMatchingEngine();
    const profile = normalizeProfile([0, 0.2, 1.5, 2, 1.5, 0.2, 0]);
    const complement = normalizeProfile([0, -0.2, -1.5, -2, -1.5, -0.2, 0]);
    const a = makePiece("P001", [
      { side: "RIGHT", type: "TAB", profile },
      { side: "LEFT", type: "INNER" },
      { side: "TOP", type: "INNER" },
      { side: "BOTTOM", type: "INNER" },
    ]);
    const b = makePiece("P002", [
      { side: "LEFT", type: "BLANK", profile: complement },
      { side: "RIGHT", type: "INNER" },
      { side: "TOP", type: "INNER" },
      { side: "BOTTOM", type: "INNER" },
    ]);
    const match = engine.scorePair(a, b, "RIGHT", "LEFT");
    expect(match.score.geometry).toBeGreaterThan(50);
    expect(match.explanations.some((e) => e.positive)).toBe(true);
  });

  it("does not let color rescue geometric incompatibility", () => {
    const engine = new PuzzleMatchingEngine();
    const a = makePiece("P001", [
      { side: "RIGHT", type: "TAB" },
      { side: "LEFT", type: "INNER" },
      { side: "TOP", type: "INNER" },
      { side: "BOTTOM", type: "INNER" },
    ]);
    const b = makePiece("P002", [
      { side: "LEFT", type: "TAB" },
      { side: "RIGHT", type: "INNER" },
      { side: "TOP", type: "INNER" },
      { side: "BOTTOM", type: "INNER" },
    ]);
    // identical colors
    b.colors = a.colors;
    const match = engine.scorePair(a, b, "RIGHT", "LEFT");
    expect(match.score.global).toBeLessThan(50);
  });
});

describe("groups", () => {
  it("creates and extends groups from confirmed matches", () => {
    const engine = new PuzzleGroupEngine();
    const m1: PieceMatch = {
      id: "m1",
      puzzleId: "p1",
      pieceAId: "P001",
      pieceBId: "P002",
      pieceACode: "P001",
      pieceBCode: "P002",
      sideA: "RIGHT",
      sideB: "LEFT",
      score: {
        geometry: 90,
        color: 80,
        texture: 70,
        continuity: 70,
        referenceContext: null,
        global: 85,
      },
      confidence: 0.9,
      explanations: [],
      status: "confirmed",
      createdAt: 0,
    };
    const { groups, created } = engine.createFromMatch("p1", m1, [], 1);
    expect(created?.code).toBe("GROUP001");
    expect(groups[0]?.pieceIds).toEqual(["P001", "P002"]);

    const m2 = { ...m1, id: "m2", pieceAId: "P002", pieceBId: "P003", pieceACode: "P002", pieceBCode: "P003" };
    const next = engine.createFromMatch("p1", m2, groups, 2);
    expect(next.groups).toHaveLength(1);
    expect(next.groups[0]?.pieceIds).toContain("P003");
  });

  it("undoes a match connection", () => {
    const engine = new PuzzleGroupEngine();
    const m1: PieceMatch = {
      id: "m1",
      puzzleId: "p1",
      pieceAId: "A",
      pieceBId: "B",
      pieceACode: "P001",
      pieceBCode: "P002",
      sideA: "RIGHT",
      sideB: "LEFT",
      score: {
        geometry: 90,
        color: 80,
        texture: 70,
        continuity: 70,
        referenceContext: null,
        global: 85,
      },
      confidence: 0.9,
      explanations: [],
      status: "confirmed",
      createdAt: 0,
    };
    const { groups } = engine.createFromMatch("p1", m1, [], 1);
    expect(engine.undoMatch(groups, "m1")).toHaveLength(0);
  });
});

describe("progress", () => {
  it("uses multi-factor progress not only assembled ratio", () => {
    const engine = new PuzzleProgressEngine();
    const pieces = [
      makePiece("P001", [
        { side: "TOP", type: "EDGE" },
        { side: "LEFT", type: "EDGE" },
        { side: "RIGHT", type: "TAB" },
        { side: "BOTTOM", type: "BLANK" },
      ]),
      makePiece("P002", [
        { side: "TOP", type: "INNER" },
        { side: "LEFT", type: "BLANK" },
        { side: "RIGHT", type: "TAB" },
        { side: "BOTTOM", type: "INNER" },
      ]),
    ];
    const progress = engine.compute({
      expectedPieces: 100,
      pieces,
      confirmedMatches: [],
      groups: [],
    });
    expect(progress.piecesIdentified).toBe(2);
    expect(progress.piecesAssembled).toBe(0);
    expect(progress.estimatedPercent).toBeGreaterThan(0);
    expect(progress.estimatedPercent).toBeLessThan(20);
  });

  it("counts assembled pieces and raises progress", () => {
    const engine = new PuzzleProgressEngine();
    const assembled = makePiece("P001", [
      { side: "TOP", type: "EDGE" },
      { side: "LEFT", type: "EDGE" },
      { side: "RIGHT", type: "TAB" },
      { side: "BOTTOM", type: "BLANK" },
    ]);
    assembled.isAssembled = true;
    const pieces = [
      assembled,
      makePiece("P002", [
        { side: "TOP", type: "INNER" },
        { side: "LEFT", type: "BLANK" },
        { side: "RIGHT", type: "TAB" },
        { side: "BOTTOM", type: "INNER" },
      ]),
    ];
    const progress = engine.compute({
      expectedPieces: 100,
      pieces,
      confirmedMatches: [],
      groups: [],
    });
    expect(progress.piecesAssembled).toBe(1);
    const without = engine.compute({
      expectedPieces: 100,
      pieces: pieces.map((p) => ({ ...p, isAssembled: false })),
      confirmedMatches: [],
      groups: [],
    });
    expect(progress.estimatedPercent).toBeGreaterThanOrEqual(
      without.estimatedPercent,
    );
  });
});

describe("assistant & reference analyzer", () => {
  it("parses invalid analysis payload safely", () => {
    const parsed = parseReferenceAnalysis({ foo: "bar" });
    expect(parsed.source).toBe("unavailable");
  });

  it("classifies color palette into regions without AI", () => {
    const analyzer = new PuzzleReferenceAnalyzer();
    const analysis = analyzer.analyzeFromColors([
      "#87CEEB",
      "#228B22",
      "#6B4F2A",
    ]);
    expect(analysis.source).toBe("heuristic");
    expect(analysis.regions.length).toBeGreaterThan(0);
  });

  it("analyzes synthetic ImageData into engine regions", () => {
    const width = 90;
    const height = 90;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        if (y < 30) {
          data[i] = 120;
          data[i + 1] = 180;
          data[i + 2] = 240;
        } else if (y < 60) {
          data[i] = 40;
          data[i + 1] = 140;
          data[i + 2] = 50;
        } else {
          data[i] = 120;
          data[i + 1] = 90;
          data[i + 2] = 40;
        }
        data[i + 3] = 255;
      }
    }
    const imageData = { data, width, height, colorSpace: "srgb" } as ImageData;
    const analysis = new PuzzleReferenceAnalyzer().analyzeImageData(imageData);
    expect(analysis.source).toBe("engine");
    expect(analysis.regions.some((r) => r.name === "sky")).toBe(true);
    expect(analysis.regions.some((r) => r.name === "forest" || r.name === "ground")).toBe(
      true,
    );
  });

  it("answers from engine data only", () => {
    const assistant = new PuzzleAssistant();
    const project = {
      id: "p1",
      name: "Test",
      expectedPieces: 50,
      createdAt: 0,
      updatedAt: 0,
      scans: [],
      pieces: [
        {
          ...makePiece("P037", [
            { side: "TOP", type: "INNER" },
            { side: "LEFT", type: "INNER" },
            { side: "RIGHT", type: "TAB" },
            { side: "BOTTOM", type: "BLANK" },
          ]),
          regionHint: { name: "sky", confidence: 0.87 },
        },
      ],
      matches: [],
      groups: [],
      placements: [],
      history: [],
      progress: {
        piecesTotal: 50,
        piecesIdentified: 1,
        piecesAssembled: 0,
        connectionsConfirmed: 0,
        groupsCount: 0,
        borderPiecesPlaced: 0,
        spatialCoverage: 0,
        averageConfidence: 0,
        estimatedPercent: 2,
      },
    } as PuzzleProject;

    const reply = assistant.answer(project, "Où sont les pièces du ciel ?");
    expect(reply.message).toContain("1");
    expect(reply.message).toContain("P037");
    expect(reply.sources.length).toBeGreaterThan(0);
  });

  it("does not invent match scores", () => {
    const assistant = new PuzzleAssistant();
    const project = {
      id: "p1",
      name: "Test",
      expectedPieces: 10,
      createdAt: 0,
      updatedAt: 0,
      scans: [],
      pieces: [],
      matches: [],
      groups: [],
      placements: [],
      history: [],
      progress: {
        piecesTotal: 10,
        piecesIdentified: 0,
        piecesAssembled: 0,
        connectionsConfirmed: 0,
        groupsCount: 0,
        borderPiecesPlaced: 0,
        spatialCoverage: 0,
        averageConfidence: 0,
        estimatedPercent: 0,
      },
    } as PuzzleProject;
    const reply = assistant.answer(project, "Quelle pièce dois-je essayer ?");
    expect(reply.message.toLowerCase()).toContain("scan");
  });
});
