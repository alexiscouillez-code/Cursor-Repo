import type { Point2D } from "@/types/puzzle";

export function distance(a: Point2D, b: Point2D): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

export function polygonArea(points: Point2D[]): number {
  if (points.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    const q = points[(i + 1) % points.length]!;
    sum += p.x * q.y - q.x * p.y;
  }
  return Math.abs(sum) / 2;
}

export function polygonPerimeter(points: Point2D[]): number {
  if (points.length < 2) return 0;
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    sum += distance(points[i]!, points[(i + 1) % points.length]!);
  }
  return sum;
}

export function centroid(points: Point2D[]): Point2D {
  if (points.length === 0) return { x: 0, y: 0 };
  let x = 0;
  let y = 0;
  for (const p of points) {
    x += p.x;
    y += p.y;
  }
  return { x: x / points.length, y: y / points.length };
}

export function boundingBoxOf(points: Point2D[]): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  if (points.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

export function convexHull(points: Point2D[]): Point2D[] {
  if (points.length <= 1) return [...points];
  const sorted = [...points].sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));

  const cross = (o: Point2D, a: Point2D, b: Point2D) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

  const lower: Point2D[] = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }

  const upper: Point2D[] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i]!;
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }

  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

export function convexityRatio(points: Point2D[]): number {
  const area = polygonArea(points);
  if (area <= 0) return 0;
  const hullArea = polygonArea(convexHull(points));
  if (hullArea <= 0) return 0;
  return Math.min(1, area / hullArea);
}

/** Sample a polyline into a fixed-length normalized profile (mean 0, std ~1). */
export function normalizeProfile(values: number[], samples = 64): number[] {
  if (values.length === 0) return Array.from({ length: samples }, () => 0);
  const resampled: number[] = [];
  for (let i = 0; i < samples; i++) {
    const t = (i / (samples - 1)) * (values.length - 1);
    const i0 = Math.floor(t);
    const i1 = Math.min(values.length - 1, i0 + 1);
    const f = t - i0;
    resampled.push(values[i0]! * (1 - f) + values[i1]! * f);
  }
  const mean = resampled.reduce((a, b) => a + b, 0) / resampled.length;
  const centered = resampled.map((v) => v - mean);
  const variance =
    centered.reduce((a, b) => a + b * b, 0) / Math.max(1, centered.length);
  const std = Math.sqrt(variance) || 1;
  return centered.map((v) => v / std);
}

export function profileCorrelation(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    // Face-to-face: reverse B and invert depth so TAB matches BLANK
    sum += a[i]! * -b[n - 1 - i]!;
  }
  return sum / n;
}

export function meanCurvature(profile: number[]): number {
  if (profile.length < 3) return 0;
  let sum = 0;
  for (let i = 1; i < profile.length - 1; i++) {
    sum += Math.abs(profile[i + 1]! - 2 * profile[i]! + profile[i - 1]!);
  }
  return sum / (profile.length - 2);
}

export function findExtrema(profile: number[], threshold = 0.35): number[] {
  const extrema: number[] = [];
  for (let i = 1; i < profile.length - 1; i++) {
    const v = profile[i]!;
    const prev = profile[i - 1]!;
    const next = profile[i + 1]!;
    if ((v > prev && v > next && v > threshold) || (v < prev && v < next && v < -threshold)) {
      extrema.push(i / (profile.length - 1));
    }
  }
  return extrema;
}

export function complementarySides(
  side: "TOP" | "RIGHT" | "BOTTOM" | "LEFT",
): "TOP" | "RIGHT" | "BOTTOM" | "LEFT" {
  switch (side) {
    case "TOP":
      return "BOTTOM";
    case "BOTTOM":
      return "TOP";
    case "LEFT":
      return "RIGHT";
    case "RIGHT":
      return "LEFT";
  }
}
