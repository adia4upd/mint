import Anthropic from "@anthropic-ai/sdk";
import {
  DEFAULT_MODEL_ID,
  isValidModelId,
  DEFAULT_IMAGE_MODEL_ID,
  isValidImageModelId,
} from "@/app/lib/models";
import { generateImageGemini, type AspectRatio } from "@/app/lib/image";
import { fetchUrl } from "@/app/lib/fetch-url";

export const maxDuration = 120;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `당신은 1인 콘텐츠 크리에이터를 돕는 "mint"의 AI 어시스턴트입니다.
- 한국어로, 간결하고 구체적으로 답합니다.
- 아이디어/기획/대본 방향이 모호하면 먼저 짧게 되묻습니다.
- 필요하면 번호 리스트로 정리해 보여줍니다.

[이미지 생성]
사용자가 그림/이미지/사진을 요청하면 generate_image 도구를 사용하세요.
- prompt는 영어로 변환해 구체적으로 작성합니다(피사체·분위기·조명·화면비 등).
- 일반 일러스트/풍경은 "1:1", 숏폼/세로는 "9:16", 롱폼/가로는 "16:9" 비율을 선택합니다.
- 이미지 생성 후에는 간단한 한 줄 설명만 덧붙입니다.

[웹 검색]
최신 정보(트렌드·뉴스·통계)나 팩트체크가 필요할 때 web_search 도구를 사용하세요.
- 키워드는 구체적으로 구성합니다(한국어·영어 혼용 가능).
- 결과를 인용할 때는 요점만 간결히 정리하고, 출처는 Claude가 자동으로 인용합니다.
- 크리에이터 관점의 해석/활용 방안을 짧게 덧붙이세요.
- 일반 상식·이미 아는 내용에는 검색하지 않습니다.

[URL 읽기]
사용자가 링크(블로그·기사·문서)를 붙여넣고 "이거 참고" 같은 요청을 하면 fetch_url 도구로 본문을 읽어옵니다.
- 한 번에 URL 하나씩 호출하고, 여러 개면 반복해서 부릅니다.
- 유튜브 영상 페이지는 본문이 거의 없으므로 웹 검색을 함께 활용하세요.
- 읽은 내용은 그대로 옮기지 말고 핵심만 요약·인용하여 크리에이터 관점으로 재해석합니다.`;

type ChatMessage = {
  role: "user" | "assistant";
  content: string | Array<Record<string, unknown>>;
};

const IMAGE_TOOL: Anthropic.Tool = {
  name: "generate_image",
  description:
    "주어진 프롬프트로 이미지를 1장 생성합니다. 사용자가 이미지/그림/사진을 원할 때 사용하세요.",
  input_schema: {
    type: "object" as const,
    properties: {
      prompt: {
        type: "string",
        description: "이미지 생성 프롬프트(영어 권장, 구체적 묘사).",
      },
      aspect_ratio: {
        type: "string",
        enum: ["1:1", "3:4", "4:3", "9:16", "16:9"],
        description: "이미지 비율. 기본값 1:1.",
      },
    },
    required: ["prompt"],
  },
};

type SseEvent =
  | { type: "text"; text: string }
  | { type: "tool_start"; name: string }
  | { type: "image"; url: string; prompt: string }
  | { type: "search_result"; url: string; title: string }
  | { type: "error"; message: string }
  | { type: "done" };

const FETCH_URL_TOOL: Anthropic.Tool = {
  name: "fetch_url",
  description:
    "지정한 URL(블로그·뉴스·문서 등)의 본문을 가져와 제목과 텍스트로 반환합니다. 사용자가 링크를 참고하라고 할 때 사용하세요.",
  input_schema: {
    type: "object" as const,
    properties: {
      url: {
        type: "string",
        description: "읽어올 공개 http/https URL",
      },
    },
    required: ["url"],
  },
};

const WEB_SEARCH_TOOL = {
  type: "web_search_20250305",
  name: "web_search",
  max_uses: 5,
} as unknown as Anthropic.Tool;

function sseEncode(event: SseEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json(
      { error: "ANTHROPIC_API_KEY가 설정되지 않았습니다." },
      { status: 500 },
    );
  }

  let body: { messages?: ChatMessage[]; model?: string; imageModel?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "잘못된 JSON" }, { status: 400 });
  }

  const inputMessages = (body.messages ?? []).filter((m) => {
    if (!m || (m.role !== "user" && m.role !== "assistant")) return false;
    if (typeof m.content === "string") return m.content.trim().length > 0;
    return Array.isArray(m.content) && m.content.length > 0;
  });
  if (inputMessages.length === 0) {
    return Response.json({ error: "messages가 비어 있습니다." }, { status: 400 });
  }

  const model = isValidModelId(body.model) ? body.model : DEFAULT_MODEL_ID;
  const imageModel = isValidImageModelId(body.imageModel)
    ? body.imageModel
    : DEFAULT_IMAGE_MODEL_ID;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: SseEvent) => controller.enqueue(encoder.encode(sseEncode(e)));

      let messages: Anthropic.MessageParam[] = inputMessages.map((m) => ({
        role: m.role,
        content: m.content as Anthropic.MessageParam["content"],
      }));

      try {
        for (let turn = 0; turn < 4; turn++) {
          const anthropicStream = client.messages.stream({
            model,
            max_tokens: 2048,
            system: SYSTEM_PROMPT,
            tools: [IMAGE_TOOL, FETCH_URL_TOOL, WEB_SEARCH_TOOL],
            messages,
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
                send({ type: "tool_start", name: "web_search" });
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

          const finalMessage = await anthropicStream.finalMessage();

          if (finalMessage.stop_reason !== "tool_use") {
            break;
          }

          const toolUses = finalMessage.content.filter(
            (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
          );

          const toolResults: Anthropic.ToolResultBlockParam[] = [];
          for (const tu of toolUses) {
            if (tu.name === "generate_image") {
              const input = tu.input as {
                prompt?: string;
                aspect_ratio?: AspectRatio;
              };
              const prompt = (input.prompt ?? "").trim();
              const aspect: AspectRatio = input.aspect_ratio ?? "1:1";

              if (!prompt) {
                toolResults.push({
                  type: "tool_result",
                  tool_use_id: tu.id,
                  is_error: true,
                  content: "prompt가 비어 있습니다.",
                });
                continue;
              }

              send({ type: "tool_start", name: "generate_image" });
              try {
                const img = await generateImageGemini(prompt, aspect, imageModel);
                send({ type: "image", url: img.dataUrl, prompt });
                toolResults.push({
                  type: "tool_result",
                  tool_use_id: tu.id,
                  content: `이미지 생성 완료: ${prompt}`,
                });
              } catch (err) {
                const msg =
                  err instanceof Error ? err.message : "이미지 생성 실패";
                send({ type: "error", message: msg });
                toolResults.push({
                  type: "tool_result",
                  tool_use_id: tu.id,
                  is_error: true,
                  content: msg,
                });
              }
            } else if (tu.name === "fetch_url") {
              const input = tu.input as { url?: string };
              const url = (input.url ?? "").trim();
              if (!url) {
                toolResults.push({
                  type: "tool_result",
                  tool_use_id: tu.id,
                  is_error: true,
                  content: "url이 비어 있습니다.",
                });
                continue;
              }

              send({ type: "tool_start", name: "fetch_url" });
              try {
                const r = await fetchUrl(url);
                const header = [
                  `제목: ${r.title ?? "(없음)"}`,
                  `최종 URL: ${r.finalUrl}`,
                  `상태: ${r.status}`,
                  `타입: ${r.contentType || "(없음)"}`,
                ].join("\n");
                const body = r.text || "(본문 없음)";
                const suffix = r.truncated ? "\n\n[일부만 읽음]" : "";
                toolResults.push({
                  type: "tool_result",
                  tool_use_id: tu.id,
                  content: `${header}\n\n${body}${suffix}`,
                });
              } catch (err) {
                const msg =
                  err instanceof Error ? err.message : "URL 읽기 실패";
                send({ type: "error", message: msg });
                toolResults.push({
                  type: "tool_result",
                  tool_use_id: tu.id,
                  is_error: true,
                  content: msg,
                });
              }
            } else {
              toolResults.push({
                type: "tool_result",
                tool_use_id: tu.id,
                is_error: true,
                content: `알 수 없는 도구: ${tu.name}`,
              });
            }
          }

          messages = [
            ...messages,
            { role: "assistant", content: finalMessage.content },
            { role: "user", content: toolResults },
          ];
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
