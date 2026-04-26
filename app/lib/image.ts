import { IMAGE_MODELS, DEFAULT_IMAGE_MODEL_ID } from "./models";

const GEMINI_BASE =
  "https://generativelanguage.googleapis.com/v1beta/models";

export type AspectRatio = "1:1" | "3:4" | "4:3" | "9:16" | "16:9";

export type GeneratedImage = {
  dataUrl: string;
  mimeType: string;
  prompt: string;
  aspectRatio: AspectRatio;
  modelId: string;
};

const ASPECT_HINT: Record<AspectRatio, string> = {
  "1:1": "square 1:1 composition",
  "3:4": "portrait 3:4 composition",
  "4:3": "landscape 4:3 composition",
  "9:16": "vertical 9:16 portrait composition, tall frame",
  "16:9": "horizontal 16:9 widescreen composition",
};

export async function generateImageGemini(
  prompt: string,
  aspectRatio: AspectRatio = "1:1",
  modelId: string = DEFAULT_IMAGE_MODEL_ID,
): Promise<GeneratedImage> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY가 설정되지 않았습니다.");

  const model =
    IMAGE_MODELS.find((m) => m.id === modelId) ??
    IMAGE_MODELS.find((m) => m.id === DEFAULT_IMAGE_MODEL_ID)!;

  if (model.endpoint === "predict") {
    return callImagenPredict(model.id, prompt, aspectRatio, key);
  }
  return callGenerateContent(model.id, prompt, aspectRatio, key);
}

async function callGenerateContent(
  modelId: string,
  prompt: string,
  aspectRatio: AspectRatio,
  key: string,
): Promise<GeneratedImage> {
  const fullPrompt = `${prompt}\n\nImage orientation: ${ASPECT_HINT[aspectRatio]}.`;
  const res = await fetch(`${GEMINI_BASE}/${modelId}:generateContent?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: fullPrompt }] }],
      generationConfig: { responseModalities: ["IMAGE"] },
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Gemini ${res.status}: ${errText.slice(0, 300)}`);
  }

  const data: {
    candidates?: Array<{
      content?: {
        parts?: Array<{
          inlineData?: { data?: string; mimeType?: string };
          inline_data?: { data?: string; mime_type?: string };
        }>;
      };
    }>;
  } = await res.json();

  const parts = data.candidates?.[0]?.content?.parts ?? [];
  let b64: string | undefined;
  let mimeType = "image/png";
  for (const p of parts) {
    const inline = p.inlineData ?? p.inline_data;
    const d = inline?.data;
    const mt =
      (p.inlineData?.mimeType as string | undefined) ??
      (p.inline_data?.mime_type as string | undefined);
    if (d) {
      b64 = d;
      if (mt) mimeType = mt;
      break;
    }
  }

  if (!b64) throw new Error("Gemini 응답에 이미지 데이터가 없습니다.");

  return {
    dataUrl: `data:${mimeType};base64,${b64}`,
    mimeType,
    prompt,
    aspectRatio,
    modelId,
  };
}

async function callImagenPredict(
  modelId: string,
  prompt: string,
  aspectRatio: AspectRatio,
  key: string,
): Promise<GeneratedImage> {
  const res = await fetch(`${GEMINI_BASE}/${modelId}:predict?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      instances: [{ prompt }],
      parameters: { sampleCount: 1, aspectRatio },
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Imagen ${res.status}: ${errText.slice(0, 300)}`);
  }

  const data: {
    predictions?: Array<{ bytesBase64Encoded?: string; mimeType?: string }>;
  } = await res.json();
  const pred = data.predictions?.[0];
  if (!pred?.bytesBase64Encoded) {
    throw new Error("Imagen 응답에 이미지 데이터가 없습니다.");
  }
  const mimeType = pred.mimeType || "image/png";
  return {
    dataUrl: `data:${mimeType};base64,${pred.bytesBase64Encoded}`,
    mimeType,
    prompt,
    aspectRatio,
    modelId,
  };
}
