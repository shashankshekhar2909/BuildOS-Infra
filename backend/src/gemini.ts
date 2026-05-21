import { GoogleGenAI } from "@google/genai";
import { config } from "./config.js";

let client: GoogleGenAI | null = null;

function ensureClient(): GoogleGenAI {
  if (!config.geminiApiKey) {
    const err = { status: 503, message: "Gemini not configured (set GEMINI_API_KEY)." };
    throw err;
  }
  if (!client) {
    client = new GoogleGenAI({ apiKey: config.geminiApiKey });
  }
  return client;
}

export function geminiConfigured(): boolean {
  return Boolean(config.geminiApiKey);
}

const SYSTEM_INSTRUCTION = `You are the BuildOS Infra Diagnostic Co-pilot.
You receive an operator's question plus a recent stream of system logs.
Respond concisely with:
1. Likely root cause (one line).
2. Top three concrete next actions (bullet list).
3. Any commands or queries to run (fenced shell block).
Never invent log lines that aren't present. If uncertain, say so.`;

export async function diagnose(input: { prompt: string; logs?: string }): Promise<{ text: string }> {
  const ai = ensureClient();
  const userContent = input.logs
    ? `## Operator question\n${input.prompt}\n\n## Recent logs\n\`\`\`\n${input.logs.slice(-8000)}\n\`\`\``
    : input.prompt;

  const response = await ai.models.generateContent({
    model: config.geminiModel,
    contents: userContent,
    config: { systemInstruction: SYSTEM_INSTRUCTION }
  });

  const text = response.text ?? "";
  return { text };
}

export function isGeminiError(e: unknown): e is { status: number; message: string } {
  return (
    typeof e === "object" &&
    e !== null &&
    typeof (e as { status: unknown }).status === "number" &&
    typeof (e as { message: unknown }).message === "string"
  );
}
