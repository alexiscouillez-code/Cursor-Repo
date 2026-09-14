import { z } from "zod";
import type {
  PuzzlePiece,
  ReferenceAnalysis,
  ReferenceRegion,
} from "@/types/puzzle";

export const ReferenceAnalysisSchema = z.object({
  regions: z.array(
    z.object({
      name: z.string(),
      position: z.enum([
        "top",
        "bottom",
        "left",
        "right",
        "center",
        "top-left",
        "top-right",
        "bottom-left",
        "bottom-right",
      ]),
      confidence: z.number().min(0).max(1),
      colorHints: z.array(z.string()).optional(),
    }),
  ),
  summary: z.string(),
  confidence: z.number().min(0).max(1),
  source: z.enum(["engine", "heuristic", "unavailable"]),
});

type RegionName =
  | "sky"
  | "water"
  | "forest"
  | "ground"
  | "building"
  | "object";

type GridPos =
  | "top-left"
  | "top"
  | "top-right"
  | "left"
  | "center"
  | "right"
  | "bottom-left"
  | "bottom"
  | "bottom-right";

const GRID_POSITIONS: GridPos[] = [
  "top-left",
  "top",
  "top-right",
  "left",
  "center",
  "right",
  "bottom-left",
  "bottom",
  "bottom-right",
];

/**
 * Local reference-image analyzer (no external AI).
 * Pipeline: load → grid sample → color classify → region merge → structured JSON.
 */
export class PuzzleReferenceAnalyzer {
  analyzeFromColors(dominantPalette: string[]): ReferenceAnalysis {
    const regions: ReferenceRegion[] = [];
    for (const color of dominantPalette.slice(0, 5)) {
      const region = this.guessRegionFromHex(color);
      if (region) regions.push(region);
    }
    if (regions.length === 0) {
      regions.push(
        { name: "sky", position: "top", confidence: 0.45, colorHints: ["#87CEEB"] },
        { name: "ground", position: "bottom", confidence: 0.45, colorHints: ["#8B7355"] },
        { name: "object", position: "center", confidence: 0.35 },
      );
    }
    return {
      regions: this.dedupeRegions(regions),
      summary: `Analyse couleur locale : ${regions.length} zone(s) estimée(s).`,
      confidence: 0.55,
      source: "heuristic",
    };
  }

  async analyzeImageDataUrl(dataUrl: string, maxSide = 720): Promise<ReferenceAnalysis> {
    if (typeof document === "undefined") {
      return this.analyzeFromColors([]);
    }
    try {
      const imageData = await this.loadImageData(dataUrl, maxSide);
      return this.analyzeImageData(imageData);
    } catch {
      return {
        regions: [],
        summary: "Impossible d'analyser l'image de référence.",
        confidence: 0,
        source: "unavailable",
      };
    }
  }

  analyzeImageData(imageData: ImageData): ReferenceAnalysis {
    const cells = this.sampleGrid(imageData, 3, 3);
    const labeled = cells.map((cell, index) => {
      const label = this.classifyRgb(cell.r, cell.g, cell.b);
      return {
        ...cell,
        label: label.name,
        confidence: label.confidence,
        position: GRID_POSITIONS[index]!,
        hex: this.rgbToHex(cell.r, cell.g, cell.b),
      };
    });

    const byName = new Map<
      string,
      { positions: GridPos[]; confidences: number[]; colors: string[] }
    >();

    for (const cell of labeled) {
      const entry = byName.get(cell.label) ?? {
        positions: [],
        confidences: [],
        colors: [],
      };
      entry.positions.push(cell.position);
      entry.confidences.push(cell.confidence);
      entry.colors.push(cell.hex);
      byName.set(cell.label, entry);
    }

    const regions: ReferenceRegion[] = [];
    for (const [name, data] of byName.entries()) {
      const confidence =
        data.confidences.reduce((a, b) => a + b, 0) / data.confidences.length;
      regions.push({
        name,
        position: this.majorityPosition(data.positions),
        confidence: Math.min(0.95, confidence),
        colorHints: Array.from(new Set(data.colors)).slice(0, 3),
      });
    }

    regions.sort((a, b) => b.confidence - a.confidence);
    const avg =
      regions.reduce((a, r) => a + r.confidence, 0) / Math.max(1, regions.length);

    return {
      regions,
      summary: `Analyse moteur : ${regions.length} zone(s) détectée(s) par grille couleur (${regions
        .map((r) => r.name)
        .join(", ")}).`,
      confidence: Math.round(avg * 100) / 100,
      source: "engine",
    };
  }

  classifyPieceRegion(
    piece: PuzzlePiece,
    analysis: ReferenceAnalysis | undefined,
  ): { name: string; confidence: number } | undefined {
    if (!analysis || analysis.regions.length === 0) return undefined;

    const brightness = piece.colors.meanBrightness;
    const sat = piece.colors.meanSaturation;
    const dominant = piece.colors.dominantColors[0];
    const rgb = dominant ? this.hexToRgb(dominant) : null;
    const pieceGuess = rgb ? this.classifyRgb(rgb.r, rgb.g, rgb.b) : null;

    let best = analysis.regions[0]!;
    let bestScore = -1;
    for (const region of analysis.regions) {
      let score = region.confidence;
      if (pieceGuess && pieceGuess.name === region.name) score += 0.35;
      if (region.name === "sky") score += brightness * 0.35 + (1 - sat) * 0.15;
      if (region.name === "forest") score += sat * 0.25;
      if (region.name === "water") score += (1 - Math.abs(brightness - 0.55)) * 0.25;
      if (region.name === "ground") score += (1 - brightness) * 0.2;
      if (score > bestScore) {
        bestScore = score;
        best = region;
      }
    }

    return {
      name: best.name,
      confidence: Math.min(0.95, Math.max(0.25, bestScore / 2)),
    };
  }

  private sampleGrid(
    imageData: ImageData,
    cols: number,
    rows: number,
  ): Array<{ r: number; g: number; b: number }> {
    const cells: Array<{ r: number; g: number; b: number }> = [];
    const cellW = Math.floor(imageData.width / cols);
    const cellH = Math.floor(imageData.height / rows);
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        let r = 0;
        let g = 0;
        let b = 0;
        let n = 0;
        const x0 = col * cellW;
        const y0 = row * cellH;
        for (let y = y0; y < y0 + cellH; y += 2) {
          for (let x = x0; x < x0 + cellW; x += 2) {
            const i = (y * imageData.width + x) * 4;
            r += imageData.data[i] ?? 0;
            g += imageData.data[i + 1] ?? 0;
            b += imageData.data[i + 2] ?? 0;
            n++;
          }
        }
        cells.push({
          r: n ? Math.round(r / n) : 0,
          g: n ? Math.round(g / n) : 0,
          b: n ? Math.round(b / n) : 0,
        });
      }
    }
    return cells;
  }

  private classifyRgb(
    r: number,
    g: number,
    b: number,
  ): { name: RegionName; confidence: number } {
    const brightness = (r + g + b) / (3 * 255);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const sat = max === 0 ? 0 : (max - min) / max;

    if (b > r + 15 && b > g + 10 && brightness > 0.42) {
      return { name: "sky", confidence: 0.55 + Math.min(0.35, (b - r) / 255) };
    }
    if (b > g && b >= r && brightness > 0.3 && brightness <= 0.55 && sat > 0.2) {
      return { name: "water", confidence: 0.5 + sat * 0.25 };
    }
    if (g > r + 10 && g > b + 10) {
      return { name: "forest", confidence: 0.5 + Math.min(0.35, (g - r) / 255) };
    }
    if (brightness < 0.38 || (r > 90 && g > 70 && b < 90 && brightness < 0.55)) {
      return { name: "ground", confidence: 0.48 + (1 - brightness) * 0.25 };
    }
    if (sat < 0.18 && brightness > 0.35 && brightness < 0.75) {
      return { name: "building", confidence: 0.42 };
    }
    return { name: "object", confidence: 0.4 };
  }

  private majorityPosition(positions: GridPos[]): ReferenceRegion["position"] {
    const counts = new Map<string, number>();
    for (const p of positions) counts.set(p, (counts.get(p) ?? 0) + 1);
    let best = positions[0] ?? "center";
    let bestN = -1;
    for (const [p, n] of counts.entries()) {
      if (n > bestN) {
        best = p as GridPos;
        bestN = n;
      }
    }
    // Collapse pure edges when mixed
    if (best.includes("top") && !best.includes("left") && !best.includes("right")) {
      return "top";
    }
    if (best.includes("bottom") && !best.includes("left") && !best.includes("right")) {
      return "bottom";
    }
    return best;
  }

  private guessRegionFromHex(hex: string): ReferenceRegion | null {
    const rgb = this.hexToRgb(hex);
    if (!rgb) return null;
    const c = this.classifyRgb(rgb.r, rgb.g, rgb.b);
    const position =
      c.name === "sky" ? "top" : c.name === "ground" ? "bottom" : "center";
    return {
      name: c.name,
      position,
      confidence: c.confidence,
      colorHints: [hex],
    };
  }

  private dedupeRegions(regions: ReferenceRegion[]): ReferenceRegion[] {
    const map = new Map<string, ReferenceRegion>();
    for (const r of regions) {
      const prev = map.get(r.name);
      if (!prev || r.confidence > prev.confidence) map.set(r.name, r);
    }
    return Array.from(map.values());
  }

  private async loadImageData(dataUrl: string, maxSide: number): Promise<ImageData> {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Image load failed"));
      el.src = dataUrl;
    });
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
    const width = Math.max(1, Math.round(img.width * scale));
    const height = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Canvas unavailable");
    ctx.drawImage(img, 0, 0, width, height);
    return ctx.getImageData(0, 0, width, height);
  }

  private hexToRgb(hex: string): { r: number; g: number; b: number } | null {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
    if (!m) return null;
    const n = parseInt(m[1]!, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  private rgbToHex(r: number, g: number, b: number): string {
    return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
  }
}

export function parseReferenceAnalysis(payload: unknown): ReferenceAnalysis {
  const parsed = ReferenceAnalysisSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      regions: [],
      summary: "Analyse invalide",
      confidence: 0,
      source: "unavailable",
    };
  }
  return parsed.data;
}
