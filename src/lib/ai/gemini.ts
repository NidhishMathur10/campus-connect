import "server-only";
import { GoogleGenAI, type Part } from "@google/genai";
import { z } from "zod";

/** Model from env, defaulting to Google's alias for the newest Flash model. */
export const GEMINI_MODEL = process.env.GEMINI_MODEL?.trim() || "gemini-flash-latest";

const DEFAULT_TIMEOUT_MS = 20_000;

let client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set in .env.local");
  client ??= new GoogleGenAI({ apiKey });
  return client;
}

export type AiResult<T> =
  | { ok: true; data: T; model: string; ms: number }
  | { ok: false; error: string; model: string; ms: number; fallback?: T };

export interface StructuredOptions<S extends z.ZodType> {
  /** Zod schema for the answer. Converted to JSON Schema for Gemini, then used to validate. */
  schema: S;
  /** Text prompt, or a list of parts (text + images). */
  prompt: string | Part[];
  system?: string;
  timeoutMs?: number;
  temperature?: number;
  /** Returned (with ok: false) when the call fails, so the UI can carry on. */
  fallback?: z.infer<S>;
}

/**
 * Calls Gemini with structured JSON output and returns typed, validated data.
 * Never throws: on timeout / API error / bad JSON you get { ok: false, error, fallback }.
 */
export async function generateStructured<S extends z.ZodType>(
  opts: StructuredOptions<S>,
): Promise<AiResult<z.infer<S>>> {
  const started = Date.now();
  const controller = new AbortController();
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const fail = (error: string): AiResult<z.infer<S>> => ({
    ok: false,
    error,
    model: GEMINI_MODEL,
    ms: Date.now() - started,
    fallback: opts.fallback,
  });

  try {
    const ai = getClient();
    const contents =
      typeof opts.prompt === "string"
        ? opts.prompt
        : [{ role: "user", parts: opts.prompt }];

    const request = ai.models.generateContent({
      model: GEMINI_MODEL,
      contents,
      config: {
        systemInstruction: opts.system,
        temperature: opts.temperature ?? 0.2,
        responseMimeType: "application/json",
        responseJsonSchema: toGeminiSchema(opts.schema),
        abortSignal: controller.signal,
      },
    });

    // Belt and braces: also race the timer in case the SDK ignores the signal.
    const response = await Promise.race([
      request,
      new Promise<never>((_, reject) =>
        controller.signal.addEventListener("abort", () =>
          reject(new Error(`Gemini timed out after ${timeoutMs / 1000}s`)),
        ),
      ),
    ]);

    const text = response.text;
    if (!text) return fail("Gemini returned an empty response");

    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      return fail("Gemini returned invalid JSON");
    }

    const parsed = opts.schema.safeParse(json);
    if (!parsed.success) {
      return fail(`Gemini response did not match schema: ${z.prettifyError(parsed.error)}`);
    }
    return { ok: true, data: parsed.data, model: GEMINI_MODEL, ms: Date.now() - started };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[gemini]", message);
    return fail(controller.signal.aborted ? `Gemini timed out after ${timeoutMs / 1000}s` : message);
  } finally {
    clearTimeout(timer);
  }
}

/** Image part from a base64 string (no "data:" prefix) for multimodal prompts. */
export function imagePart(base64: string, mimeType: string): Part {
  return { inlineData: { data: base64, mimeType } };
}

export function textPart(text: string): Part {
  return { text };
}

// ---------------------------------------------------------------------------
// Zod -> Gemini JSON Schema. Gemini accepts a subset of JSON Schema, so we keep
// only supported keywords and turn `const` into a one-value `enum`.
// ---------------------------------------------------------------------------
const SUPPORTED_KEYS = new Set([
  "$id", "$defs", "$ref", "$anchor", "type", "format", "title", "description",
  "enum", "items", "prefixItems", "minItems", "maxItems", "minimum", "maximum",
  "anyOf", "oneOf", "properties", "additionalProperties", "required", "nullable",
  "propertyOrdering",
]);

function sanitize(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(sanitize);
  if (!node || typeof node !== "object") return node;

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (key === "const") {
      out.enum = [value];
    } else if (key === "properties" || key === "$defs") {
      out[key] = Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, sanitize(v)]),
      );
    } else if (SUPPORTED_KEYS.has(key)) {
      out[key] = sanitize(value);
    }
  }
  return out;
}

export function toGeminiSchema(schema: z.ZodType): unknown {
  return sanitize(z.toJSONSchema(schema, { target: "draft-2020-12", unrepresentable: "any" }));
}
