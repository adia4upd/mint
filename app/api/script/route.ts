import Anthropic from "@anthropic-ai/sdk";
import { DEFAULT_MODEL_ID, isValidModelId } from "@/app/lib/models";

export const maxDuration = 120;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `당신은 1인 콘텐츠 크리에이터의 "mint" 대본 작가입니다.
- 한국어로, 듣기 좋은 구어체 대본을 작성합니다.
- 구성: 강한 훅(0~3초) → 본문(맥락·근거·예시) → CTA(한 줄).
- 나레이션 중심으로 쓰고, 꼭 필요한 경우에만 괄호로 짧은 연출 메모를 덧붙입니다.
- 플랫폼/길이/타깃이 주어지면 우선 반영합니다.
- 지침(가이드라인)이 있으면 최우선으로 따릅니다.
- 출력은 제목 한 줄 + 대본 본문. 불필요한 머리말/해설은 쓰지 않습니다.`;

type Body = {
  topic?: string;
  guidelines?: string;
  model?: string;
};

type SseEvent =
  | { type: "text"; text: string }
  | { type: "error"; message: string }
  | { type: "done" };

function sseEncode(e: SseEvent) {
  return `data: ${JSON.stringify(e)}\n\n`;
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

  const topic = (body.topic ?? "").trim();
  if (!topic) {
    return Response.json({ error: "topic이 비어 있습니다." }, { status: 400 });
  }

  const guidelines = (body.guidelines ?? "").trim();
  const model = isValidModelId(body.model) ? body.model : DEFAULT_MODEL_ID;
  const encoder = new TextEncoder();

  const userContent = guidelines
    ? `[주제/요청]\n${topic}\n\n[대본 지침]\n${guidelines}`
    : `[주제/요청]\n${topic}`;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: SseEvent) => controller.enqueue(encoder.encode(sseEncode(e)));
      try {
        const anthropicStream = client.messages.stream({
          model,
          max_tokens: 2048,
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
