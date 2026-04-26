import Anthropic from "@anthropic-ai/sdk";
import { DEFAULT_MODEL_ID, isValidModelId } from "@/app/lib/models";

export const maxDuration = 300;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function sanitizePrompt(text: string) {
  if (!text) return "";
  return (
    text
      .replace(
        /\b(nude|naked|topless|bare skin|bare chest|bare shoulder|undressed|露出|노출|벗은|裸)\b/gi,
        "wearing casual clothes",
      )
      .replace(
        /\b(blood|gore|wound|corpse|dead body|severed|dismember)\b/gi,
        "dramatic scene",
      )
      .replace(
        /\b(sexy|seductive|provocative|erotic|lingerie|bikini)\b/gi,
        "elegant, stylish",
      )
      .replace(
        /\b(gun|rifle|pistol|weapon|knife|sword|dagger)\b/gi,
        "object",
      )
      .replace(
        /\b(drug|cocaine|heroin|marijuana|syringe)\b/gi,
        "item",
      ) + ", safe for all audiences, appropriate attire"
  );
}

type RawScene = {
  sceneNumber?: number;
  script?: string;
  stageDirection?: string;
  motion?: string;
};

type Scene = {
  sceneNumber: number;
  script: string;
  stageDirection: string;
  motion: string;
  charCount: number;
  estimatedDuration: number;
  mediaType: "video" | "image";
  kenBurns?: string;
};

function assignMediaTypes(scenes: Scene[], format: string): Scene[] {
  const total = scenes.length;
  if (format === "shorts") {
    return scenes.map((s) => ({ ...s, mediaType: "video" as const }));
  }

  const introCount = Math.max(2, Math.round(total * 0.3));

  return scenes.map((scene, i) => {
    let mediaType: "video" | "image";
    if (i < introCount) mediaType = "video";
    else if (i === total - 1) mediaType = "video";
    else mediaType = (i - introCount) % 2 === 0 ? "video" : "image";

    const kenBurns =
      mediaType === "image"
        ? ["zoom-in", "zoom-out", "pan-left", "pan-right", "ken-burns"][i % 5]
        : undefined;

    return { ...scene, mediaType, kenBurns };
  });
}

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json(
      { error: "ANTHROPIC_API_KEY가 설정되지 않았습니다." },
      { status: 500 },
    );
  }

  let body: {
    script?: string;
    style?: string;
    format?: string;
    ratio?: string;
    model?: string;
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "잘못된 JSON" }, { status: 400 });
  }

  const script = (body.script ?? "").trim();
  if (!script) {
    return Response.json(
      { error: "대본을 입력해주세요." },
      { status: 400 },
    );
  }

  const style = body.style || "실사풍";
  const format = body.format || "longform";
  const ratio = body.ratio || (format === "shorts" ? "9:16" : "16:9");
  const model = isValidModelId(body.model) ? body.model : DEFAULT_MODEL_ID;

  const aspectHint =
    ratio === "9:16"
      ? "vertical 9:16 composition, portrait framing, tall aspect"
      : ratio === "1:1"
      ? "square 1:1 composition, centered framing"
      : "horizontal 16:9 composition, landscape framing, cinematic wide";
  const isShorts = format === "shorts";
  const charCount = script.replace(/\s/g, "").length;
  const estimatedMin = charCount / 320;
  const targetScenes = isShorts
    ? Math.max(4, Math.round(estimatedMin * 6))
    : Math.max(6, Math.round(estimatedMin * 4));
  const stageLen = estimatedMin >= 10 ? "15~25단어" : "25~40단어";

  const userContent = `아래 대본을 영상 제작용 씬으로 분할하고, 각 씬의 이미지 프롬프트를 생성하세요.

[대본]
${script}

[영상 규격]
- 화면비: ${ratio} (${aspectHint})

[규칙]
1. 씬 분할: 자연스러운 문장 단위로 2~4문장씩 끊기 (10~20초 분량)
2. 각 씬의 나레이션(script)은 한국어 40~80자 내외
3. 전체 약 ${targetScenes}개 씬으로 분할
4. 각 씬에 영문 이미지 프롬프트(stageDirection) 작성 (${stageLen}):
   - 인물 외모/표정/행동 + 배경 + 조명 + 카메라
   - 스타일: ${style}
   - **프롬프트 끝에 반드시 "${aspectHint}" 포함**
5. motion: 카메라 또는 인물의 동작 (영문, 5단어 이내)

⚠️ 스타일 일관성:
- "styleGuide": 주인공 외모(성별·나이·헤어·의상·체형) + 배경 톤 + 아트 스타일 고정 (영문 30단어 이내)
- 모든 씬 stageDirection 앞에 styleGuide 핵심만 간략히 반복
- 같은 캐릭터 외모 묘사는 모든 씬에서 동일하게 유지
- 화면비 힌트(${aspectHint})는 모든 씬에 일관되게 포함

⚠️ 안전 규칙: 선정적/폭력적/무기/약물 묘사 금지, 전 연령 시청 가능

JSON만 반환 (마크다운 없이):
{
  "styleGuide": "...",
  "scenes": [
    { "sceneNumber": 1, "script": "한국어 나레이션", "stageDirection": "...", "motion": "..." }
  ]
}`;

  try {
    const msg = await client.messages.create({
      model,
      max_tokens: 16000,
      messages: [{ role: "user", content: userContent }],
    });

    const first = msg.content[0];
    if (first.type !== "text") {
      return Response.json({ error: "응답 파싱 실패" }, { status: 500 });
    }
    const text = first.text;

    let parsed: RawScene[];
    let styleGuide = "";
    const objMatch = text.match(/\{[\s\S]*\}/);
    const arrMatch = text.match(/\[[\s\S]*\]/);
    if (objMatch) {
      const obj = JSON.parse(objMatch[0]);
      styleGuide = obj.styleGuide || "";
      parsed = obj.scenes || [];
    } else if (arrMatch) {
      parsed = JSON.parse(arrMatch[0]);
    } else {
      return Response.json(
        { error: "씬 분할 결과를 파싱할 수 없습니다." },
        { status: 500 },
      );
    }

    let scenes: Scene[] = parsed.map((s, i) => {
      let sd = sanitizePrompt(s.stageDirection || "");
      if (sd && !sd.toLowerCase().includes(ratio.toLowerCase())) {
        sd = `${sd.replace(/[,\s]+$/, "")}, ${aspectHint}`;
      }
      return {
        sceneNumber: i + 1,
        script: s.script || "",
        stageDirection: sd,
        motion: s.motion || "",
        charCount: (s.script || "").replace(/\s/g, "").length,
        estimatedDuration: Math.round(
          (s.script || "").replace(/\s/g, "").length * 0.19,
        ),
        mediaType: "video",
      };
    });

    scenes = assignMediaTypes(scenes, format);

    return Response.json({ scenes, styleGuide });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "오류가 발생했습니다.";
    return Response.json({ error: msg }, { status: 500 });
  }
}
