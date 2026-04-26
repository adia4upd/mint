import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export const maxDuration = 300;

const POLL_INTERVAL = 5000;
const MAX_POLL_TIME = 270000;

type Ratio = "9:16" | "16:9" | "1:1";

function normalizeRatio(input?: string): Ratio {
  if (input === "9:16" || input === "16:9" || input === "1:1") return input;
  return "16:9";
}

function extractVideoUrl(obj: unknown, depth = 0): string | null {
  if (depth > 6 || obj == null) return null;
  if (typeof obj === "string") {
    if (/https?:\/\/.+\.(mp4|m3u8|webm)/i.test(obj)) return obj;
    return null;
  }
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const found = extractVideoUrl(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof obj === "object") {
    const rec = obj as Record<string, unknown>;
    const priority = ["video_url", "url", "result_url", "download_url", "video", "content", "data", "result", "output"];
    for (const key of priority) {
      if (key in rec) {
        const found = extractVideoUrl(rec[key], depth + 1);
        if (found) return found;
      }
    }
    for (const [key, val] of Object.entries(rec)) {
      if (priority.includes(key)) continue;
      const found = extractVideoUrl(val, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

async function saveVideoFromUrl(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`영상 다운로드 실패: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const id = `vid_${Date.now()}_${randomUUID().slice(0, 8)}`;
  const filename = `${id}.mp4`;
  const dir = path.join(process.cwd(), "public", "assets");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, filename), buf);
  return { id, url: `/assets/${filename}`, sourceUrl: url };
}

async function saveVideoFromBase64(b64: string) {
  const id = `vid_${Date.now()}_${randomUUID().slice(0, 8)}`;
  const filename = `${id}.mp4`;
  const dir = path.join(process.cwd(), "public", "assets");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, filename), Buffer.from(b64, "base64"));
  return { id, url: `/assets/${filename}`, sourceUrl: null };
}

async function generateGrokVideo(
  apiKey: string,
  prompt: string,
  ratio: Ratio,
  duration: number,
  imageUrl?: string,
) {
  const body: Record<string, unknown> = {
    model: "grok-imagine-video",
    prompt,
    duration,
    aspect_ratio: ratio,
    resolution: "720p",
  };
  if (imageUrl && !imageUrl.startsWith("data:")) {
    body.image_url = imageUrl;
  }

  const initRes = await fetch("https://api.x.ai/v1/videos/generations", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });
  if (!initRes.ok) {
    const txt = await initRes.text().catch(() => "");
    throw new Error(`Grok ${initRes.status}: ${txt.slice(0, 200)}`);
  }
  const initData = await initRes.json();
  const requestId = initData.request_id;
  if (!requestId) throw new Error("Grok 영상 요청 ID 없음");

  const startTime = Date.now();
  while (Date.now() - startTime < MAX_POLL_TIME) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL));
    const pollRes = await fetch(`https://api.x.ai/v1/videos/generations/${requestId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!pollRes.ok) continue;
    const pollData = await pollRes.json();
    const status = pollData.status;
    if (status === "done" || status === "completed") {
      const remoteUrl = extractVideoUrl(pollData);
      if (remoteUrl) {
        const saved = await saveVideoFromUrl(remoteUrl);
        return { ...saved, model: "grok-imagine-video" };
      }
      throw new Error("Grok 응답에 영상 URL 없음");
    }
    if (status === "failed" || status === "expired") {
      throw new Error(`Grok 영상 생성 ${status}`);
    }
  }
  throw new Error("Grok 영상 생성 시간 초과");
}

async function generateVeoVideo(
  apiKey: string,
  modelKey: "veo-3.1" | "veo-3.1-lite",
  prompt: string,
  ratio: Ratio,
  duration: number,
  imageUrl?: string,
) {
  const veoModel =
    modelKey === "veo-3.1-lite" ? "veo-3.1-lite-generate-preview" : "veo-3.1-generate-preview";
  const veoRatio: Ratio = ratio === "9:16" ? "9:16" : "16:9";
  const veoDuration = Math.max(4, Math.min(duration, 8));

  const instance: { prompt: string; image?: { bytesBase64Encoded: string; mimeType: string } } = {
    prompt,
  };
  if (imageUrl) {
    if (imageUrl.startsWith("data:")) {
      const [header, data] = imageUrl.split(",");
      const mimeType = header.match(/data:(.*?);/)?.[1] || "image/png";
      instance.image = { bytesBase64Encoded: data, mimeType };
    } else {
      try {
        const imgRes = await fetch(imageUrl);
        const imgBuf = await imgRes.arrayBuffer();
        const base64 = Buffer.from(imgBuf).toString("base64");
        const mimeType = imgRes.headers.get("content-type") || "image/png";
        instance.image = { bytesBase64Encoded: base64, mimeType };
      } catch {
        // ignore — text-only fallback
      }
    }
  }

  const initRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${veoModel}:predictLongRunning?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        instances: [instance],
        parameters: {
          aspectRatio: veoRatio,
          personGeneration: imageUrl ? "allow_adult" : "allow_all",
        },
      }),
    },
  );
  if (!initRes.ok) {
    const txt = await initRes.text().catch(() => "");
    throw new Error(`Veo ${initRes.status}: ${txt.slice(0, 200)}`);
  }
  const initData = await initRes.json();
  const operationName = initData.name as string | undefined;
  if (!operationName) throw new Error("Veo operation name 없음");

  const VEO_POLL_INTERVAL = 10000;
  const VEO_MAX_POLL = 240000;
  const startTime = Date.now();
  while (Date.now() - startTime < VEO_MAX_POLL) {
    await new Promise((r) => setTimeout(r, VEO_POLL_INTERVAL));
    const pollRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${operationName}?key=${apiKey}`,
    );
    if (!pollRes.ok) continue;
    const pollData = await pollRes.json();
    if (!pollData.done) continue;

    const samples =
      pollData.response?.generateVideoResponse?.generatedSamples ??
      pollData.response?.generatedVideos ??
      pollData.response?.videos ??
      [];
    const videoUri =
      samples[0]?.video?.uri ||
      samples[0]?.video?.url ||
      samples[0]?.uri ||
      samples[0]?.url;
    const videoBase64 = samples[0]?.video?.bytesBase64Encoded;

    if (videoUri) {
      // Veo URI may need API key appended
      const fetchUrl = videoUri.includes("key=") ? videoUri : `${videoUri}${videoUri.includes("?") ? "&" : "?"}key=${apiKey}`;
      const saved = await saveVideoFromUrl(fetchUrl);
      return { ...saved, model: veoModel };
    }
    if (videoBase64) {
      const saved = await saveVideoFromBase64(videoBase64);
      return { ...saved, model: veoModel };
    }
    const errMsg =
      pollData.response?.error?.message ||
      pollData.error?.message ||
      "Veo 응답에 영상이 없습니다.";
    throw new Error(errMsg);
  }
  throw new Error("Veo 영상 생성 시간 초과 (4분)");
}

async function generateSeedanceVideo(
  apiKey: string,
  modelKey: string,
  prompt: string,
  ratio: Ratio,
  duration: number,
  imageUrl?: string,
) {
  const generateAudio = modelKey === "seedance-audio";
  const byteplusModelId =
    modelKey === "seedance-2.0"
      ? "dreamina-seedance-2-0-260128"
      : modelKey === "seedance-2.0-fast"
      ? "dreamina-seedance-2-0-fast-260128"
      : "seedance-1-5-pro-251215";

  const safePrompt =
    prompt.replace(
      /\b(nude|naked|topless|bare skin|bare chest|undressed|露出|노출|벗은|裸)\b/gi,
      "clothed",
    ) + ", fully clothed characters, appropriate attire, safe content";

  const content: Array<Record<string, unknown>> = [{ type: "text", text: safePrompt }];
  if (imageUrl) {
    if (imageUrl.startsWith("data:")) {
      content.push({ type: "image_url", image_url: { url: imageUrl } });
    } else {
      try {
        const imgRes = await fetch(imageUrl);
        if (imgRes.ok) {
          const imgBuf = await imgRes.arrayBuffer();
          const imgB64 = Buffer.from(imgBuf).toString("base64");
          const ct = imgRes.headers.get("content-type") || "image/jpeg";
          content.push({ type: "image_url", image_url: { url: `data:${ct};base64,${imgB64}` } });
        } else {
          content.push({ type: "image_url", image_url: { url: imageUrl } });
        }
      } catch {
        content.push({ type: "image_url", image_url: { url: imageUrl } });
      }
    }
  }

  const initRes = await fetch(
    "https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: byteplusModelId,
        content,
        ratio,
        duration,
        resolution: "720p",
        generate_audio: generateAudio,
      }),
    },
  );
  if (!initRes.ok) {
    const txt = await initRes.text().catch(() => "");
    throw new Error(`Seedance ${initRes.status}: ${txt.slice(0, 200)}`);
  }
  const initData = await initRes.json();
  const taskId = initData.id || initData.task_id || initData.data?.id;
  if (!taskId) throw new Error("Seedance task ID 없음");

  const startTime = Date.now();
  let succeededNoUrl = 0;
  while (Date.now() - startTime < MAX_POLL_TIME) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL));
    const pollRes = await fetch(
      `https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks/${taskId}`,
      { headers: { Authorization: `Bearer ${apiKey}` } },
    );
    if (!pollRes.ok) continue;
    const pollData = await pollRes.json();
    const status = String(pollData.status || pollData.task_status || "").toLowerCase();
    const succeeded = ["succeeded", "succeed", "completed", "success"].includes(status);

    if (succeeded) {
      const remoteUrl = extractVideoUrl(pollData);
      if (remoteUrl) {
        const saved = await saveVideoFromUrl(remoteUrl);
        return { ...saved, model: byteplusModelId };
      }
      succeededNoUrl++;
      if (succeededNoUrl >= 3) {
        throw new Error("Seedance 응답에 영상 URL 없음");
      }
      continue;
    }
    if (["failed", "fail", "expired", "error"].includes(status)) {
      const reason = pollData.error?.message || pollData.message || status;
      throw new Error(`Seedance ${status}: ${reason}`);
    }
  }
  throw new Error("Seedance 영상 생성 시간 초과");
}

export async function POST(req: Request) {
  try {
    const body: {
      prompt?: string;
      model?: string;
      imageUrl?: string;
      ratio?: string;
      duration?: number;
    } = await req.json();

    const prompt = (body.prompt || "").trim();
    if (!prompt) {
      return Response.json({ error: "프롬프트가 필요합니다." }, { status: 400 });
    }

    const ratio = normalizeRatio(body.ratio);
    const selected = body.model || "seedance-1.5";
    const maxDur = selected === "seedance-2.0" || selected === "seedance-2.0-fast" ? 15 : selected.startsWith("veo") ? 8 : 10;
    const duration = Math.max(4, Math.min(Math.round(body.duration || 5), maxDur));

    if (selected === "grok-video") {
      const xaiKey = process.env.XAI_API_KEY;
      if (!xaiKey) {
        return Response.json({ error: "XAI_API_KEY 미설정" }, { status: 400 });
      }
      const r = await generateGrokVideo(xaiKey, prompt, ratio, duration, body.imageUrl);
      return Response.json({ ...r, ratio, prompt, duration });
    }

    if (selected === "veo-3.1" || selected === "veo-3.1-lite") {
      const geminiKey = process.env.GEMINI_API_KEY;
      if (!geminiKey) {
        return Response.json({ error: "GEMINI_API_KEY 미설정" }, { status: 400 });
      }
      const r = await generateVeoVideo(geminiKey, selected, prompt, ratio, duration, body.imageUrl);
      return Response.json({ ...r, ratio, prompt, duration });
    }

    if (
      selected === "seedance-1.5" ||
      selected === "seedance-audio" ||
      selected === "seedance-2.0" ||
      selected === "seedance-2.0-fast"
    ) {
      const byteplusKey = process.env.BYTEPLUS_API_KEY;
      if (!byteplusKey) {
        return Response.json({ error: "BYTEPLUS_API_KEY 미설정" }, { status: 400 });
      }
      const r = await generateSeedanceVideo(
        byteplusKey,
        selected,
        prompt,
        ratio,
        duration,
        body.imageUrl,
      );
      return Response.json({ ...r, ratio, prompt, duration });
    }

    return Response.json({ error: `지원하지 않는 영상 모델: ${selected}` }, { status: 400 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "영상 생성 실패";
    return Response.json({ error: msg }, { status: 500 });
  }
}
