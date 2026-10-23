import "server-only";
import { GoogleGenAI, ThinkingLevel, type Part } from "@google/genai";
import { z } from "zod";

/** Model from env, defaulting to Google's alias for the newest Flash model. */
export const GEMINI_MODEL = process.env.GEMINI_MODEL?.trim() || "gemini-flash-latest";

/** Used when the main model is overloaded (503) or too slow. */
export const GEMINI_FALLBACK_MODEL =
  process.env.GEMINI_FALLBACK_MODEL?.trim() || "gemini-flash-lite-latest";

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
 * When the main model is rate-limited (free tier: ~20 requests/day), overloaded or timing
 * out, skip it for a few minutes so students don't wait for a doomed first attempt.
 */
const PRIMARY_COOLDOWN_MS = 5 * 60_000;
const UNAVAILABLE = /429|503|RESOURCE_EXHAUSTED|UNAVAILABLE|quota|high demand|timed out/i;
let primaryCooldownUntil = 0;

type Attempt<T> = { ok: true; data: T } | { ok: false; error: string };

async function attempt<S extends z.ZodType>(
  model: string,
  opts: StructuredOptions<S>,
  timeoutMs: number,
): Promise<Attempt<z.infer<S>>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const contents =
      typeof opts.prompt === "string" ? opts.prompt : [{ role: "user", parts: opts.prompt }];

    const request = getClient().models.generateContent({
      model,
      contents,
      config: {
        systemInstruction: opts.system,
        temperature: opts.temperature ?? 0.2,
        responseMimeType: "application/json",
        responseJsonSchema: toGeminiSchema(opts.schema),
        // Low thinking keeps latency at a few seconds; these tasks don't need deep reasoning.
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        abortSignal: controller.signal,
      },
    });

    // Belt and braces: also race the timer in case the SDK ignores the signal.
    const response = await Promise.race([
      request,
      new Promise<never>((_, reject) =>
        controller.signal.addEventListener("abort", () =>
          reject(new Error(`timed out after ${timeoutMs / 1000}s`)),
        ),
      ),
    ]);

    const text = response.text;
    if (!text) return { ok: false, error: "empty response" };
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      return { ok: false, error: "invalid JSON" };
    }
    const parsed = opts.schema.safeParse(json);
    if (!parsed.success) {
      return { ok: false, error: `response did not match schema: ${z.prettifyError(parsed.error)}` };
    }
    return { ok: true, data: parsed.data };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: controller.signal.aborted ? `timed out after ${timeoutMs / 1000}s` : message };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Calls Gemini with structured JSON output and returns typed, validated data.
 * Tries GEMINI_MODEL first; if it is overloaded, slow or returns bad JSON, retries once
 * on GEMINI_FALLBACK_MODEL within the same overall time budget.
 * Never throws: on failure you get { ok: false, error, fallback }.
 */
export async function generateStructured<S extends z.ZodType>(
  opts: StructuredOptions<S>,
): Promise<AiResult<z.infer<S>>> {
  const started = Date.now();
  const budget = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const skipPrimary = Date.now() < primaryCooldownUntil;
  const models = [skipPrimary ? "" : GEMINI_MODEL, GEMINI_FALLBACK_MODEL].filter(
    (m, i, all) => m && all.indexOf(m) === i,
  );
  const errors: string[] = [];

  for (let i = 0; i < models.length; i++) {
    const remaining = budget - (Date.now() - started);
    if (remaining < 3_000) break;
    // Give the primary model ~55% of the budget so the fallback still has time.
    const slice = i < models.length - 1 ? Math.round(remaining * 0.55) : remaining;
    const res = await attempt(models[i], opts, slice);
    if (res.ok) return { ok: true, data: res.data, model: models[i], ms: Date.now() - started };
    errors.push(`${models[i]}: ${res.error}`);
    console.error("[gemini]", models[i], res.error.slice(0, 300));
    if (models[i] === GEMINI_MODEL && models.length > 1 && UNAVAILABLE.test(res.error)) {
      primaryCooldownUntil = Date.now() + PRIMARY_COOLDOWN_MS;
    }
  }

  return {
    ok: false,
    error: errors.join(" | ") || "Gemini timed out",
    model: GEMINI_MODEL,
    ms: Date.now() - started,
    fallback: opts.fallback,
  };
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
