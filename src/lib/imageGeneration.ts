import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_SIZE } from "@/lib/imagePolicy";

/** Server-side image generation, so an MCP/API client can put a real
 * image into the Media Library by sending nothing but a prompt.
 *
 * This is the only arrangement that works from a hosted chat client. An
 * image a model generates inside the chat (ChatGPT's or Gemini's own
 * image tool) has no public URL to hand over, and its bytes cannot go out
 * through a tool call -- base64 of a 1024x1024 image is well over a
 * million characters, past what a tool call carries and past what a model
 * can emit. Generating on this side means the prompt is the only thing
 * that travels: a few dozen tokens in, a Media Library URL back.
 *
 * Three providers, chosen by IMAGE_PROVIDER, each needing only its own
 * key to switch on -- nothing here is hardcoded to one vendor, and a
 * self-hoster with none of these keys set simply has the feature off:
 *
 *   pollinations  POLLINATIONS_API_KEY   POLLINATIONS_IMAGE_MODEL
 *   openai        OPENAI_API_KEY         OPENAI_IMAGE_MODEL
 *   gemini        GEMINI_API_KEY         GEMINI_IMAGE_MODEL
 *
 * Pollinations is the default because one key there reaches most of the
 * field (its model ids include openai/gpt-image-2 and
 * google/gemini-nano-banana-2.1), so switching model rarely means
 * switching provider and adding another vendor account. */

export type ImageProviderName = "pollinations" | "openai" | "gemini";

export type GenerateImageRequest = {
  prompt: string;
  provider?: string;
  model?: string;
  width?: number;
  height?: number;
  quality?: "low" | "medium" | "high";
  transparent?: boolean;
};

export type GeneratedImage = { bytes: Buffer; contentType: string; provider: ImageProviderName; model: string };

export class ImageGenerationError extends Error {}

const DEFAULTS: Record<ImageProviderName, { keyEnv: string; modelEnv: string; model: string }> = {
  pollinations: { keyEnv: "POLLINATIONS_API_KEY", modelEnv: "POLLINATIONS_IMAGE_MODEL", model: "gpt-image-2" },
  openai: { keyEnv: "OPENAI_API_KEY", modelEnv: "OPENAI_IMAGE_MODEL", model: "gpt-image-2" },
  gemini: { keyEnv: "GEMINI_API_KEY", modelEnv: "GEMINI_IMAGE_MODEL", model: "gemini-2.5-flash-image" },
};

// Generation genuinely takes tens of seconds on the larger models, so
// this is a ceiling on a hung request rather than a latency budget.
const GENERATION_TIMEOUT_MS = 180_000;

function configuredProviders(): ImageProviderName[] {
  return (Object.keys(DEFAULTS) as ImageProviderName[]).filter((name) => Boolean(process.env[DEFAULTS[name].keyEnv]));
}

/** Which provider a request without an explicit `provider` gets:
 * IMAGE_PROVIDER when its key is set, else whichever single provider is
 * configured -- so setting one key is enough to make the feature work,
 * with no second variable to remember. */
export function defaultProvider(): ImageProviderName | null {
  const available = configuredProviders();
  const requested = (process.env.IMAGE_PROVIDER || "").trim().toLowerCase() as ImageProviderName;
  if (requested && available.includes(requested)) return requested;
  return available[0] ?? null;
}

export function imageGenerationStatus() {
  const available = configuredProviders();
  const active = defaultProvider();
  return {
    available: available.length > 0,
    defaultProvider: active,
    providers: (Object.keys(DEFAULTS) as ImageProviderName[]).map((name) => ({
      name,
      configured: available.includes(name),
      model: process.env[DEFAULTS[name].modelEnv] || DEFAULTS[name].model,
      keyEnv: DEFAULTS[name].keyEnv,
    })),
  };
}

function resolve(request: GenerateImageRequest): { provider: ImageProviderName; model: string; key: string } {
  const available = configuredProviders();
  if (available.length === 0) {
    throw new ImageGenerationError(
      `No image generation provider is configured. Set one of ${Object.values(DEFAULTS).map((d) => d.keyEnv).join(", ")} on the deployment. Until then, upload an image you already have with sourceUrl, or draw one with the svg parameter, which needs no provider at all.`
    );
  }
  const asked = (request.provider || "").trim().toLowerCase();
  if (asked && !(asked in DEFAULTS)) {
    throw new ImageGenerationError(`Unknown provider "${asked}". Valid: ${Object.keys(DEFAULTS).join(", ")}.`);
  }
  if (asked && !available.includes(asked as ImageProviderName)) {
    throw new ImageGenerationError(`Provider "${asked}" has no API key on this deployment. Configured: ${available.join(", ") || "none"}.`);
  }
  const provider = (asked as ImageProviderName) || defaultProvider()!;
  const config = DEFAULTS[provider];
  return {
    provider,
    model: (request.model || process.env[config.modelEnv] || config.model).trim(),
    key: process.env[config.keyEnv]!,
  };
}

/** Shared tail of every provider call: confirm the bytes really are an
 * image type the Media Library accepts, and that they fit, before any of
 * this reaches sharp or R2. A provider returning an error page with a 200
 * is a real failure mode, so the content type is checked rather than
 * trusted. */
function finish(bytes: Buffer, rawContentType: string, provider: ImageProviderName, model: string): GeneratedImage {
  const contentType = rawContentType.split(";")[0].trim().toLowerCase();
  if (!ALLOWED_IMAGE_TYPES[contentType]) {
    throw new ImageGenerationError(`${provider} returned "${contentType || "no content type"}" rather than an image. Model "${model}" may not be an image model, or the prompt was refused.`);
  }
  if (bytes.length === 0) throw new ImageGenerationError(`${provider} returned an empty image.`);
  if (bytes.length > MAX_IMAGE_SIZE) {
    throw new ImageGenerationError(`${provider} returned ${(bytes.length / 1024 / 1024).toFixed(1)}MB, over the 5MB limit. Ask for a smaller size or a lower quality.`);
  }
  return { bytes, contentType, provider, model };
}

async function readError(response: Response, provider: string): Promise<never> {
  const text = await response.text().catch(() => "");
  // Trimmed hard: a provider's error body can be an entire HTML page, and
  // the useful part is always at the front.
  throw new ImageGenerationError(`${provider} refused the request (HTTP ${response.status}). ${text.slice(0, 400)}`.trim());
}

/** Pollinations' plain GET endpoint, which answers with the image bytes
 * directly -- no JSON envelope and no base64 round-trip, unlike its own
 * OpenAI-compatible route. POLLINATIONS_IMAGE_ENDPOINT exists so a
 * deployment can point at a different host without a code change. */
async function generateWithPollinations(request: GenerateImageRequest, model: string, key: string): Promise<GeneratedImage> {
  const base = (process.env.POLLINATIONS_IMAGE_ENDPOINT || "https://gen.pollinations.ai/image").replace(/\/$/, "");
  const url = new URL(`${base}/${encodeURIComponent(request.prompt)}`);
  url.searchParams.set("model", model);
  if (request.width) url.searchParams.set("width", String(request.width));
  if (request.height) url.searchParams.set("height", String(request.height));
  if (request.quality) url.searchParams.set("quality", request.quality);
  if (request.transparent) url.searchParams.set("transparent", "true");

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(GENERATION_TIMEOUT_MS),
  });
  if (!response.ok) await readError(response, "Pollinations");
  const bytes = Buffer.from(await response.arrayBuffer());
  return finish(bytes, response.headers.get("content-type") || "", "pollinations", model);
}

/** OpenAI's images endpoint. b64_json rather than a URL: one request
 * instead of two, and no outbound fetch of a short-lived URL that could
 * expire between the two calls. */
async function generateWithOpenai(request: GenerateImageRequest, model: string, key: string): Promise<GeneratedImage> {
  const body: Record<string, unknown> = { model, prompt: request.prompt, n: 1 };
  if (request.width && request.height) body.size = `${request.width}x${request.height}`;
  if (request.quality) body.quality = request.quality;
  if (request.transparent) body.background = "transparent";

  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(GENERATION_TIMEOUT_MS),
  });
  if (!response.ok) await readError(response, "OpenAI");
  const payload = (await response.json()) as { data?: { b64_json?: string; url?: string }[] };
  const first = payload.data?.[0];
  if (!first?.b64_json) {
    throw new ImageGenerationError(`OpenAI returned no image data for model "${model}".`);
  }
  // gpt-image-* always answers PNG; there is no content type on a
  // base64 field to read it from.
  return finish(Buffer.from(first.b64_json, "base64"), "image/png", "openai", model);
}

/** Gemini's native generateContent, which returns the image as an
 * inlineData part alongside any text the model felt like adding. */
async function generateWithGemini(request: GenerateImageRequest, model: string, key: string): Promise<GeneratedImage> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: request.prompt }] }],
      generationConfig: { responseModalities: ["IMAGE"] },
    }),
    signal: AbortSignal.timeout(GENERATION_TIMEOUT_MS),
  });
  if (!response.ok) await readError(response, "Gemini");
  const payload = (await response.json()) as {
    candidates?: { content?: { parts?: { inlineData?: { data?: string; mimeType?: string } }[] } }[];
  };
  const part = payload.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
  if (!part?.inlineData?.data) {
    throw new ImageGenerationError(`Gemini returned no image for model "${model}". It may have answered with text instead, or refused the prompt.`);
  }
  return finish(Buffer.from(part.inlineData.data, "base64"), part.inlineData.mimeType || "image/png", "gemini", model);
}

export async function generateImage(request: GenerateImageRequest): Promise<GeneratedImage> {
  const prompt = request.prompt.trim();
  if (!prompt) throw new ImageGenerationError("prompt is required: describe the image to generate.");
  const { provider, model, key } = resolve({ ...request, prompt });
  const call = { pollinations: generateWithPollinations, openai: generateWithOpenai, gemini: generateWithGemini }[provider];
  try {
    return await call({ ...request, prompt }, model, key);
  } catch (error) {
    if (error instanceof ImageGenerationError) throw error;
    // A timeout or a dropped connection, which otherwise surfaces as a
    // bare "fetch failed" with nothing to act on.
    const reason = error instanceof Error ? error.message : String(error);
    throw new ImageGenerationError(`${provider} did not answer (model "${model}"): ${reason}`);
  }
}
