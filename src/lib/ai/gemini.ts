import "server-only";
import { GoogleGenAI, HarmBlockThreshold, HarmCategory, ThinkingLevel, type Part, type SafetySetting } from "@google/genai";
import { z } from "zod";

/** "models/gemini-x" -> "gemini-x" (the SDK adds the prefix itself). */
const cleanModel = (m: string) => m.trim().replace(/^models\//, "");

/** Primary model from GEMINI_MODEL, defaulting to Google's alias for the newest Flash model. */
export const GEMINI_MODEL = cleanModel(process.env.GEMINI_MODEL ?? "") || "gemini-flash-latest";

/**
 * Tried in order when the primary model is rate-limited or overloaded.
 * GEMINI_FALLBACK_MODELS is comma-separated; the older single GEMINI_FALLBACK_MODEL still works.
 */
export const GEMINI_FALLBACK_MODELS: string[] = (
  process.env.GEMINI_FALLBACK_MODELS ?? process.env.GEMINI_FALLBACK_MODEL ?? "gemini-flash-lite-latest"
)
  .split(",")
  .map(cleanModel)
  .filter(Boolean);

/** Primary first, then fallbacks, without repeats. */
export const GEMINI_MODEL_CHAIN: string[] = [GEMINI_MODEL, ...GEMINI_FALLBACK_MODELS].filter(
  (m, i, all) => all.indexOf(m) === i,
);

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
  /**
   * Least restrictive safety filters. Only for classifying student reports of ragging,
   * harassment or violence, which the default filters may block.
   */
  relaxedSafety?: boolean;
}

const RELAXED_SAFETY: SafetySetting[] = [
  HarmCategory.HARM_CATEGORY_HARASSMENT,
  HarmCategory.HARM_CATEGORY_HATE_SPEECH,
  HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
  HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
].map((category) => ({ category, threshold: HarmBlockThreshold.BLOCK_NONE }));

/** Errors that mean "this model is busy / out of quota right now" (worth a retry, then the next model). */
const UNAVAILABLE = /429|503|RESOURCE_EXHAUSTED|UNAVAILABLE|overloaded|quota|high demand|timed out/i;
/** Errors that mean the model name itself is wrong or unusable: skip straight to the next model. */
const BAD_MODEL = /404|NOT_FOUND|not found|not supported/i;
const RETRY_DELAY_MS = 800;

/**
 * Models that just failed with a quota / overload error are skipped for a few minutes so
 * students don't wait for a doomed first attempt.
 */
const COOLDOWN_MS = 2 * 60_000;
const cooldownUntil = new Map<string, number>();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
        ...(opts.relaxedSafety ? { safetySettings: RELAXED_SAFETY } : {}),
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
    if (!text) {
      const blocked = response.promptFeedback?.blockReason ?? response.candidates?.[0]?.finishReason;
      return { ok: false, error: blocked ? `blocked (${blocked})` : "empty response" };
    }
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
 * Walks GEMINI_MODEL then GEMINI_FALLBACK_MODELS. On 429 / RESOURCE_EXHAUSTED / 503 / overloaded
 * a model is retried once after a short delay before moving on. `model` in the result is the
 * model that actually answered. Never throws: on failure you get { ok: false, error, fallback }.
 */
export async function generateStructured<S extends z.ZodType>(
  opts: StructuredOptions<S>,
): Promise<AiResult<z.infer<S>>> {
  const started = Date.now();
  const budget = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const now = Date.now();
  // Skip models in cooldown, but never end up with nothing to try.
  const ready = GEMINI_MODEL_CHAIN.filter((m) => (cooldownUntil.get(m) ?? 0) <= now);
  const models = ready.length > 0 ? ready : GEMINI_MODEL_CHAIN;
  const errors: string[] = [];

  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    const isLast = i === models.length - 1;
    for (let tryNo = 0; tryNo < 2; tryNo++) {
      const remaining = budget - (Date.now() - started);
      if (remaining < 2_500) break;
      // Leave time for the models still to come.
      const slice = isLast ? remaining : Math.round(remaining * (tryNo === 0 ? 0.5 : 0.8));
      const res = await attempt(model, opts, slice);
      if (res.ok) return { ok: true, data: res.data, model, ms: Date.now() - started };

      errors.push(`${model}: ${res.error}`);
      console.error("[gemini]", model, res.error.slice(0, 300));
      if (BAD_MODEL.test(res.error) && !UNAVAILABLE.test(res.error)) break; // wrong model name: don't retry
      if (!UNAVAILABLE.test(res.error)) break; // bad JSON / blocked: the next model may do better
      if (tryNo === 0 && !/timed out/i.test(res.error)) await sleep(RETRY_DELAY_MS);
      else {
        cooldownUntil.set(model, Date.now() + COOLDOWN_MS);
        break;
      }
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
