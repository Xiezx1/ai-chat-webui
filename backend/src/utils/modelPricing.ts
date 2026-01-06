type Pricing = { promptPerToken: number; completionPerToken: number };

type CachedPricing = {
    fetchedAt: number;
    byId: Map<string, Pricing>;
};

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

let cache: CachedPricing | null = null;

function normalizeModelId(modelId: string): string {
    const t = String(modelId || "").trim();
    if (!t) return "";
    // OpenRouter model ids sometimes include suffixes like ":free"/":beta" or "@provider".
    return t.split("@")[0].split(":")[0].trim();
}

function asFiniteNumber(x: unknown): number | null {
    const n = typeof x === "string" ? Number(x) : typeof x === "number" ? x : NaN;
    return Number.isFinite(n) ? n : null;
}

function seededFallbackPricingPerToken(modelId: string): Pricing | null {
    // Keep a small fallback map for common models.
    // Values here are USD per 1M tokens; we convert to USD per token.
    const per1M: Record<string, { prompt: number; completion: number }> = {
        "openai/gpt-4o-mini": { prompt: 0.15, completion: 0.6 },
        "openai/gpt-4o": { prompt: 5.0, completion: 15.0 },
        "anthropic/claude-3.5-sonnet": { prompt: 3.0, completion: 15.0 },
        "anthropic/claude-3-haiku": { prompt: 0.25, completion: 1.25 },
        "meta-llama/llama-3.1-70b-instruct": { prompt: 0.9, completion: 0.9 },
        "meta-llama/llama-3.1-8b-instruct": { prompt: 0.1, completion: 0.1 },
    };

    const base = normalizeModelId(modelId);
    const p = per1M[modelId] || per1M[base];
    if (!p) return null;
    return {
        promptPerToken: p.prompt / 1_000_000,
        completionPerToken: p.completion / 1_000_000,
    };
}

async function refreshCacheIfNeeded() {
    const now = Date.now();
    if (cache && now - cache.fetchedAt < CACHE_TTL_MS) return;

    const byId = new Map<string, Pricing>();

    // Seed fallback pricing first.
    cache = { fetchedAt: now, byId };

    // Fetch pricing from OpenRouter models endpoint.
    // Note: this project uses a proxy domain (api.x1zx.com) that mirrors OpenRouter.
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const apiKey = process.env.OPENROUTER_API_KEY || "";
    if (apiKey) {
        headers.Authorization = `Bearer ${apiKey}`;
        headers["HTTP-Referer"] = process.env.OPENROUTER_HTTP_REFERER || "http://localhost";
        headers["X-Title"] = process.env.OPENROUTER_APP_TITLE || "ai-chat-webui";
    }

    try {
        const res = await fetch("https://api.x1zx.com/api/v1/models", {
            method: "GET",
            headers,
        });
        if (!res.ok) {
            cache = { fetchedAt: now, byId };
            return;
        }

        const data: any = await res.json().catch(() => null);
        const list: any[] = Array.isArray(data?.data) ? data.data : [];

        for (const m of list) {
            const id = String(m?.id || "").trim();
            if (!id) continue;

            const prompt = asFiniteNumber(m?.pricing?.prompt);
            const completion = asFiniteNumber(m?.pricing?.completion);
            if (prompt == null || completion == null) continue;

            // OpenRouter "pricing" fields are USD per token (string numbers).
            byId.set(id, { promptPerToken: prompt, completionPerToken: completion });
        }

        cache = { fetchedAt: now, byId };
    } catch {
        cache = { fetchedAt: now, byId };
    }
}

export async function getModelPricingPerToken(modelId: string): Promise<Pricing | null> {
    const id = String(modelId || "").trim();
    if (!id) return null;

    await refreshCacheIfNeeded();

    const base = normalizeModelId(id);
    const fromCache = cache?.byId.get(id) || (base ? cache?.byId.get(base) : undefined);
    if (fromCache) return fromCache;

    return seededFallbackPricingPerToken(id);
}

export async function calculateUsdCost(modelId: string, tokens: { promptTokens: number; completionTokens: number }) {
    const pricing = await getModelPricingPerToken(modelId);
    if (!pricing) return 0;

    const prompt = (tokens.promptTokens || 0) * pricing.promptPerToken;
    const completion = (tokens.completionTokens || 0) * pricing.completionPerToken;

    // Keep a stable precision for storage/display.
    return Number((prompt + completion).toFixed(6));
}
