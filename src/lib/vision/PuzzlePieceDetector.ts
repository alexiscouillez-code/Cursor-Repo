import { PuzzlePieceAnalyzer } from "@/lib/geometry/PuzzlePieceAnalyzer";
import type { BoundingBox, Point2D, PuzzlePiece } from "@/types/puzzle";

export interface DetectionResult {
  pieces: PuzzlePiece[];
  pieceCount: number;
  confidence: number;
  warnings: string[];
}

export interface DetectOptions {
  puzzleId: string;
  scanId: string;
  minAreaRatio?: number;
  maxPieces?: number;
}

/**
 * Canvas-based piece detector (OpenCV-compatible interface).
 * Pipeline: grayscale → blur → adaptive threshold → connected components → contours.
 */
export class PuzzlePieceDetector {
  private analyzer = new PuzzlePieceAnalyzer();

  async detectFromImageData(
    imageData: ImageData,
    options: DetectOptions,
  ): Promise<DetectionResult> {
    const warnings: string[] = [];
    const gray = this.toGrayscale(imageData);
    const blurred = this.boxBlur(gray, imageData.width, imageData.height, 2);
    const bg = this.estimateBackground(blurred);
    const binary = this.thresholdForeground(blurred, bg);
    const components = this.connectedComponents(
      binary,
      imageData.width,
      imageData.height,
    );

    const minArea =
      imageData.width *
      imageData.height *
      (options.minAreaRatio ?? 0.002);
    const maxPieces = options.maxPieces ?? 1200;

    const filtered = components
      .filter((c) => c.area >= minArea)
      .sort((a, b) => a.bbox.y - b.bbox.y || a.bbox.x - b.bbox.x)
      .slice(0, maxPieces);

    if (filtered.length === 0) {
      warnings.push("Aucune pièce détectée. Vérifiez le contraste et l'éclairage.");
    }
    if (filtered.length === 1) {
      warnings.push("Une seule région détectée — les pièces sont peut-être fusionnées.");
    }

    const pieces: PuzzlePiece[] = filtered.map((component, index) => {
      const code = `P${String(index + 1).padStart(3, "0")}`;
      const contour = component.contour;
      const geometry = this.analyzer.analyzeGeometry(contour);
      const edges = this.analyzer.analyzeEdges(contour, geometry);
      const colors = this.analyzer.analyzeColors(imageData, component.bbox);
      const textures = this.analyzer.analyzeTextures(imageData, component.bbox);
      const thumbnailDataUrl = this.extractThumbnail(imageData, component.bbox);

      return {
        id: `${options.scanId}-${code}`,
        code,
        puzzleId: options.puzzleId,
        scanId: options.scanId,
        boundingBox: component.bbox,
        thumbnailDataUrl,
        geometry,
        edges,
        colors,
        textures,
        isCorner: this.analyzer.isCornerPiece(edges),
        isBorder: this.analyzer.isBorderPiece(edges),
        createdAt: Date.now(),
      };
    });

    const confidence =
      pieces.length === 0
        ? 0
        : Math.min(0.95, 0.55 + Math.min(pieces.length, 40) / 100);

    return {
      pieces,
      pieceCount: pieces.length,
      confidence,
      warnings,
    };
  }

  removePiece(pieces: PuzzlePiece[], pieceId: string): PuzzlePiece[] {
    return this.renumber(pieces.filter((p) => p.id !== pieceId));
  }

  mergePieces(pieces: PuzzlePiece[], aId: string, bId: string): PuzzlePiece[] {
    const a = pieces.find((p) => p.id === aId);
    const b = pieces.find((p) => p.id === bId);
    if (!a || !b) return pieces;

    const contour = [...a.geometry.contour, ...b.geometry.contour];
    const geometry = this.analyzer.analyzeGeometry(contour);
    const edges = this.analyzer.analyzeEdges(contour, geometry);
    const merged: PuzzlePiece = {
      ...a,
      geometry,
      edges,
      boundingBox: {
        x: Math.min(a.boundingBox.x, b.boundingBox.x),
        y: Math.min(a.boundingBox.y, b.boundingBox.y),
        width:
          Math.max(a.boundingBox.x + a.boundingBox.width, b.boundingBox.x + b.boundingBox.width) -
          Math.min(a.boundingBox.x, b.boundingBox.x),
        height:
          Math.max(a.boundingBox.y + a.boundingBox.height, b.boundingBox.y + b.boundingBox.height) -
          Math.min(a.boundingBox.y, b.boundingBox.y),
      },
      isCorner: this.analyzer.isCornerPiece(edges),
      isBorder: this.analyzer.isBorderPiece(edges),
      colors: a.colors,
      textures: a.textures,
    };

    return this.renumber(
      pieces.filter((p) => p.id !== aId && p.id !== bId).concat(merged),
    );
  }

  private renumber(pieces: PuzzlePiece[]): PuzzlePiece[] {
    return pieces
      .sort((a, b) => a.boundingBox.y - b.boundingBox.y || a.boundingBox.x - b.boundingBox.x)
      .map((p, i) => ({
        ...p,
        code: `P${String(i + 1).padStart(3, "0")}`,
      }));
  }

  private toGrayscale(imageData: ImageData): Float32Array {
    const out = new Float32Array(imageData.width * imageData.height);
    for (let i = 0, p = 0; i < imageData.data.length; i += 4, p++) {
      out[p] =
        (imageData.data[i]! * 0.299 +
          imageData.data[i + 1]! * 0.587 +
          imageData.data[i + 2]! * 0.114) /
        255;
    }
    return out;
  }

  private boxBlur(
    src: Float32Array,
    width: number,
    height: number,
    radius: number,
  ): Float32Array {
    const out = new Float32Array(src.length);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let sum = 0;
        let count = 0;
        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            const xx = x + dx;
            const yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
            sum += src[yy * width + xx]!;
            count++;
          }
        }
        out[y * width + x] = sum / count;
      }
    }
    return out;
  }

  private estimateBackground(gray: Float32Array): number {
    // Histogram mode as background prior (border-heavy images benefit most)
    const hist = new Array(32).fill(0) as number[];
    for (let i = 0; i < gray.length; i += 8) {
      const v = gray[i]!;
      const bin = Math.min(31, Math.floor(v * 31));
      hist[bin] = (hist[bin] ?? 0) + 1;
    }
    let bestBin = 0;
    let bestCount = -1;
    for (let i = 0; i < hist.length; i++) {
      if ((hist[i] ?? 0) > bestCount) {
        bestCount = hist[i] ?? 0;
        bestBin = i;
      }
    }
    return bestBin / 31;
  }

  private thresholdForeground(gray: Float32Array, bg: number): Uint8Array {
    const out = new Uint8Array(gray.length);
    const delta = 0.12;
    for (let i = 0; i < gray.length; i++) {
      // Foreground differs from background (works for light or dark tables)
      out[i] = Math.abs(gray[i]! - bg) > delta ? 1 : 0;
    }
    return out;
  }

  private connectedComponents(
    binary: Uint8Array,
    width: number,
    height: number,
  ): Array<{ area: number; bbox: BoundingBox; contour: Point2D[] }> {
    const visited = new Uint8Array(binary.length);
    const components: Array<{ area: number; bbox: BoundingBox; contour: Point2D[] }> = [];

    const dirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        if (binary[idx] !== 1 || visited[idx]) continue;

        const stack: number[] = [idx];
        visited[idx] = 1;
        let area = 0;
        let minX = x;
        let minY = y;
        let maxX = x;
        let maxY = y;
        const border: Point2D[] = [];

        while (stack.length) {
          const cur = stack.pop()!;
          const cx = cur % width;
          const cy = Math.floor(cur / width);
          area++;
          minX = Math.min(minX, cx);
          minY = Math.min(minY, cy);
          maxX = Math.max(maxX, cx);
          maxY = Math.max(maxY, cy);

          let isBorder = false;
          for (const [dx, dy] of dirs) {
            const nx = cx + dx;
            const ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
              isBorder = true;
              continue;
            }
            const nidx = ny * width + nx;
            if (binary[nidx] !== 1) {
              isBorder = true;
              continue;
            }
            if (!visited[nidx]) {
              visited[nidx] = 1;
              stack.push(nidx);
            }
          }
          if (isBorder && border.length < 4000) {
            border.push({ x: cx, y: cy });
          }
        }

        // Subsample contour for performance
        const contour =
          border.length > 200
            ? border.filter((_, i) => i % Math.ceil(border.length / 200) === 0)
            : border;

        components.push({
          area,
          bbox: {
            x: minX,
            y: minY,
            width: maxX - minX + 1,
            height: maxY - minY + 1,
          },
          contour: contour.length >= 3 ? contour : [
            { x: minX, y: minY },
            { x: maxX, y: minY },
            { x: maxX, y: maxY },
            { x: minX, y: maxY },
          ],
        });
      }
    }

    return components;
  }

  private extractThumbnail(
    imageData: ImageData,
    box: BoundingBox,
  ): string | undefined {
    if (typeof document === "undefined") return undefined;
    try {
      const canvas = document.createElement("canvas");
      const size = 96;
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) return undefined;
      const tmp = document.createElement("canvas");
      tmp.width = imageData.width;
      tmp.height = imageData.height;
      const tctx = tmp.getContext("2d");
      if (!tctx) return undefined;
      tctx.putImageData(imageData, 0, 0);
      ctx.drawImage(
        tmp,
        box.x,
        box.y,
        box.width,
        box.height,
        0,
        0,
        size,
        size,
      );
      return canvas.toDataURL("image/jpeg", 0.7);
    } catch {
      return undefined;
    }
  }
}

export class PuzzleImageProcessor {
  async loadImageElement(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Impossible de charger l'image"));
      img.src = src;
    });
  }

  async toImageData(
    source: HTMLImageElement | HTMLCanvasElement,
    maxSide = 1600,
  ): Promise<ImageData> {
    const w = "naturalWidth" in source ? source.naturalWidth : source.width;
    const h = "naturalHeight" in source ? source.naturalHeight : source.height;
    const scale = Math.min(1, maxSide / Math.max(w, h));
    const width = Math.max(1, Math.round(w * scale));
    const height = Math.max(1, Math.round(h * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Canvas non disponible");
    ctx.drawImage(source, 0, 0, width, height);
    return ctx.getImageData(0, 0, width, height);
  }

  rotateDataUrl(dataUrl: string, degrees: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const rad = (degrees * Math.PI) / 180;
        const sin = Math.abs(Math.sin(rad));
        const cos = Math.abs(Math.cos(rad));
        const width = img.width * cos + img.height * sin;
        const height = img.width * sin + img.height * cos;
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(width);
        canvas.height = Math.ceil(height);
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas non disponible"));
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate(rad);
        ctx.drawImage(img, -img.width / 2, -img.height / 2);
        resolve(canvas.toDataURL("image/jpeg", 0.92));
      };
      img.onerror = () => reject(new Error("Rotation impossible"));
      img.src = dataUrl;
    });
  }
}
