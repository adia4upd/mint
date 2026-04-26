import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const { imageBase64, mediaType } = await req.json();

    if (!imageBase64) {
      return NextResponse.json({ error: "이미지가 필요합니다." }, { status: 400 });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY가 설정되지 않았습니다." }, { status: 500 });
    }

    const response = await client.messages.create({
      model: "claude-opus-4-7",
      max_tokens: 3000,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mediaType || "image/jpeg",
                data: imageBase64,
              },
            },
            {
              type: "text",
              text: `이 쿠팡 상품 이미지를 분석해서 인스타그램 카드뉴스용 정보와 15초 숏폼 나레이션 대본을 추출해줘.

다음 JSON 형식으로만 응답해:
{
  "productName": "제품명",
  "price": "가격 (있으면)",
  "category": "카테고리",
  "mainBenefit": "핵심 혜택 한 줄 (20자 이내, 강렬하게)",
  "hook": "시선 끄는 훅 문구 (15자 이내, 물음표나 감탄사 활용)",
  "features": [
    "특징1 (20자 이내)",
    "특징2 (20자 이내)",
    "특징3 (20자 이내)"
  ],
  "targetAudience": "타겟 대상 (예: 주부, 직장인, 운동하는 분)",
  "cta": "구매 유도 문구 (15자 이내)",
  "colorTheme": "어울리는 색상 테마 (예: warm, cool, natural, vibrant, minimal)",
  "emoji": "대표 이모지 1개",
  "scripts": {
    "modern": "모던 스타일 나레이션 (내가 직접 써봤는데 진짜 장난 아님 — 친구한테 흥분해서 얘기하는 구어체 썰 형식, / 구분, 110자 이내, 훅 경험담→특징2개 자연스럽게→CTA)",
    "clean": "클린 스타일 나레이션 (어느 날 갑자기 피부가 좋아진 친구한테 물어봤더니 이거였다는 사연 구어체, / 구분, 110자 이내, 발견 계기→특징2개→CTA)",
    "bold": "볼드 스타일 나레이션 (쓰다가 충격받은 썰 — 짧고 강한 구어체, 반전 있게, / 구분, 110자 이내, 반전 훅→특징2개→CTA)",
    "gradient": "그라데이션 스타일 나레이션 (오래 써보고 진심으로 추천하는 감성 구어체, 따뜻한 사연 느낌, / 구분, 110자 이내, 감성 계기→특징2개→CTA)",
    "premium": "프리미엄 스타일 나레이션 (처음엔 반신반의했는데 써보고 납득한 썰 — 자연스럽고 격조 있는 구어체, / 구분, 110자 이내, 의심→확신→CTA)"
  }
}`,
            },
          ],
        },
      ],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: "분석 결과를 파싱할 수 없습니다." }, { status: 500 });
    }

    const product = JSON.parse(jsonMatch[0]);
    return NextResponse.json({ product });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "분석 중 오류가 발생했습니다." }, { status: 500 });
  }
}
