import Anthropic from "@anthropic-ai/sdk";
import { DEFAULT_MODEL_ID, isValidModelId } from "@/app/lib/models";

export const maxDuration = 120;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `당신은 "mint"의 AI 스토리보드 디렉터입니다.
주어진 대본과 영상 길이로 씬 단위 스토리보드를 생성합니다.

규칙:
- 출력은 **엄격한 JSON 배열**만. 설명·주석·코드펜스 없이 바로 시작.
- 각 씬 객체 키: "idx"(1부터), "duration"(초), "visual"(한 줄, 구체적 시각 묘사), "narration"(대본 인용/요약), "subtitle"(15자 이내 자막), "motion"(짧은 연출 메모: 줌·팬·컷 등)
- 씬 수는 영상 길이에 맞게 자연스럽게(보통 30초=4~6씬, 1분=8~12씬, 2분=15~20씬).
- duration의 합은 목표 길이(초)와 대략 일치.
- 비주얼은 한국어로 구체적으로(피사체·앵글·조명·분위기 포함).
- 자막은 한 씬당 1문장, 짧게.
`;

type Body = {
  script?: string;
  duration?: number;
  aspect?: string;
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

  const script = (body.script ?? "").trim();
  if (!script) {
    return Response.json(
      { error: "script가 비어 있습니다." },
      { status: 400 },
    );
  }

  const duration = Number.isFinite(body.duration) ? Number(body.duration) : 60;
  const aspect = (body.aspect ?? "9:16").trim();
  const model = isValidModelId(body.model) ? body.model : DEFAULT_MODEL_ID;
  const encoder = new TextEncoder();

  const userContent = `[대본]\n${script}\n\n[요청]\n- 목표 길이: ${duration}초\n- 화면비: ${aspect}\n- 위 규칙에 맞춰 JSON 배열만 출력하세요.`;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: SseEvent) =>
        controller.enqueue(encoder.encode(sseEncode(e)));
      try {
        send({ type: "status", label: "🎬 씬 구성 중…" });
        const anthropicStream = client.messages.stream({
          model,
          max_tokens: 4000,
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
