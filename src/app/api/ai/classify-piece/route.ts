import { NextResponse } from "next/server";
import { z } from "zod";
import { PuzzleReferenceAnalyzer } from "@/lib/ai/PuzzleAIAssistant";
import type { ReferenceAnalysis } from "@/types/puzzle";

export const runtime = "nodejs";

const BodySchema = z.object({
  meanBrightness: z.number(),
  meanSaturation: z.number(),
  dominantColors: z.array(z.string()).max(8),
  referenceAnalysis: z.any().optional(),
});

export async function POST(request: Request) {
  try {
    const json: unknown = await request.json();
    const body = BodySchema.parse(json);
    const analyzer = new PuzzleReferenceAnalyzer();
    const analysis = (body.referenceAnalysis ?? undefined) as
      | ReferenceAnalysis
      | undefined;

    const pieceLike = {
      colors: {
        meanBrightness: body.meanBrightness,
        meanSaturation: body.meanSaturation,
        dominantColors: body.dominantColors,
        histogram: [],
        edgeZoneColors: {
          TOP: [],
          RIGHT: [],
          BOTTOM: [],
          LEFT: [],
        },
      },
    };

    const hint = analyzer.classifyPieceRegion(
      pieceLike as never,
      analysis ??
        analyzer.analyzeHeuristicFromColors(body.dominantColors),
    );

    return NextResponse.json(hint ?? { name: "unknown", confidence: 0 });
  } catch (error) {
    return NextResponse.json(
      {
        name: "unknown",
        confidence: 0,
        error: error instanceof Error ? error.message : "error",
      },
      { status: 400 },
    );
  }
}
