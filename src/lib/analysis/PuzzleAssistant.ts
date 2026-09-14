import type {
  AssistantReply,
  NextActionRecommendation,
  PieceMatch,
  PuzzleProject,
} from "@/types/puzzle";

/**
 * Engine-backed assistant — never invents pieces or scores.
 */
export class PuzzleAssistant {
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
        action: "Travaille sur les pièces de bord",
        rationale: `Il reste ${borderLoose.length} pièces de bord susceptibles de former le contour.`,
        pieceCodes: borderLoose.slice(0, 5).map((p) => p.code),
        priority: 2,
      };
    }

    if (project.pieces.length === 0) {
      return {
        action: "Scanne des pièces",
        rationale:
          "Aucune pièce détectée pour le moment. Photographie un lot sur fond contrasté.",
        priority: 0,
      };
    }

    if (!project.referenceAnalysis) {
      return {
        action: "Importe l'image de référence",
        rationale:
          "Une photo de la boîte améliore le classement des pièces par zones.",
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
    const sources = ["matching-engine", "progress-engine"];

    if (q.includes("ciel") || q.includes("sky")) {
      const skyPieces = project.pieces.filter(
        (p) =>
          p.regionHint?.name.toLowerCase().includes("sky") ||
          p.regionHint?.name.toLowerCase().includes("ciel"),
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
          message:
            "Je n'ai pas encore d'association solide à expliquer. Scanne plus de pièces ou confirme une détection.",
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
      message: `Suggestion moteur : ${rec.action}. ${rec.rationale}`,
      data: { recommendation: rec },
      sources,
    };
  }

  private isConnected(pieceId: string, matches: PieceMatch[]): boolean {
    return matches.some(
      (m) =>
        m.status === "confirmed" &&
        (m.pieceAId === pieceId || m.pieceBId === pieceId),
    );
  }
}
