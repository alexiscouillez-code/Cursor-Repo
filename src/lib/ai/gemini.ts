import { z } from "zod";

const GeminiResponseSchema = z.object({
  candidates: z
    .array(
      z.object({
        content: z
          .object({
            parts: z.array(z.object({ text: z.string().optional() })).optional(),
          })
          .optional(),
      }),
    )
    .optional(),
  error: z
    .object({
      message: z.string().optional(),
      status: z.string().optional(),
    })
    .optional(),
});

export function getGeminiApiKey(): string | null {
  return (
    process.env.GEMINI_API_KEY ??
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ??
    process.env.AI_API_KEY ??
    null
  );
}

export function isGeminiConfigured(): boolean {
  return Boolean(getGeminiApiKey());
}

export async function generateGeminiJson(options: {
  prompt: string;
  imageDataUrl?: string;
  model?: string;
}): Promise<{ text: string; model: string } | null> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) return null;

  const model =
    options.model ??
    process.env.GEMINI_MODEL ??
    process.env.AI_VISION_MODEL ??
    "gemini-3.6-flash";

  const parts: Array<Record<string, unknown>> = [{ text: options.prompt }];

  if (options.imageDataUrl?.startsWith("data:")) {
    const comma = options.imageDataUrl.indexOf(",");
    const meta = options.imageDataUrl.slice(5, comma); // after "data:"
    const mime = meta.split(";")[0] ?? "image/jpeg";
    const base64 = options.imageDataUrl.slice(comma + 1);
    if (comma > 0 && base64) {
      parts.push({
        inline_data: {
          mime_type: mime,
          data: base64.slice(0, 4_000_000),
        },
      });
    }
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: "application/json",
      },
    }),
  });

  const raw: unknown = await response.json();
  const parsed = GeminiResponseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error("Réponse Gemini invalide");
  }
  if (!response.ok || parsed.data.error) {
    throw new Error(
      parsed.data.error?.message ?? `Gemini HTTP ${response.status}`,
    );
  }

  const text = parsed.data.candidates?.[0]?.content?.parts
    ?.map((p) => p.text ?? "")
    .join("")
    .trim();

  if (!text) return null;
  return { text, model };
}
