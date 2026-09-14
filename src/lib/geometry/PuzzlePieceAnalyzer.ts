import {
  boundingBoxOf,
  centroid,
  convexityRatio,
  findExtrema,
  meanCurvature,
  normalizeProfile,
  polygonArea,
  polygonPerimeter,
} from "@/lib/geometry/math";
import type {
  ColorFeatures,
  EdgeSide,
  EdgeTabType,
  PieceEdge,
  PieceGeometry,
  Point2D,
  TextureFeatures,
} from "@/types/puzzle";

export class PuzzlePieceAnalyzer {
  analyzeGeometry(contour: Point2D[]): PieceGeometry {
    const box = boundingBoxOf(contour);
    const center = centroid(contour);
    const area = polygonArea(contour);
    const perimeter = polygonPerimeter(contour);
    const width = Math.max(1, box.width);
    const height = Math.max(1, box.height);
    const orientation = this.estimateOrientation(contour, center);
    return {
      contour,
      area,
      perimeter,
      width,
      height,
      center,
      orientation,
      ratio: width / height,
      convexity: convexityRatio(contour),
    };
  }

  analyzeEdges(contour: Point2D[], geometry: PieceGeometry): PieceEdge[] {
    const sides: EdgeSide[] = ["TOP", "RIGHT", "BOTTOM", "LEFT"];
    return sides.map((side) => {
      const segment = this.extractSidePoints(contour, geometry, side);
      const profile = this.buildRadialProfile(segment, geometry.center, side);
      const signatureProfile = normalizeProfile(profile);
      const curvature = meanCurvature(signatureProfile);
      const extrema = findExtrema(signatureProfile);
      const type = this.classifyTabType(signatureProfile, extrema);
      const length = Math.max(
        1,
        side === "TOP" || side === "BOTTOM" ? geometry.width : geometry.height,
      );

      return {
        side,
        length,
        curvature,
        profile: signatureProfile,
        type,
        position: this.sideMidpoint(geometry, side),
        signature: {
          length,
          normalizedProfile: signatureProfile,
          curvature,
          extrema,
          tabType: type,
          confidence: this.typeConfidence(signatureProfile, type),
        },
      };
    });
  }

  isCornerPiece(edges: PieceEdge[]): boolean {
    return edges.filter((e) => e.type === "EDGE").length === 2;
  }

  isBorderPiece(edges: PieceEdge[]): boolean {
    return edges.some((e) => e.type === "EDGE");
  }

  analyzeColors(
    imageData: ImageData,
    box: { x: number; y: number; width: number; height: number },
  ): ColorFeatures {
    const histogram = new Array(24).fill(0) as number[];
    const colors: { r: number; g: number; b: number }[] = [];
    let brightness = 0;
    let saturation = 0;
    let count = 0;

    const x0 = Math.max(0, Math.floor(box.x));
    const y0 = Math.max(0, Math.floor(box.y));
    const x1 = Math.min(imageData.width, Math.ceil(box.x + box.width));
    const y1 = Math.min(imageData.height, Math.ceil(box.y + box.height));

    for (let y = y0; y < y1; y += 2) {
      for (let x = x0; x < x1; x += 2) {
        const i = (y * imageData.width + x) * 4;
        const r = imageData.data[i] ?? 0;
        const g = imageData.data[i + 1] ?? 0;
        const b = imageData.data[i + 2] ?? 0;
        const a = imageData.data[i + 3] ?? 0;
        if (a < 128) continue;
        colors.push({ r, g, b });
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        brightness += max / 255;
        saturation += max === 0 ? 0 : (max - min) / max;
        const bin = Math.floor(((r + g + b) / 3 / 255) * 23);
        histogram[bin] = (histogram[bin] ?? 0) + 1;
        count++;
      }
    }

    const dominantColors = this.quantizeDominant(colors, 3);
    const edgeZoneColors = this.edgeZoneHistograms(imageData, box);

    return {
      dominantColors,
      histogram,
      meanBrightness: count ? brightness / count : 0,
      meanSaturation: count ? saturation / count : 0,
      edgeZoneColors,
    };
  }

  analyzeTextures(
    imageData: ImageData,
    box: { x: number; y: number; width: number; height: number },
  ): TextureFeatures {
    let gxSum = 0;
    let gySum = 0;
    let energy = 0;
    let count = 0;
    const x0 = Math.max(1, Math.floor(box.x));
    const y0 = Math.max(1, Math.floor(box.y));
    const x1 = Math.min(imageData.width - 1, Math.ceil(box.x + box.width));
    const y1 = Math.min(imageData.height - 1, Math.ceil(box.y + box.height));

    for (let y = y0; y < y1; y += 3) {
      for (let x = x0; x < x1; x += 3) {
        const i = (y * imageData.width + x) * 4;
        const ix = ((y * imageData.width + (x + 1)) * 4);
        const iy = (((y + 1) * imageData.width + x) * 4);
        const g0 = (imageData.data[i] ?? 0) * 0.3 + (imageData.data[i + 1] ?? 0) * 0.59 + (imageData.data[i + 2] ?? 0) * 0.11;
        const gx = (imageData.data[ix] ?? 0) * 0.3 + (imageData.data[ix + 1] ?? 0) * 0.59 + (imageData.data[ix + 2] ?? 0) * 0.11 - g0;
        const gy = (imageData.data[iy] ?? 0) * 0.3 + (imageData.data[iy + 1] ?? 0) * 0.59 + (imageData.data[iy + 2] ?? 0) * 0.11 - g0;
        gxSum += gx;
        gySum += gy;
        energy += gx * gx + gy * gy;
        count++;
      }
    }

    const edgeContinuityHints: Record<EdgeSide, number[]> = {
      TOP: this.edgeStripProfile(imageData, box, "TOP"),
      RIGHT: this.edgeStripProfile(imageData, box, "RIGHT"),
      BOTTOM: this.edgeStripProfile(imageData, box, "BOTTOM"),
      LEFT: this.edgeStripProfile(imageData, box, "LEFT"),
    };

    return {
      gradientMagnitude: count ? Math.sqrt(energy / count) : 0,
      lineOrientation: Math.atan2(gySum, gxSum),
      edgeContinuityHints,
      textureEnergy: count ? energy / count : 0,
    };
  }

  private estimateOrientation(contour: Point2D[], center: Point2D): number {
    let num = 0;
    let den = 0;
    for (const p of contour) {
      const dx = p.x - center.x;
      const dy = p.y - center.y;
      num += 2 * dx * dy;
      den += dx * dx - dy * dy;
    }
    return 0.5 * Math.atan2(num, den);
  }

  private extractSidePoints(
    contour: Point2D[],
    geometry: PieceGeometry,
    side: EdgeSide,
  ): Point2D[] {
    const { center, width, height } = geometry;
    const halfW = width / 2;
    const halfH = height / 2;
    return contour.filter((p) => {
      const dx = p.x - center.x;
      const dy = p.y - center.y;
      switch (side) {
        case "TOP":
          return dy < -halfH * 0.25 && Math.abs(dx) <= halfW * 0.7;
        case "BOTTOM":
          return dy > halfH * 0.25 && Math.abs(dx) <= halfW * 0.7;
        case "LEFT":
          return dx < -halfW * 0.25 && Math.abs(dy) <= halfH * 0.7;
        case "RIGHT":
          return dx > halfW * 0.25 && Math.abs(dy) <= halfH * 0.7;
      }
    });
  }

  private buildRadialProfile(
    segment: Point2D[],
    center: Point2D,
    side: EdgeSide,
  ): number[] {
    if (segment.length === 0) return Array.from({ length: 32 }, () => 0);
    const sorted = [...segment].sort((a, b) => {
      if (side === "TOP" || side === "BOTTOM") return a.x - b.x;
      return a.y - b.y;
    });
    return sorted.map((p) => {
      if (side === "TOP") return center.y - p.y;
      if (side === "BOTTOM") return p.y - center.y;
      if (side === "LEFT") return center.x - p.x;
      return p.x - center.x;
    });
  }

  private classifyTabType(profile: number[], extrema: number[]): EdgeTabType {
    const meanAbs =
      profile.reduce((a, b) => a + Math.abs(b), 0) / Math.max(1, profile.length);
    if (meanAbs < 0.25 && extrema.length <= 1) return "EDGE";

    const peak = Math.max(...profile);
    const valley = Math.min(...profile);
    if (peak > 0.55 && peak > Math.abs(valley) * 1.1) return "TAB";
    if (valley < -0.55 && Math.abs(valley) > peak * 1.1) return "BLANK";
    if (Math.abs(peak) < 0.4 && Math.abs(valley) < 0.4) return "INNER";
    return peak >= Math.abs(valley) ? "TAB" : "BLANK";
  }

  private typeConfidence(profile: number[], type: EdgeTabType): number {
    const peak = Math.max(...profile.map(Math.abs));
    if (type === "EDGE") return Math.max(0.4, 1 - peak);
    return Math.min(0.98, 0.5 + peak / 2);
  }

  private sideMidpoint(
    geometry: PieceGeometry,
    side: EdgeSide,
  ): Point2D {
    const { center, width, height } = geometry;
    switch (side) {
      case "TOP":
        return { x: center.x, y: center.y - height / 2 };
      case "BOTTOM":
        return { x: center.x, y: center.y + height / 2 };
      case "LEFT":
        return { x: center.x - width / 2, y: center.y };
      case "RIGHT":
        return { x: center.x + width / 2, y: center.y };
    }
  }

  private quantizeDominant(
    colors: { r: number; g: number; b: number }[],
    k: number,
  ): string[] {
    if (colors.length === 0) return ["#666666"];
    const step = Math.max(1, Math.floor(colors.length / k));
    const result: string[] = [];
    for (let i = 0; i < k; i++) {
      const c = colors[Math.min(colors.length - 1, i * step)]!;
      result.push(
        `#${[c.r, c.g, c.b].map((v) => v.toString(16).padStart(2, "0")).join("")}`,
      );
    }
    return result;
  }

  private edgeZoneHistograms(
    imageData: ImageData,
    box: { x: number; y: number; width: number; height: number },
  ): Record<EdgeSide, number[]> {
    return {
      TOP: this.stripHistogram(imageData, box, "TOP"),
      RIGHT: this.stripHistogram(imageData, box, "RIGHT"),
      BOTTOM: this.stripHistogram(imageData, box, "BOTTOM"),
      LEFT: this.stripHistogram(imageData, box, "LEFT"),
    };
  }

  private stripHistogram(
    imageData: ImageData,
    box: { x: number; y: number; width: number; height: number },
    side: EdgeSide,
  ): number[] {
    const hist = new Array(8).fill(0) as number[];
    const band = Math.max(2, Math.floor(Math.min(box.width, box.height) * 0.12));
    let x0 = Math.floor(box.x);
    let y0 = Math.floor(box.y);
    let x1 = Math.ceil(box.x + box.width);
    let y1 = Math.ceil(box.y + box.height);
    if (side === "TOP") y1 = y0 + band;
    if (side === "BOTTOM") y0 = y1 - band;
    if (side === "LEFT") x1 = x0 + band;
    if (side === "RIGHT") x0 = x1 - band;

    x0 = Math.max(0, x0);
    y0 = Math.max(0, y0);
    x1 = Math.min(imageData.width, x1);
    y1 = Math.min(imageData.height, y1);

    for (let y = y0; y < y1; y += 2) {
      for (let x = x0; x < x1; x += 2) {
        const i = (y * imageData.width + x) * 4;
        const avg = ((imageData.data[i] ?? 0) + (imageData.data[i + 1] ?? 0) + (imageData.data[i + 2] ?? 0)) / 3;
        const bin = Math.min(7, Math.floor((avg / 255) * 8));
        hist[bin] = (hist[bin] ?? 0) + 1;
      }
    }
    const total = hist.reduce((a, b) => a + b, 0) || 1;
    return hist.map((v) => v / total);
  }

  private edgeStripProfile(
    imageData: ImageData,
    box: { x: number; y: number; width: number; height: number },
    side: EdgeSide,
  ): number[] {
    const samples = 32;
    const profile: number[] = [];
    for (let i = 0; i < samples; i++) {
      const t = i / (samples - 1);
      let x = 0;
      let y = 0;
      if (side === "TOP" || side === "BOTTOM") {
        x = box.x + t * box.width;
        y = side === "TOP" ? box.y + 2 : box.y + box.height - 3;
      } else {
        y = box.y + t * box.height;
        x = side === "LEFT" ? box.x + 2 : box.x + box.width - 3;
      }
      const xi = Math.max(0, Math.min(imageData.width - 1, Math.round(x)));
      const yi = Math.max(0, Math.min(imageData.height - 1, Math.round(y)));
      const idx = (yi * imageData.width + xi) * 4;
      const v =
        ((imageData.data[idx] ?? 0) +
          (imageData.data[idx + 1] ?? 0) +
          (imageData.data[idx + 2] ?? 0)) /
        (3 * 255);
      profile.push(v);
    }
    return profile;
  }
}
