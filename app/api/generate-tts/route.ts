import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export const maxDuration = 300;

async function saveAudio(buf: Buffer, ext: "mp3" | "wav" = "mp3") {
  const id = `tts_${Date.now()}_${randomUUID().slice(0, 8)}`;
  const filename = `${id}.${ext}`;
  const dir = path.join(process.cwd(), "public", "assets");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, filename), buf);
  return { id, url: `/assets/${filename}` };
}

async function tryElevenLabs(
  apiKey: string,
  text: string,
  voiceId: string,
  speed: number,
  stability: number,
  style: number,
) {
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "xi-api-key": apiKey },
      body: JSON.stringify({
        text,
        model_id: "eleven_multilingual_v2",
        voice_settings: {
          stability,
          similarity_boost: 0.9,
          style,
          use_speaker_boost: true,
          speed,
        },
      }),
    },
  );
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`ElevenLabs ${res.status}: ${txt.slice(0, 200)}`);
  }
  const data = await res.json();
  const audioBuffer = Buffer.from(data.audio_base64, "base64");
  const saved = await saveAudio(audioBuffer);
  return {
    ...saved,
    engine: "elevenlabs",
    alignment: data.alignment ?? null,
    duration: data.alignment?.character_end_times_seconds?.slice(-1)?.[0] ?? null,
  };
}

async function tryGoogleTts(apiKey: string, text: string, voiceId: string, speed: number) {
  const voiceName = voiceId.startsWith("ko-KR-") ? voiceId : `ko-KR-Chirp3-HD-${voiceId}`;
  const reqBody = {
    input: text.startsWith("<speak>") ? { ssml: text } : { text },
    voice: { languageCode: "ko-KR", name: voiceName },
    audioConfig: { audioEncoding: "MP3", speakingRate: speed || 1.0 },
  };

  let res = await fetch(
    `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(reqBody),
    },
  );

  if (!res.ok && voiceName.includes("Chirp3-HD")) {
    res = await fetch(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...reqBody,
          voice: { languageCode: "ko-KR", name: "ko-KR-Wavenet-A" },
        }),
      },
    );
  }

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Google TTS ${res.status}: ${txt.slice(0, 200)}`);
  }
  const data = await res.json();
  if (!data.audioContent) throw new Error("Google TTS 오디오 없음");
  const audioBuffer = Buffer.from(data.audioContent, "base64");
  const saved = await saveAudio(audioBuffer);
  return { ...saved, engine: "google", alignment: null, duration: null };
}

export async function POST(req: Request) {
  try {
    const body: {
      text?: string;
      engine?: "elevenlabs" | "google";
      voiceId?: string;
      speed?: number;
      stability?: number;
      style?: number;
    } = await req.json();

    const text = (body.text || "").trim();
    if (!text) {
      return Response.json({ error: "텍스트가 필요합니다." }, { status: 400 });
    }

    const engine = body.engine || "elevenlabs";
    const speed = body.speed ?? 1.0;
    const stability = body.stability ?? 0.75;
    const style = body.style ?? 0.15;

    if (engine === "elevenlabs") {
      const key = process.env.ELEVENLABS_API_KEY;
      if (!key) {
        return Response.json({ error: "ELEVENLABS_API_KEY 미설정" }, { status: 400 });
      }
      // 기본 한국어 보이스 (Rachel-equivalent ko 보이스 또는 사용자 지정)
      const voiceId = body.voiceId || "uyVNoMrnUku1dZyVEXwD";
      const r = await tryElevenLabs(key, text, voiceId, speed, stability, style);
      return Response.json(r);
    }

    if (engine === "google") {
      const key = process.env.GOOGLE_TTS_API_KEY || process.env.GEMINI_API_KEY;
      if (!key) {
        return Response.json(
          { error: "GOOGLE_TTS_API_KEY 미설정" },
          { status: 400 },
        );
      }
      const voiceId = body.voiceId || "Aoede";
      const r = await tryGoogleTts(key, text, voiceId, speed);
      return Response.json(r);
    }

    return Response.json({ error: `지원하지 않는 엔진: ${engine}` }, { status: 400 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "TTS 생성 실패";
    return Response.json({ error: msg }, { status: 500 });
  }
}
