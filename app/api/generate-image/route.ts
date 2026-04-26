import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export const maxDuration = 300;

const VALID_RATIOS = ["9:16", "16:9", "1:1"] as const;
type Ratio = (typeof VALID_RATIOS)[number];

function normalizeRatio(input?: string): Ratio {
  if (input && (VALID_RATIOS as readonly string[]).includes(input)) return input as Ratio;
  const map: Record<string, Ratio> = {
    "9/16": "9:16",
    "16/9": "16:9",
    "1/1": "1:1",
    portrait: "9:16",
    landscape: "16:9",
    square: "1:1",
  };
  return (input && map[input]) || "16:9";
}

function optimizeForImagen(prompt: string) {
  let p = prompt;
  p = p.replace(/[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]+/g, "").trim();
  p = p.replace(/,\s*,/g, ",").replace(/\s{2,}/g, " ").trim();
  if (p.length > 500) p = p.slice(0, 500).replace(/,?\s*[^,]*$/, "");
  const booster =
    "ultra-detailed, sharp focus, professional quality, award-winning photography, 8K resolution";
  if (!p.toLowerCase().includes("ultra-detailed") && !p.toLowerCase().includes("8k")) {
    p = `${p}, ${booster}`;
  }
  return p;
}

function composePrompt(basePrompt: string, style?: string, ratio?: Ratio) {
  const ratioHints: Record<Ratio, string> = {
    "9:16": "VERTICAL portrait 9:16",
    "16:9": "HORIZONTAL landscape 16:9",
    "1:1": "SQUARE 1:1",
  };
  const hintKey = ratio ? ratioHints[ratio] : "";
  const hasRatio = hintKey && basePrompt.includes(hintKey);
  const ratioHint = hasRatio ? "" : hintKey ? hintKey + ", " : "";
  const styleHint =
    style && style !== "실사풍" && !basePrompt.includes("[Style:")
      ? `[Style: ${style}, consistent visual style] `
      : "";
  return ratioHint + styleHint + basePrompt;
}

async function saveImageFromBase64(base64: string, mimeType = "image/png") {
  const ext = mimeType.includes("jpeg") ? "jpg" : mimeType.includes("webp") ? "webp" : "png";
  const id = `img_${Date.now()}_${randomUUID().slice(0, 8)}`;
  const filename = `${id}.${ext}`;
  const dir = path.join(process.cwd(), "public", "assets");
  await mkdir(dir, { recursive: true });
  const filepath = path.join(dir, filename);
  await writeFile(filepath, Buffer.from(base64, "base64"));
  return { id, url: `/assets/${filename}` };
}

async function saveImageFromUrl(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`이미지 다운로드 실패: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const mime = res.headers.get("content-type") || "image/png";
  const ext = mime.includes("jpeg") ? "jpg" : mime.includes("webp") ? "webp" : "png";
  const id = `img_${Date.now()}_${randomUUID().slice(0, 8)}`;
  const filename = `${id}.${ext}`;
  const dir = path.join(process.cwd(), "public", "assets");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, filename), buf);
  return { id, url: `/assets/${filename}` };
}

type GenResult = {
  id: string;
  url: string;
  model: string;
  ratio: Ratio;
  prompt: string;
};

async function tryDalle(
  apiKey: string,
  prompt: string,
  ratio: Ratio,
  basePrompt: string,
): Promise<GenResult | null> {
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "dall-e-3",
      prompt,
      n: 1,
      size: ratio === "9:16" ? "1024x1792" : ratio === "1:1" ? "1024x1024" : "1792x1024",
      quality: "hd",
      response_format: "b64_json",
    }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`DALL-E ${res.status}: ${txt.slice(0, 200)}`);
  }
  const data = await res.json();
  const b64 = data?.data?.[0]?.b64_json as string | undefined;
  if (!b64) return null;
  const saved = await saveImageFromBase64(b64);
  return { ...saved, model: "dall-e-3", ratio, prompt: basePrompt };
}

async function tryGeminiImagen(
  apiKey: string,
  prompt: string,
  ratio: Ratio,
  basePrompt: string,
): Promise<GenResult | null> {
  const imagenPrompt = optimizeForImagen(prompt);
  for (let attempt = 0; attempt < 2; attempt++) {
    const retryPrompt =
      attempt === 0
        ? imagenPrompt
        : imagenPrompt
            .replace(/dramatic|intense|violent|blood|dead|dark/gi, "cinematic")
            .replace(/sexy|seductive/gi, "elegant");
    // Try Imagen 4 first (paid), then fall through to gemini-image (free-tier-eligible)
    const imagenRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instances: [{ prompt: retryPrompt }],
          parameters: { sampleCount: 1, aspectRatio: ratio },
        }),
      },
    );
    if (imagenRes.ok) {
      const data = await imagenRes.json();
      const b64 = data?.predictions?.[0]?.bytesBase64Encoded as string | undefined;
      if (b64) {
        const saved = await saveImageFromBase64(b64);
        return { ...saved, model: "imagen-4.0", ratio, prompt: basePrompt };
      }
    }
    if (imagenRes.status !== 400 && imagenRes.status !== 403 && imagenRes.status !== 429) {
      const errText = await imagenRes.text().catch(() => "");
      throw new Error(`Imagen ${imagenRes.status}: ${errText.slice(0, 200)}`);
    }
    if (imagenRes.status === 400 && attempt === 0) continue;

    // Fallback: gemini-2.5-flash-image via generateContent
    const fallbackRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: retryPrompt }] }],
          generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
        }),
      },
    );
    if (fallbackRes.ok) {
      const data = await fallbackRes.json();
      const parts = data?.candidates?.[0]?.content?.parts ?? [];
      const imgPart = parts.find(
        (p: { inlineData?: { mimeType?: string; data?: string } }) =>
          p.inlineData?.mimeType?.startsWith("image/"),
      );
      const b64 = imgPart?.inlineData?.data as string | undefined;
      const mime = (imgPart?.inlineData?.mimeType as string | undefined) ?? "image/png";
      if (b64) {
        const saved = await saveImageFromBase64(b64, mime);
        return { ...saved, model: "gemini-2.5-flash-image", ratio, prompt: basePrompt };
      }
    }
    if (fallbackRes.status === 400 && attempt === 0) continue;
    const errText = await fallbackRes.text().catch(() => "");
    throw new Error(`Gemini ${fallbackRes.status}: ${errText.slice(0, 200)}`);
  }
  return null;
}

async function tryGrok(
  apiKey: string,
  prompt: string,
  ratio: Ratio,
  basePrompt: string,
): Promise<GenResult | null> {
  const MAX_RETRIES = 3;
  let lastErr = "";
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const res = await fetch("https://api.x.ai/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "grok-imagine-image",
        prompt,
        n: 1,
        aspect_ratio: ratio,
        resolution: "1k",
        response_format: "b64_json",
      }),
    });
    if (res.ok) {
      const data = await res.json();
      const b64 = data?.data?.[0]?.b64_json as string | undefined;
      const url = data?.data?.[0]?.url as string | undefined;
      if (b64) {
        const saved = await saveImageFromBase64(b64);
        return { ...saved, model: "grok-imagine-image", ratio, prompt: basePrompt };
      }
      if (url) {
        const saved = await saveImageFromUrl(url);
        return { ...saved, model: "grok-imagine-image", ratio, prompt: basePrompt };
      }
      return null;
    }
    if (res.status === 429 && attempt < MAX_RETRIES - 1) {
      const wait = (attempt + 1) * 10;
      await new Promise((r) => setTimeout(r, wait * 1000));
      continue;
    }
    const errText = await res.text().catch(() => "");
    lastErr = `Grok ${res.status}: ${errText.slice(0, 200)}`;
    throw new Error(lastErr);
  }
  throw new Error(lastErr || "Grok 재시도 한도 초과");
}

async function tryMinimax(
  apiKey: string,
  prompt: string,
  ratio: Ratio,
  basePrompt: string,
  characterReferenceUrl?: string,
): Promise<GenResult | null> {
  const body: Record<string, unknown> = {
    model: "image-01",
    prompt,
    aspect_ratio: ratio,
    response_format: "base64",
    n: 1,
  };
  if (characterReferenceUrl) {
    body.subject_reference = [
      { type: "character", image_file: characterReferenceUrl },
    ];
  }
  const res = await fetch("https://api.minimax.io/v1/image_generation", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`MiniMax ${res.status}: ${txt.slice(0, 200)}`);
  }
  const data = await res.json();
  const b64 = data?.data?.image_base64?.[0] as string | undefined;
  if (!b64) return null;
  const saved = await saveImageFromBase64(b64);
  return {
    ...saved,
    model: characterReferenceUrl ? "minimax-character-ref" : "minimax-image-01",
    ratio,
    prompt: basePrompt,
  };
}

export async function POST(req: Request) {
  try {
    const body: {
      prompt?: string;
      model?: string;
      style?: string;
      ratio?: string;
      characterReferenceUrl?: string;
    } = await req.json();

    const ratio = normalizeRatio(body.ratio);
    const basePrompt = (body.prompt || "")
      .replace(/^#\s*/gm, "")
      .replace(/\n/g, ", ")
      .trim();

    if (!basePrompt) {
      return Response.json({ error: "프롬프트가 필요합니다." }, { status: 400 });
    }

    const fullPrompt = composePrompt(basePrompt, body.style, ratio);
    const selected = body.model || "dall-e";
    const errors: string[] = [];

    // === dall-e / gemini: DALL-E → Gemini Imagen → Grok fallback chain ===
    if (selected === "dall-e" || selected === "gemini") {
      const openaiKey = process.env.OPENAI_API_KEY;
      if (openaiKey) {
        try {
          const r = await tryDalle(openaiKey, fullPrompt, ratio, basePrompt);
          if (r) return Response.json(r);
        } catch (e) {
          errors.push(e instanceof Error ? e.message : String(e));
        }
      } else {
        errors.push("OPENAI_API_KEY 없음");
      }

      const geminiKey = process.env.GEMINI_API_KEY;
      if (geminiKey) {
        try {
          const r = await tryGeminiImagen(geminiKey, fullPrompt, ratio, basePrompt);
          if (r) return Response.json(r);
        } catch (e) {
          errors.push(e instanceof Error ? e.message : String(e));
        }
      } else {
        errors.push("GEMINI_API_KEY 없음");
      }

      const xaiKey = process.env.XAI_API_KEY;
      if (xaiKey) {
        try {
          const r = await tryGrok(xaiKey, fullPrompt, ratio, basePrompt);
          if (r) return Response.json(r);
        } catch (e) {
          errors.push(e instanceof Error ? e.message : String(e));
        }
      } else {
        errors.push("XAI_API_KEY 없음");
      }

      return Response.json(
        {
          error: "이미지 생성 실패 (DALL-E → Gemini → Grok 폴백 체인 모두 실패)",
          details: errors,
        },
        { status: 500 },
      );
    }

    // === grok ===
    if (selected === "grok") {
      const xaiKey = process.env.XAI_API_KEY;
      if (!xaiKey) {
        return Response.json(
          { error: "XAI_API_KEY가 설정되지 않았습니다." },
          { status: 400 },
        );
      }
      try {
        const r = await tryGrok(xaiKey, fullPrompt, ratio, basePrompt);
        if (r) return Response.json(r);
        return Response.json(
          { error: "Grok 응답에 이미지가 없습니다." },
          { status: 500 },
        );
      } catch (e) {
        return Response.json(
          { error: e instanceof Error ? e.message : "Grok 오류" },
          { status: 500 },
        );
      }
    }

    // === minimax ===
    if (selected === "minimax") {
      const minimaxKey = process.env.MINIMAX_API_KEY;
      if (!minimaxKey) {
        return Response.json(
          { error: "MINIMAX_API_KEY가 설정되지 않았습니다." },
          { status: 400 },
        );
      }
      try {
        const r = await tryMinimax(
          minimaxKey,
          fullPrompt,
          ratio,
          basePrompt,
          body.characterReferenceUrl,
        );
        if (r) return Response.json(r);
        return Response.json(
          { error: "MiniMax 응답에 이미지가 없습니다." },
          { status: 500 },
        );
      } catch (e) {
        return Response.json(
          { error: e instanceof Error ? e.message : "MiniMax 오류" },
          { status: 500 },
        );
      }
    }

    return Response.json(
      { error: `지원하지 않는 모델: ${selected}` },
      { status: 400 },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "오류가 발생했습니다.";
    return Response.json({ error: msg }, { status: 500 });
  }
}
