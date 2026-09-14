import { NextResponse } from "next/server";
import { z } from "zod";
import {
  parseReferenceAnalysis,
  PuzzleReferenceAnalyzer,
} from "@/lib/ai/PuzzleAIAssistant";
import { generateGeminiJson, isGeminiConfigured } from "@/lib/ai/gemini";

export const runtime = "nodejs";
export const maxDuration = 60;

const BodySchema = z.object({
  imageDataUrl: z.string().max(8_000_000).optional(),
  dominantColors: z.array(z.string()).max(12).optional(),
});

/**
 * Analyse de référence via Gemini (serveur uniquement).
 * Fallback heuristique si Gemini indisponible.
 */
export async function POST(request: Request) {
  try {
    const json: unknown = await request.json();
    const body = BodySchema.parse(json);
    const analyzer = new PuzzleReferenceAnalyzer();
    const colors = body.dominantColors ?? ["#6BA3C7", "#3D6B3D", "#8B7355"];

    if (!isGeminiConfigured()) {
      return NextResponse.json(analyzer.analyzeHeuristicFromColors(colors));
    }

    try {
      const prompt = [
        "Tu analyses une image de puzzle terminé (boîte ou photo finale).",
        "Réponds UNIQUEMENT en JSON valide avec exactement cette forme:",
        '{"regions":[{"name":"sky","position":"top","confidence":0.94,"colorHints":["#87CEEB"]}],"summary":"...","confidence":0.9,"source":"ai"}',
        "position ∈ top|bottom|left|right|center|top-left|top-right|bottom-left|bottom-right.",
        "confidence entre 0 et 1. Identifie les grandes zones (ciel, eau, forêt, bâtiment, sol, etc.).",
        body.imageDataUrl
          ? "Une image est fournie en pièce jointe."
          : `Couleurs dominantes observées: ${colors.join(", ")}`,
      ].join("\n");

      const result = await generateGeminiJson({
        prompt,
        imageDataUrl: body.imageDataUrl?.slice(0, 2_000_000),
      });

      if (!result) {
        return NextResponse.json(analyzer.analyzeHeuristicFromColors(colors));
      }

      const payload: unknown = JSON.parse(result.text);
      const parsed = parseReferenceAnalysis(payload);
      if (parsed.source === "unavailable" || parsed.regions.length === 0) {
        return NextResponse.json(analyzer.analyzeHeuristicFromColors(colors));
      }
      return NextResponse.json({ ...parsed, source: "ai" as const });
    } catch (error) {
      console.error("Gemini analyze-reference failed:", error);
      return NextResponse.json(analyzer.analyzeHeuristicFromColors(colors));
    }
  } catch (error) {
    return NextResponse.json(
      {
        regions: [],
        summary: error instanceof Error ? error.message : "Erreur analyse",
        confidence: 0,
        source: "unavailable",
      },
      { status: 400 },
    );
  }
}
