import type {
  PieceMatch,
  PuzzleGroup,
  PuzzlePiece,
  PuzzleProgress,
  ReconstructionPlacement,
} from "@/types/puzzle";

export class PuzzleReconstructionEngine {
  initializePlacements(pieces: PuzzlePiece[]): ReconstructionPlacement[] {
    const gap = 16;
    const cols = Math.ceil(Math.sqrt(pieces.length));
    return pieces.map((piece, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      return {
        pieceId: piece.id,
        x: col * (piece.boundingBox.width + gap),
        y: row * (piece.boundingBox.height + gap),
        rotation: 0,
      };
    });
  }

  applyConfirmedMatch(
    placements: ReconstructionPlacement[],
    match: PieceMatch,
    pieces: PuzzlePiece[],
    groupId?: string,
  ): ReconstructionPlacement[] {
    const placeA = placements.find((p) => p.pieceId === match.pieceAId);
    const placeB = placements.find((p) => p.pieceId === match.pieceBId);
    const pieceA = pieces.find((p) => p.id === match.pieceAId);
    const pieceB = pieces.find((p) => p.id === match.pieceBId);
    if (!placeA || !placeB || !pieceA || !pieceB) return placements;

    const next = placements.map((p) => ({ ...p }));
    const a = next.find((p) => p.pieceId === match.pieceAId)!;
    const b = next.find((p) => p.pieceId === match.pieceBId)!;

    const offset = this.sideOffset(match.sideA, pieceA.boundingBox.width, pieceA.boundingBox.height);
    b.x = a.x + offset.x;
    b.y = a.y + offset.y;
    b.rotation = a.rotation;
    if (groupId) {
      a.groupId = groupId;
      b.groupId = groupId;
    }
    return next;
  }

  movePiece(
    placements: ReconstructionPlacement[],
    pieceId: string,
    x: number,
    y: number,
  ): ReconstructionPlacement[] {
    return placements.map((p) => (p.pieceId === pieceId ? { ...p, x, y } : p));
  }

  moveGroup(
    placements: ReconstructionPlacement[],
    group: PuzzleGroup,
    dx: number,
    dy: number,
  ): ReconstructionPlacement[] {
    const ids = new Set(group.pieceIds);
    return placements.map((p) =>
      ids.has(p.pieceId) ? { ...p, x: p.x + dx, y: p.y + dy } : p,
    );
  }

  rotatePiece(
    placements: ReconstructionPlacement[],
    pieceId: string,
    deltaDeg: number,
  ): ReconstructionPlacement[] {
    return placements.map((p) =>
      p.pieceId === pieceId ? { ...p, rotation: (p.rotation + deltaDeg) % 360 } : p,
    );
  }

  private sideOffset(
    side: PieceMatch["sideA"],
    width: number,
    height: number,
  ): { x: number; y: number } {
    switch (side) {
      case "RIGHT":
        return { x: width * 0.92, y: 0 };
      case "LEFT":
        return { x: -width * 0.92, y: 0 };
      case "BOTTOM":
        return { x: 0, y: height * 0.92 };
      case "TOP":
        return { x: 0, y: -height * 0.92 };
    }
  }
}

export class PuzzleProgressEngine {
  compute(input: {
    expectedPieces: number;
    pieces: PuzzlePiece[];
    confirmedMatches: PieceMatch[];
    groups: PuzzleGroup[];
  }): PuzzleProgress {
    const piecesTotal = Math.max(input.expectedPieces, input.pieces.length);
    const piecesIdentified = input.pieces.length;
    const connectionsConfirmed = input.confirmedMatches.length;
    const groupsCount = input.groups.length;

    const borderPieces = input.pieces.filter((p) => p.isBorder);
    const connectedIds = new Set<string>();
    for (const m of input.confirmedMatches) {
      connectedIds.add(m.pieceAId);
      connectedIds.add(m.pieceBId);
    }
    const borderPiecesPlaced = borderPieces.filter((p) => connectedIds.has(p.id)).length;

    const spatialCoverage =
      piecesTotal === 0
        ? 0
        : Math.min(1, connectedIds.size / piecesTotal);

    const confidences = input.confirmedMatches.map((m) => m.confidence);
    const averageConfidence =
      confidences.length === 0
        ? 0
        : confidences.reduce((a, b) => a + b, 0) / confidences.length;

    // Multi-factor progress (not just assembled/total)
    const identifiedFactor = piecesTotal ? piecesIdentified / piecesTotal : 0;
    const connectionFactor = piecesTotal
      ? Math.min(1, connectionsConfirmed / Math.max(1, piecesTotal - 1))
      : 0;
    const groupFactor = piecesTotal
      ? Math.min(1, groupsCount / Math.max(1, piecesTotal / 4))
      : 0;
    const borderFactor = borderPieces.length
      ? borderPiecesPlaced / borderPieces.length
      : 0;

    const estimatedPercent = Math.round(
      100 *
        (0.25 * identifiedFactor +
          0.35 * connectionFactor +
          0.15 * groupFactor +
          0.15 * spatialCoverage +
          0.1 * borderFactor),
    );
    // Ensure tiny but real progress once pieces are identified
    const floored =
      piecesIdentified > 0
        ? Math.max(1, estimatedPercent)
        : estimatedPercent;

    return {
      piecesTotal,
      piecesIdentified,
      connectionsConfirmed,
      groupsCount,
      borderPiecesPlaced,
      spatialCoverage,
      averageConfidence,
      estimatedPercent: Math.min(100, floored),
    };
  }
}
