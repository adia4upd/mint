import Anthropic from "@anthropic-ai/sdk";
import { DEFAULT_MODEL_ID, isValidModelId } from "@/app/lib/models";
import { fetchUrl } from "@/app/lib/fetch-url";

export const maxDuration = 120;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `당신은 "mint"의 해외영상 리빌드 작가입니다.
- 외국어 영상/기사 원본을 단순 번역하지 않습니다. 한국인 시청자용 대본으로 **리빌드**합니다.
- 원본의 핵심 메시지·데이터·예시는 유지하되, 한국 맥락에 맞게 사례를 치환하거나 해설을 더합니다.
- 구조: 강한 훅(0~3초) → 본문(핵심 3~5포인트, 구어체) → CTA(한 줄).
- 원본에 없는 허위 정보는 만들지 않습니다. 불확실하면 "원본 기준 ~라고 전해집니다" 식으로 표기합니다.
- 출력: 제목 1줄 + 대본 본문. 머리말/해설은 생략합니다.`;

type Body = {
  source?: string;
  tone?: string;
  length?: string;
  guidelines?: string;
  model?: string;
};

type SseEvent =
  | { type: "status"; label: string }
  | { type: "text"; text: string }
  | { type: "error"; message: string }
  | { type: "done" };

function sseEncode(e: SseEvent) {
  return `data: ${JSON.stringify(e)}\n\n`;
}

function looksLikeUrl(s: string) {
  return /^https?:\/\//i.test(s.trim());
}

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json(
      { error: "ANTHROPIC_API_KEY가 설정되지 않았습니다." },
      { status: 500 },
    );
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "잘못된 JSON" }, { status: 400 });
  }

  const source = (body.source ?? "").trim();
  if (!source) {
    return Response.json(
      { error: "source가 비어 있습니다." },
      { status: 400 },
    );
  }

  const tone = (body.tone ?? "친근").trim();
  const length = (body.length ?? "2분").trim();
  const guidelines = (body.guidelines ?? "").trim();
  const model = isValidModelId(body.model) ? body.model : DEFAULT_MODEL_ID;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: SseEvent) =>
        controller.enqueue(encoder.encode(sseEncode(e)));

      let originalText = source;
      let fetchedMeta = "";

      try {
        if (looksLikeUrl(source)) {
          send({ type: "status", label: "🔗 URL에서 원본 읽는 중…" });
          const r = await fetchUrl(source);
          fetchedMeta = `원본 URL: ${r.finalUrl}\n제목: ${r.title ?? "(없음)"}\n`;
          originalText = r.text;
          if (!originalText.trim()) {
            throw new Error("URL 본문을 읽지 못했습니다.");
          }
        }

        const userContent = [
          fetchedMeta && `[메타]\n${fetchedMeta}`,
          `[원본]\n${originalText}`,
          `[요청]\n- 톤: ${tone}\n- 길이: ${length}`,
          guidelines && `[대본 지침]\n${guidelines}`,
        ]
          .filter(Boolean)
          .join("\n\n");

        send({ type: "status", label: "✍️ 한국어 대본으로 리빌드 중…" });

        const anthropicStream = client.messages.stream({
          model,
          max_tokens: 3000,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: userContent }],
        });
        for await (const event of anthropicStream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            send({ type: "text", text: event.delta.text });
          }
        }
        send({ type: "done" });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "stream error";
        send({ type: "error", message: msg });
        send({ type: "done" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      Connection: "keep-alive",
    },
  });
}
