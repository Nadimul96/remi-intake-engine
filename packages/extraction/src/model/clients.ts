/**
 * Minimal LLM clients over plain fetch: Google Gemini (free tier) and any
 * OpenAI-compatible chat endpoint (OpenAI, Groq, OpenRouter, a local Ollama, ...).
 * Keys come from the environment and are never logged.
 */

export interface ModelPrompt {
  system: string;
  user: string;
}

export interface ModelClient {
  /** Short provider/model label recorded on every candidate the model proposes. */
  readonly label: string;
  /** Returns the model's raw text reply (expected to be JSON). */
  complete(prompt: ModelPrompt): Promise<string>;
}

export interface ModelConfig {
  provider: "gemini" | "openai";
  model: string;
  apiKey: string | null;
  baseUrl: string;
  timeoutMs: number;
}

export const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite";
const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const REQUEST_TIMEOUT_MS = 60_000;

/** Read MODEL_EXTRACTION and its provider settings. Returns null when model-assisted extraction is off. */
export function modelConfigFromEnv(env: Record<string, string | undefined>): ModelConfig | null {
  const mode = (env.MODEL_EXTRACTION ?? "off").trim().toLowerCase();
  if (mode === "" || mode === "off") {
    return null;
  }
  if (mode === "gemini") {
    if (!env.GEMINI_API_KEY) {
      throw new Error(
        "MODEL_EXTRACTION=gemini requires GEMINI_API_KEY (free key: https://aistudio.google.com/apikey)."
      );
    }
    return {
      provider: "gemini",
      model: env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL,
      apiKey: env.GEMINI_API_KEY,
      baseUrl: GEMINI_BASE_URL,
      timeoutMs: REQUEST_TIMEOUT_MS
    };
  }
  if (mode === "openai") {
    if (!env.OPENAI_COMPATIBLE_BASE_URL || !env.OPENAI_COMPATIBLE_MODEL) {
      throw new Error("MODEL_EXTRACTION=openai requires OPENAI_COMPATIBLE_BASE_URL and OPENAI_COMPATIBLE_MODEL.");
    }
    return {
      provider: "openai",
      model: env.OPENAI_COMPATIBLE_MODEL,
      apiKey: env.OPENAI_COMPATIBLE_API_KEY || null,
      baseUrl: env.OPENAI_COMPATIBLE_BASE_URL.replace(/\/+$/, ""),
      timeoutMs: REQUEST_TIMEOUT_MS
    };
  }
  throw new Error(`Unknown MODEL_EXTRACTION value "${mode}"; use off, gemini or openai.`);
}

async function postJson(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  timeoutMs: number
): Promise<unknown> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!response.ok) {
    throw new Error(`Model request failed with HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
  }
  return response.json();
}

export function geminiClient(config: ModelConfig): ModelClient {
  return {
    label: `gemini:${config.model}`,
    async complete(prompt) {
      const payload = (await postJson(
        `${config.baseUrl}/models/${encodeURIComponent(config.model)}:generateContent`,
        { "x-goog-api-key": config.apiKey ?? "" },
        {
          systemInstruction: { parts: [{ text: prompt.system }] },
          contents: [{ role: "user", parts: [{ text: prompt.user }] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0 }
        },
        config.timeoutMs
      )) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      return (payload.candidates?.[0]?.content?.parts ?? []).map((part) => part.text ?? "").join("");
    }
  };
}

export function openAICompatibleClient(config: ModelConfig): ModelClient {
  return {
    label: `openai-compatible:${config.model}`,
    async complete(prompt) {
      const payload = (await postJson(
        `${config.baseUrl}/chat/completions`,
        config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {},
        {
          model: config.model,
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: prompt.system },
            { role: "user", content: prompt.user }
          ]
        },
        config.timeoutMs
      )) as { choices?: { message?: { content?: string } }[] };
      return payload.choices?.[0]?.message?.content ?? "";
    }
  };
}

export function createModelClient(config: ModelConfig): ModelClient {
  return config.provider === "gemini" ? geminiClient(config) : openAICompatibleClient(config);
}
