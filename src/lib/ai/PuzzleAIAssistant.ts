import { z } from "zod";
import type {
  AssistantReply,
  NextActionRecommendation,
  PieceMatch,
  PuzzlePiece,
  PuzzleProject,
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
  source: z.enum(["ai", "heuristic", "unavailable"]),
});

export class PuzzleReferenceAnalyzer {
  /** Heuristic fallback when AI is unavailable — still structured JSON. */
  analyzeHeuristicFromColors(dominantPalette: string[]): ReferenceAnalysis {
    const regions: ReferenceRegion[] = [];
    const joined = dominantPalette.join(" ").toLowerCase();

    if (/#([89abcdef][0-9a-f]{5}|[0-9a-f]{2}[89abcdef][0-9a-f]{3}|[0-9a-f]{4}[89abcdef][0-9a-f])/i.test(joined) || joined.includes("00") === false) {
      // rough sky/water/earth guesses from brightness of hex
    }

    for (const color of dominantPalette.slice(0, 4)) {
      const region = this.guessRegionFromHex(color);
      if (region) regions.push(region);
    }

    if (regions.length === 0) {
      regions.push(
        { name: "sky", position: "top", confidence: 0.4, colorHints: ["#87CEEB"] },
        { name: "ground", position: "bottom", confidence: 0.4, colorHints: ["#8B7355"] },
        { name: "center-subject", position: "center", confidence: 0.35 },
      );
    }

    return {
      regions,
      summary: "Analyse heuristique des zones (IA indisponible ou non configurée).",
      confidence: 0.45,
      source: "heuristic",
    };
  }

  classifyPieceRegion(
    piece: PuzzlePiece,
    analysis: ReferenceAnalysis | undefined,
  ): { name: string; confidence: number } | undefined {
    if (!analysis || analysis.regions.length === 0) return undefined;
    const brightness = piece.colors.meanBrightness;
    const sat = piece.colors.meanSaturation;

    let best = analysis.regions[0]!;
    let bestScore = -1;
    for (const region of analysis.regions) {
      let score = region.confidence;
      if (region.name.includes("sky") || region.name.includes("ciel")) {
        score += brightness * 0.4 + (1 - sat) * 0.2;
      } else if (region.name.includes("forest") || region.name.includes("forêt") || region.name.includes("tree")) {
        score += sat * 0.3 + (1 - Math.abs(brightness - 0.4)) * 0.2;
      } else if (region.name.includes("water") || region.name.includes("eau")) {
        score += (1 - Math.abs(brightness - 0.55)) * 0.3;
      } else if (region.name.includes("ground") || region.name.includes("sol") || region.name.includes("road")) {
        score += (1 - brightness) * 0.25;
      }
      if (score > bestScore) {
        bestScore = score;
        best = region;
      }
    }

    return {
      name: best.name,
      confidence: Math.min(0.95, Math.max(0.2, bestScore / 2)),
    };
  }

  private guessRegionFromHex(hex: string): ReferenceRegion | null {
    const rgb = this.hexToRgb(hex);
    if (!rgb) return null;
    const { r, g, b } = rgb;
    const brightness = (r + g + b) / (3 * 255);
    if (b > r && b > g && brightness > 0.45) {
      return { name: "sky", position: "top", confidence: 0.55, colorHints: [hex] };
    }
    if (g > r && g > b) {
      return { name: "forest", position: "center", confidence: 0.5, colorHints: [hex] };
    }
    if (brightness < 0.35) {
      return { name: "ground", position: "bottom", confidence: 0.45, colorHints: [hex] };
    }
    if (r > 180 && g > 150 && b < 120) {
      return { name: "building", position: "center", confidence: 0.4, colorHints: [hex] };
    }
    return { name: "object", position: "center", confidence: 0.35, colorHints: [hex] };
  }

  private hexToRgb(hex: string): { r: number; g: number; b: number } | null {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
    if (!m) return null;
    const n = parseInt(m[1]!, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
}

export class PuzzleAIAssistant {
  recommendNext(project: PuzzleProject): NextActionRecommendation {
    const candidates = project.matches
      .filter((m) => m.status === "candidate")
      .sort((a, b) => b.score.global - a.score.global);

    const best = candidates[0];
    if (best && best.score.global >= 80) {
      return {
        action: `Assemble ${best.pieceACode} + ${best.pieceBCode}`,
        rationale: `Compatibilité ${best.score.global}% (confiance ${(best.confidence * 100).toFixed(0)}%). ${best.explanations
          .filter((e) => e.positive)
          .map((e) => e.label)
          .slice(0, 2)
          .join(", ")}.`,
        pieceCodes: [best.pieceACode, best.pieceBCode],
        matchId: best.id,
        priority: 1,
      };
    }

    const borderLoose = project.pieces.filter(
      (p) => p.isBorder && !this.isConnected(p.id, project.matches),
    );
    if (borderLoose.length > 0) {
      return {
        action: `Travaille sur les pièces de bord`,
        rationale: `Il reste ${borderLoose.length} pièces de bord susceptibles de former le contour.`,
        pieceCodes: borderLoose.slice(0, 5).map((p) => p.code),
        priority: 2,
      };
    }

    if (project.pieces.length === 0) {
      return {
        action: "Scanne des pièces",
        rationale: "Aucune pièce détectée pour le moment. Photographie un lot sur fond contrasté.",
        priority: 0,
      };
    }

    if (!project.referenceAnalysis) {
      return {
        action: "Importe l'image de référence",
        rationale: "Une photo de la boîte améliore le classement par zones.",
        priority: 3,
      };
    }

    return {
      action: "Explore les associations moyennes",
      rationale: best
        ? `Meilleure piste actuelle : ${best.pieceACode}+${best.pieceBCode} (${best.score.global}%).`
        : "Pas encore de candidat fort — rescanner ou ajuster la segmentation.",
      pieceCodes: best ? [best.pieceACode, best.pieceBCode] : undefined,
      matchId: best?.id,
      priority: 4,
    };
  }

  answer(project: PuzzleProject, question: string): AssistantReply {
    const q = question.toLowerCase().trim();
    const sources: string[] = ["matching-engine", "progress-engine"];

    if (q.includes("ciel") || q.includes("sky")) {
      const skyPieces = project.pieces.filter(
        (p) => p.regionHint?.name.toLowerCase().includes("sky") || p.regionHint?.name.toLowerCase().includes("ciel"),
      );
      sources.push("reference-analyzer");
      return {
        message: `J'ai identifié ${skyPieces.length} pièce(s) probablement associées au ciel${
          skyPieces.length
            ? ` : ${skyPieces
                .slice(0, 8)
                .map((p) => p.code)
                .join(", ")}`
            : ""
        }.`,
        data: { pieceCodes: skyPieces.map((p) => p.code) },
        sources,
      };
    }

    if (q.includes("maintenant") || q.includes("conseille") || q.includes("essayer")) {
      const rec = this.recommendNext(project);
      return {
        message: `${rec.action}. ${rec.rationale}`,
        data: { recommendation: rec },
        sources,
      };
    }

    if (q.includes("pourquoi")) {
      const best = project.matches
        .filter((m) => m.status === "candidate")
        .sort((a, b) => b.score.global - a.score.global)[0];
      if (!best) {
        return {
          message: "Je n'ai pas encore d'association solide à expliquer. Scanne plus de pièces ou confirme une détection.",
          sources,
        };
      }
      const why = best.explanations
        .filter((e) => e.positive)
        .map((e) => `✓ ${e.label}`)
        .join("\n");
      return {
        message: `${best.pieceACode} + ${best.pieceBCode} (score ${best.score.global}%, confiance ${(best.confidence * 100).toFixed(0)}%)\n${why}`,
        data: { matchId: best.id },
        sources,
      };
    }

    if (q.includes("progression") || q.includes("avanc")) {
      const p = project.progress;
      return {
        message: `Pièces ${p.piecesIdentified}/${p.piecesTotal}, connexions ${p.connectionsConfirmed}, groupes ${p.groupsCount}, progression estimée ${p.estimatedPercent}%.`,
        data: { progress: p },
        sources,
      };
    }

    const rec = this.recommendNext(project);
    return {
      message: `Je m'appuie sur le moteur géométrique (pas d'invention). Suggestion : ${rec.action}. ${rec.rationale}`,
      data: { recommendation: rec },
      sources,
    };
  }

  enhanceMatchesWithAI(
    matches: PieceMatch[],
    aiScores: Map<string, number>,
  ): PieceMatch[] {
    // AI only reranks top candidates — never invents pairs
    return matches.map((m) => {
      const ai = aiScores.get(m.id);
      if (ai === undefined) return m;
      if (m.score.geometry < 50) {
        // geometry veto stands
        return m;
      }
      return {
        ...m,
        score: {
          ...m.score,
          aiVisual: ai,
          global: Math.round(
            m.score.global * 0.85 + ai * 0.15,
          ),
        },
      };
    });
  }

  private isConnected(pieceId: string, matches: PieceMatch[]): boolean {
    return matches.some(
      (m) =>
        m.status === "confirmed" &&
        (m.pieceAId === pieceId || m.pieceBId === pieceId),
    );
  }
}

export function parseReferenceAnalysis(payload: unknown): ReferenceAnalysis {
  const parsed = ReferenceAnalysisSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      regions: [],
      summary: "Analyse IA invalide",
      confidence: 0,
      source: "unavailable",
    };
  }
  return parsed.data;
}
