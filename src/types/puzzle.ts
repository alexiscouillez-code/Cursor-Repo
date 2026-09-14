/** Core domain types for Puzzle Solver 2D V5 */

export type PieceCode = string; // e.g. P001
export type GroupCode = string; // e.g. GROUP001
export type EdgeSide = "TOP" | "RIGHT" | "BOTTOM" | "LEFT";
export type EdgeTabType = "EDGE" | "INNER" | "TAB" | "BLANK";

export interface Point2D {
  x: number;
  y: number;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface EdgeSignature {
  length: number;
  normalizedProfile: number[];
  curvature: number;
  extrema: number[];
  tabType: EdgeTabType;
  confidence: number;
}

export interface PieceEdge {
  side: EdgeSide;
  length: number;
  curvature: number;
  profile: number[];
  type: EdgeTabType;
  position: Point2D;
  signature: EdgeSignature;
}

export interface PieceGeometry {
  contour: Point2D[];
  area: number;
  perimeter: number;
  width: number;
  height: number;
  center: Point2D;
  orientation: number;
  ratio: number;
  convexity: number;
}

export interface ColorFeatures {
  dominantColors: string[];
  histogram: number[];
  meanBrightness: number;
  meanSaturation: number;
  edgeZoneColors: Record<EdgeSide, number[]>;
}

export interface TextureFeatures {
  gradientMagnitude: number;
  lineOrientation: number;
  edgeContinuityHints: Record<EdgeSide, number[]>;
  textureEnergy: number;
}

export interface PuzzlePiece {
  id: string;
  code: PieceCode;
  puzzleId: string;
  scanId: string;
  boundingBox: BoundingBox;
  maskPath?: string;
  thumbnailDataUrl?: string;
  geometry: PieceGeometry;
  edges: PieceEdge[];
  colors: ColorFeatures;
  textures: TextureFeatures;
  isCorner: boolean;
  isBorder: boolean;
  regionHint?: {
    name: string;
    confidence: number;
  };
  createdAt: number;
}

export interface MatchExplanation {
  label: string;
  positive: boolean;
}

export interface MatchScoreBreakdown {
  geometry: number;
  color: number;
  texture: number;
  continuity: number;
  referenceContext: number | null;
  global: number;
}

export interface MatchWeights {
  geometry: number;
  color: number;
  texture: number;
  continuity: number;
  referenceContext: number;
}

export const DEFAULT_MATCH_WEIGHTS: MatchWeights = {
  geometry: 0.45,
  color: 0.18,
  texture: 0.17,
  continuity: 0.15,
  referenceContext: 0.05,
};

export interface PieceMatch {
  id: string;
  puzzleId: string;
  pieceAId: string;
  pieceBId: string;
  pieceACode: PieceCode;
  pieceBCode: PieceCode;
  sideA: EdgeSide;
  sideB: EdgeSide;
  score: MatchScoreBreakdown;
  confidence: number;
  explanations: MatchExplanation[];
  status: "candidate" | "confirmed" | "rejected";
  createdAt: number;
}

export interface GroupConnection {
  pieceAId: string;
  pieceBId: string;
  sideA: EdgeSide;
  sideB: EdgeSide;
  matchId: string;
}

export interface PuzzleGroup {
  id: string;
  code: GroupCode;
  puzzleId: string;
  pieceIds: string[];
  connections: GroupConnection[];
  origin: Point2D;
  orientation: number;
  boundingBox: BoundingBox;
  confidence: number;
  createdAt: number;
  updatedAt: number;
}

export interface ReconstructionPlacement {
  pieceId: string;
  x: number;
  y: number;
  rotation: number;
  groupId?: string;
}

export interface PuzzleProgress {
  piecesTotal: number;
  piecesIdentified: number;
  connectionsConfirmed: number;
  groupsCount: number;
  borderPiecesPlaced: number;
  spatialCoverage: number;
  averageConfidence: number;
  estimatedPercent: number;
}

export interface ReferenceRegion {
  name: string;
  position: "top" | "bottom" | "left" | "right" | "center" | "top-left" | "top-right" | "bottom-left" | "bottom-right";
  confidence: number;
  bbox?: BoundingBox;
  colorHints?: string[];
}

export interface ReferenceAnalysis {
  regions: ReferenceRegion[];
  summary: string;
  confidence: number;
  source: "engine" | "heuristic" | "unavailable";
}

export interface PuzzleScan {
  id: string;
  puzzleId: string;
  imageDataUrl: string;
  width: number;
  height: number;
  pieceCount: number;
  status: "pending" | "analyzing" | "done" | "failed";
  error?: string;
  createdAt: number;
}

export interface HistoryEntry {
  id: string;
  puzzleId: string;
  type:
    | "scan"
    | "match_confirmed"
    | "match_rejected"
    | "match_undone"
    | "group_created"
    | "group_merged"
    | "piece_removed"
    | "reference_added";
  payload: Record<string, unknown>;
  timestamp: number;
  undoable: boolean;
}

export interface PuzzleProject {
  id: string;
  name: string;
  expectedPieces: number;
  createdAt: number;
  updatedAt: number;
  scans: PuzzleScan[];
  pieces: PuzzlePiece[];
  matches: PieceMatch[];
  groups: PuzzleGroup[];
  placements: ReconstructionPlacement[];
  referenceImageDataUrl?: string;
  referenceAnalysis?: ReferenceAnalysis;
  history: HistoryEntry[];
  progress: PuzzleProgress;
}

export interface NextActionRecommendation {
  action: string;
  rationale: string;
  pieceCodes?: PieceCode[];
  matchId?: string;
  priority: number;
}

export interface AssistantReply {
  message: string;
  data?: Record<string, unknown>;
  sources: string[];
}
