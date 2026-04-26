import Anthropic from "@anthropic-ai/sdk";
import { DEFAULT_MODEL_ID, isValidModelId } from "@/app/lib/models";

export const maxDuration = 120;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `당신은 "mint"의 유튜브 플레이리스트 기획자입니다.
주어진 분위기/테마에 맞는 플레이리스트 콘텐츠를 한국어로 기획합니다.

출력 형식 (마크다운):
## 플레이리스트 제목
감성적이고 검색 친화적인 제목 3안 (한국어+이모지 1개)

## 썸네일 카피
- 큰 문구(8자 이내) 3안
- 작은 문구(15자 이내) 3안

## 분위기 태그
#태그1 #태그2 #태그3 #태그4 #태그5

## 트랙리스트 10곡
| # | 곡명 | 아티스트 | 한 줄 설명 |
| --- | --- | --- | --- |
(실제 존재하는 곡으로 추천, 불확실하면 '확인 필요' 표시)

## 영상 소개글
짧은 설명 2~3문장 (해시태그 3~5개 포함)
`;

type Body = {
  theme?: string;
  count?: number;
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

  const theme = (body.theme ?? "").trim();
  if (!theme) {
    return Response.json(
      { error: "theme이 비어 있습니다." },
      { status: 400 },
    );
  }

  const count = Number.isFinite(body.count)
    ? Math.max(5, Math.min(30, Number(body.count)))
    : 10;
  const model = isValidModelId(body.model) ? body.model : DEFAULT_MODEL_ID;
  const encoder = new TextEncoder();

  const userContent = `[테마/분위기]\n${theme}\n\n[요청]\n- 트랙 수: ${count}곡\n- 위 형식에 맞춰 바로 출력해 주세요.`;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: SseEvent) =>
        controller.enqueue(encoder.encode(sseEncode(e)));
      try {
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
