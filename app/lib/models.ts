export type ChatModel = {
  id: string;
  label: string;
  hint: string;
};

export const CHAT_MODELS: ChatModel[] = [
  {
    id: "claude-sonnet-4-6",
    label: "Sonnet 4.6",
    hint: "균형 · 기본값",
  },
  {
    id: "claude-opus-4-7",
    label: "Opus 4.7",
    hint: "최고 품질 · 느림",
  },
  {
    id: "claude-haiku-4-5-20251001",
    label: "Haiku 4.5",
    hint: "빠름 · 가벼운 대화",
  },
];

export const DEFAULT_MODEL_ID = "claude-sonnet-4-6";

export const isValidModelId = (id: unknown): id is string =>
  typeof id === "string" && CHAT_MODELS.some((m) => m.id === id);

export type ImageModel = {
  id: string;
  label: string;
  hint: string;
  endpoint: "generateContent" | "predict";
};

export const IMAGE_MODELS: ImageModel[] = [
  {
    id: "gemini-2.5-flash-image",
    label: "Nano Banana",
    hint: "무료 · 기본",
    endpoint: "generateContent",
  },
  {
    id: "imagen-4.0-generate-001",
    label: "Imagen 4",
    hint: "유료 · 고품질",
    endpoint: "predict",
  },
];

export const DEFAULT_IMAGE_MODEL_ID = "gemini-2.5-flash-image";

export const isValidImageModelId = (id: unknown): id is string =>
  typeof id === "string" && IMAGE_MODELS.some((m) => m.id === id);
