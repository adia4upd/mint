import Anthropic from "@anthropic-ai/sdk";
import { DEFAULT_MODEL_ID, isValidModelId } from "@/app/lib/models";

export const maxDuration = 120;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `당신은 "mint"의 트렌드 리서처입니다.
- 주어진 키워드/주제에 대해 web_search 도구로 최근 정보를 조사합니다(필요 시 여러 번).
- 크리에이터 관점에서 다음 5개 섹션으로 정리합니다:
  1) 지금 뜨는 포인트(짧게 3~5개)
  2) 대표 사례/숫자 (출처 기반)
  3) 왜 지금 뜨는가 (맥락·계기)
  4) 크리에이터 활용 아이디어 3~5개 (숏폼·롱폼 구체적으로)
  5) 주의/리스크 한 줄
- 한국어, 간결하게. 추측성 주장은 지양하고, 확실치 않으면 "확인 필요" 로 표기합니다.`;

const WEB_SEARCH_TOOL = {
  type: "web_search_20250305",
  name: "web_search",
  max_uses: 8,
} as unknown as Anthropic.Tool;

type Body = {
  keyword?: string;
  model?: string;
};

type SseEvent =
  | { type: "status"; label: string }
  | { type: "text"; text: string }
  | { type: "search_result"; url: string; title: string }
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

  const keyword = (body.keyword ?? "").trim();
  if (!keyword) {
    return Response.json(
      { error: "keyword가 비어 있습니다." },
      { status: 400 },
    );
  }
  const model = isValidModelId(body.model) ? body.model : DEFAULT_MODEL_ID;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: SseEvent) =>
        controller.enqueue(encoder.encode(sseEncode(e)));
      try {
        const anthropicStream = client.messages.stream({
          model,
          max_tokens: 3000,
          system: SYSTEM_PROMPT,
          tools: [WEB_SEARCH_TOOL],
          messages: [
            {
              role: "user",
              content: `키워드: ${keyword}\n\n위 키워드에 대한 최근 트렌드를 조사해서 정리해 주세요.`,
            },
          ],
        });

        for await (const event of anthropicStream) {
          if (event.type === "content_block_start") {
            const block = event.content_block as {
              type: string;
              name?: string;
              content?: unknown;
            };
            if (
              block.type === "server_tool_use" &&
              block.name === "web_search"
            ) {
              send({ type: "status", label: "🔍 웹 검색 중…" });
            } else if (block.type === "web_search_tool_result") {
              const content = block.content;
              if (Array.isArray(content)) {
                for (const c of content as Array<{
                  type?: string;
                  url?: string;
                  title?: string;
                }>) {
                  if (c.type === "web_search_result" && c.url) {
                    send({
                      type: "search_result",
                      url: c.url,
                      title: c.title ?? c.url,
                    });
                  }
                }
              }
            }
          }
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
