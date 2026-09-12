// Thin OpenRouter client. One function for now: chatJson(), which posts a
// chat completion and returns the parsed text content. Adds attribution
// headers, a 30s default timeout, and best-effort cost extraction.
//
// Per CLAUDE.md, this is the one place that talks to OpenRouter so we can
// later add retries, model failover, or budget caps in a single spot.

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatJsonOptions {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  timeoutMs?: number;
}

export interface ChatJsonResult {
  ok: boolean;
  content: string | null;
  usage: { prompt_tokens?: number; completion_tokens?: number };
  cost_usd?: number;
  latency_ms: number;
  model_used?: string;
  error?: string;
  http_status?: number;
}

function isConfigured(): boolean {
  return !!process.env.OPENROUTER_API_KEY;
}

export function assertOpenRouterConfigured(): void {
  if (!isConfigured()) throw new Error("OPENROUTER_API_KEY not configured");
}

export async function chatJson(opts: ChatJsonOptions): Promise<ChatJsonResult> {
  assertOpenRouterConfigured();

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 30000);
  const start = Date.now();

  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        // OpenRouter uses these for attribution / leaderboards.
        "HTTP-Referer": process.env.OPENROUTER_SITE_URL || "https://golfapalooza.golf",
        "X-Title": process.env.OPENROUTER_APP_NAME || "Golfapalooza",
      },
      body: JSON.stringify({
        model: opts.model,
        messages: opts.messages,
        temperature: opts.temperature ?? 0,
        max_tokens: opts.max_tokens ?? 8000,
      }),
      signal: ctrl.signal,
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return {
        ok: false,
        content: null,
        usage: {},
        latency_ms: Date.now() - start,
        http_status: res.status,
        error: `HTTP ${res.status}: ${txt.slice(0, 300)}`,
      };
    }

    const json = await res.json();
    const content = json?.choices?.[0]?.message?.content ?? null;
    return {
      ok: true,
      content,
      usage: json?.usage || {},
      // OpenRouter returns spend in some response variants; normalize.
      cost_usd:
        typeof json?.usage?.cost === "number" ? json.usage.cost :
        typeof json?.cost === "number" ? json.cost :
        undefined,
      latency_ms: Date.now() - start,
      model_used: json?.model,
    };
  } catch (e: unknown) {
    const err = e as { name?: string; message?: string };
    return {
      ok: false,
      content: null,
      usage: {},
      latency_ms: Date.now() - start,
      error: err?.name === "AbortError" ? "timeout" : err?.message || String(e),
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Parse JSON content even if the model wrapped it in ```json fences. */
export function parseLooseJson(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    const stripped = content
      .replace(/^\s*```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/i, "");
    return JSON.parse(stripped);
  }
}
