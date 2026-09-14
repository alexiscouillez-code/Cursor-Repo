import { NextResponse } from "next/server";
import { z } from "zod";
import { PuzzleAIAssistant } from "@/lib/ai/PuzzleAIAssistant";
import { generateGeminiJson, isGeminiConfigured } from "@/lib/ai/gemini";
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
 * Assistant = moteur géométrique d'abord.
 * Gemini peut reformuler, jamais inventer pièces/scores.
 */
export async function POST(request: Request) {
  try {
    const json: unknown = await request.json();
    const body = BodySchema.parse(json);
    const assistant = new PuzzleAIAssistant();
    const project = body.project as unknown as PuzzleProject;
    const engineReply = assistant.answer(project, body.question);

    if (!isGeminiConfigured()) {
      return NextResponse.json(engineReply);
    }

    try {
      const facts = {
        question: body.question,
        engineMessage: engineReply.message,
        sources: engineReply.sources,
        data: engineReply.data ?? null,
        progress: project.progress,
        pieceCount: project.pieces.length,
        candidateCount: project.matches.filter((m) => m.status === "candidate")
          .length,
        confirmedCount: project.matches.filter((m) => m.status === "confirmed")
          .length,
      };

      const result = await generateGeminiJson({
        prompt: [
          "Tu es l'assistant Puzzle Solver 2D.",
          "Tu DOIS t'appuyer uniquement sur les faits moteur fournis.",
          "Interdit d'inventer des pièces, scores, groupes ou associations absents des faits.",
          "Réponds en JSON: {\"message\":\"...\",\"sources\":[\"matching-engine\",\"gemini\"]}",
          "Faits moteur:",
          JSON.stringify(facts),
        ].join("\n"),
      });

      if (!result) return NextResponse.json(engineReply);

      const parsed = JSON.parse(result.text) as {
        message?: string;
        sources?: string[];
      };

      if (!parsed.message || typeof parsed.message !== "string") {
        return NextResponse.json(engineReply);
      }

      return NextResponse.json({
        message: parsed.message,
        data: engineReply.data,
        sources: Array.from(
          new Set([
            ...(engineReply.sources ?? []),
            ...(parsed.sources ?? []),
            "gemini",
          ]),
        ),
      });
    } catch (error) {
      console.error("Gemini assist failed:", error);
      return NextResponse.json(engineReply);
    }
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
