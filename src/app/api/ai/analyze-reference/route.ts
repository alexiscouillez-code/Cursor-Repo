import { NextResponse } from "next/server";
import { z } from "zod";
import {
  parseReferenceAnalysis,
  PuzzleReferenceAnalyzer,
} from "@/lib/ai/PuzzleAIAssistant";

export const runtime = "nodejs";
export const maxDuration = 60;

const BodySchema = z.object({
  imageDataUrl: z.string().max(8_000_000).optional(),
  dominantColors: z.array(z.string()).max(12).optional(),
});

/**
 * Secure AI reference analysis.
 * Never exposes API keys to the client.
 * Falls back to heuristic structured JSON if AI is unavailable.
 */
export async function POST(request: Request) {
  try {
    const json: unknown = await request.json();
    const body = BodySchema.parse(json);
    const analyzer = new PuzzleReferenceAnalyzer();

    const apiKey = process.env.OPENAI_API_KEY ?? process.env.AI_API_KEY;
    if (!apiKey) {
      const heuristic = analyzer.analyzeHeuristicFromColors(
        body.dominantColors ?? ["#6BA3C7", "#3D6B3D", "#8B7355"],
      );
      return NextResponse.json(heuristic);
    }

    // Optional vision model call — structured JSON only
    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: process.env.AI_VISION_MODEL ?? "gpt-4o-mini",
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content:
                "Tu analyses une image de puzzle terminé. Réponds UNIQUEMENT en JSON: {regions:[{name,position,confidence,colorHints?}],summary,confidence,source:'ai'}. position ∈ top|bottom|left|right|center|top-left|top-right|bottom-left|bottom-right. confidence 0..1.",
            },
            {
              role: "user",
              content: body.imageDataUrl
                ? [
                    {
                      type: "text",
                      text: "Identifie les grandes zones du puzzle.",
                    },
                    {
                      type: "image_url",
                      image_url: { url: body.imageDataUrl.slice(0, 2_000_000) },
                    },
                  ]
                : `Couleurs dominantes: ${(body.dominantColors ?? []).join(", ")}`,
            },
          ],
        }),
      });

      if (!response.ok) {
        throw new Error(`AI HTTP ${response.status}`);
      }

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = data.choices?.[0]?.message?.content;
      const parsed = parseReferenceAnalysis(
        content ? JSON.parse(content) : { source: "unavailable" },
      );
      if (parsed.source === "unavailable" || parsed.regions.length === 0) {
        return NextResponse.json(
          analyzer.analyzeHeuristicFromColors(body.dominantColors ?? []),
        );
      }
      return NextResponse.json({ ...parsed, source: "ai" as const });
    } catch {
      return NextResponse.json(
        analyzer.analyzeHeuristicFromColors(
          body.dominantColors ?? ["#6BA3C7", "#3D6B3D", "#8B7355"],
        ),
      );
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
