import { NextResponse } from "next/server";
import { z } from "zod";
import { PuzzleAIAssistant } from "@/lib/ai/PuzzleAIAssistant";
import type { PuzzleProject } from "@/types/puzzle";

export const runtime = "nodejs";

const BodySchema = z.object({
  question: z.string().min(1).max(500),
  project: z.object({
    id: z.string(),
    name: z.string(),
    expectedPieces: z.number(),
    createdAt: z.number(),
    updatedAt: z.number(),
    scans: z.array(z.any()),
    pieces: z.array(z.any()),
    matches: z.array(z.any()),
    groups: z.array(z.any()),
    placements: z.array(z.any()),
    history: z.array(z.any()),
    progress: z.any(),
    referenceImageDataUrl: z.string().optional(),
    referenceAnalysis: z.any().optional(),
  }),
});

/**
 * Assistant uses real engine data only — never invents pieces/scores.
 * Generative AI is optional enrichment; local engine answers by default.
 */
export async function POST(request: Request) {
  try {
    const json: unknown = await request.json();
    const body = BodySchema.parse(json);
    const assistant = new PuzzleAIAssistant();
    const project = body.project as unknown as PuzzleProject;
    const reply = assistant.answer(project, body.question);
    return NextResponse.json(reply);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Assistant indisponible — le moteur géométrique reste utilisable.",
        sources: ["error"],
      },
      { status: 400 },
    );
  }
}
