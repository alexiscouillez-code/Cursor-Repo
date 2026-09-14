import type {
  BoundingBox,
  GroupConnection,
  GroupCode,
  PieceMatch,
  PuzzleGroup,
  PuzzlePiece,
} from "@/types/puzzle";

export class PuzzleGroupEngine {
  createFromMatch(
    puzzleId: string,
    match: PieceMatch,
    existingGroups: PuzzleGroup[],
    nextCodeIndex: number,
  ): { groups: PuzzleGroup[]; created?: PuzzleGroup; merged?: PuzzleGroup } {
    const groupA = existingGroups.find((g) =>
      g.pieceIds.includes(match.pieceAId),
    );
    const groupB = existingGroups.find((g) =>
      g.pieceIds.includes(match.pieceBId),
    );

    const connection: GroupConnection = {
      pieceAId: match.pieceAId,
      pieceBId: match.pieceBId,
      sideA: match.sideA,
      sideB: match.sideB,
      matchId: match.id,
    };

    if (!groupA && !groupB) {
      const created: PuzzleGroup = {
        id: cryptoRandomId(),
        code: this.formatCode(nextCodeIndex),
        puzzleId,
        pieceIds: [match.pieceAId, match.pieceBId],
        connections: [connection],
        origin: { x: 0, y: 0 },
        orientation: 0,
        boundingBox: { x: 0, y: 0, width: 100, height: 100 },
        confidence: match.confidence,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      return { groups: [...existingGroups, created], created };
    }

    if (groupA && !groupB) {
      const updated = this.addPiece(groupA, match.pieceBId, connection, match.confidence);
      return {
        groups: existingGroups.map((g) => (g.id === updated.id ? updated : g)),
        merged: updated,
      };
    }

    if (!groupA && groupB) {
      const updated = this.addPiece(groupB, match.pieceAId, connection, match.confidence);
      return {
        groups: existingGroups.map((g) => (g.id === updated.id ? updated : g)),
        merged: updated,
      };
    }

    // Merge two groups
    if (groupA && groupB && groupA.id !== groupB.id) {
      const merged = this.mergeGroups(groupA, groupB, connection, match.confidence);
      return {
        groups: [
          ...existingGroups.filter((g) => g.id !== groupA.id && g.id !== groupB.id),
          merged,
        ],
        merged,
      };
    }

    // Already same group — just add connection
    if (groupA) {
      const updated: PuzzleGroup = {
        ...groupA,
        connections: [...groupA.connections, connection],
        confidence: (groupA.confidence + match.confidence) / 2,
        updatedAt: Date.now(),
      };
      return {
        groups: existingGroups.map((g) => (g.id === updated.id ? updated : g)),
        merged: updated,
      };
    }

    return { groups: existingGroups };
  }

  undoMatch(
    groups: PuzzleGroup[],
    matchId: string,
  ): PuzzleGroup[] {
    return groups
      .map((g) => {
        const connections = g.connections.filter((c) => c.matchId !== matchId);
        if (connections.length === g.connections.length) return g;
        if (connections.length === 0) return null;
        const pieceIds = this.piecesFromConnections(connections);
        return {
          ...g,
          connections,
          pieceIds,
          updatedAt: Date.now(),
        };
      })
      .filter((g): g is PuzzleGroup => g !== null);
  }

  canAssembleGroups(
    a: PuzzleGroup,
    b: PuzzleGroup,
    pieces: PuzzlePiece[],
    candidateMatches: PieceMatch[],
  ): PieceMatch | null {
    const aSet = new Set(a.pieceIds);
    const bSet = new Set(b.pieceIds);
    const bridge = candidateMatches
      .filter(
        (m) =>
          (aSet.has(m.pieceAId) && bSet.has(m.pieceBId)) ||
          (aSet.has(m.pieceBId) && bSet.has(m.pieceAId)),
      )
      .sort((x, y) => y.score.global - x.score.global)[0];
    return bridge ?? null;
  }

  updateBoundingBox(group: PuzzleGroup, pieces: PuzzlePiece[]): PuzzleGroup {
    const groupPieces = pieces.filter((p) => group.pieceIds.includes(p.id));
    if (groupPieces.length === 0) return group;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of groupPieces) {
      minX = Math.min(minX, p.boundingBox.x);
      minY = Math.min(minY, p.boundingBox.y);
      maxX = Math.max(maxX, p.boundingBox.x + p.boundingBox.width);
      maxY = Math.max(maxY, p.boundingBox.y + p.boundingBox.height);
    }
    const boundingBox: BoundingBox = {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    };
    return { ...group, boundingBox, updatedAt: Date.now() };
  }

  formatCode(index: number): GroupCode {
    return `GROUP${String(index).padStart(3, "0")}`;
  }

  private addPiece(
    group: PuzzleGroup,
    pieceId: string,
    connection: GroupConnection,
    confidence: number,
  ): PuzzleGroup {
    return {
      ...group,
      pieceIds: group.pieceIds.includes(pieceId)
        ? group.pieceIds
        : [...group.pieceIds, pieceId],
      connections: [...group.connections, connection],
      confidence: (group.confidence + confidence) / 2,
      updatedAt: Date.now(),
    };
  }

  private mergeGroups(
    a: PuzzleGroup,
    b: PuzzleGroup,
    connection: GroupConnection,
    confidence: number,
  ): PuzzleGroup {
    return {
      ...a,
      pieceIds: Array.from(new Set([...a.pieceIds, ...b.pieceIds])),
      connections: [...a.connections, ...b.connections, connection],
      confidence: (a.confidence + b.confidence + confidence) / 3,
      updatedAt: Date.now(),
    };
  }

  private piecesFromConnections(connections: GroupConnection[]): string[] {
    const ids = new Set<string>();
    for (const c of connections) {
      ids.add(c.pieceAId);
      ids.add(c.pieceBId);
    }
    return Array.from(ids);
  }
}

function cryptoRandomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `g_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}
