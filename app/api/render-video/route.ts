import { randomUUID } from "node:crypto";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { put } from "@vercel/blob";

export const maxDuration = 600;

type Scene = {
  sceneNumber?: number;
  imageUrl?: string | null;
  videoUrl?: string | null;
  videoSourceUrl?: string | null;
  audioUrl?: string | null;
  duration?: number;
  script?: string;
  mediaType?: "video" | "image";
};

const LAMBDA_ENDPOINT = process.env.FFMPEG_LAMBDA_ENDPOINT;
const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;

function isLocalAsset(url: string): boolean {
  return url.startsWith("/assets/");
}

function isPublicHttp(url: string): boolean {
  return /^https?:\/\//i.test(url) && !/^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)/i.test(url);
}

async function uploadLocalToBlob(localPath: string, jobId: string, idx: number): Promise<string> {
  const filename = path.basename(localPath);
  const fullPath = path.join(process.cwd(), "public", localPath.replace(/^\//, ""));
  const buf = await readFile(fullPath);
  const blob = await put(`mint-render/${jobId}/clip_${idx}_${filename}`, buf, {
    access: "private",
    contentType: "video/mp4",
    token: BLOB_TOKEN,
  });
  return blob.downloadUrl || blob.url;
}

async function saveRenderResult(buf: Buffer): Promise<string> {
  const id = `render_${Date.now()}_${randomUUID().slice(0, 8)}`;
  const filename = `${id}.mp4`;
  const dir = path.join(process.cwd(), "public", "assets");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, filename), buf);
  return `/assets/${filename}`;
}

export async function POST(req: Request) {
  try {
    if (!LAMBDA_ENDPOINT) {
      return Response.json(
        { error: "FFMPEG_LAMBDA_ENDPOINT 미설정 — 서버 렌더링 사용 불가" },
        { status: 503 },
      );
    }
    if (!BLOB_TOKEN) {
      return Response.json(
        { error: "BLOB_READ_WRITE_TOKEN 미설정 — Blob 업로드 불가" },
        { status: 503 },
      );
    }

    const body: {
      scenes?: Scene[];
      ratio?: string;
      projectName?: string;
    } = await req.json();

    const scenes = body.scenes || [];
    if (scenes.length === 0) {
      return Response.json({ error: "씬 데이터가 필요합니다." }, { status: 400 });
    }

    const videoScenes = scenes.filter((s) => !!s.videoUrl);
    if (videoScenes.length === 0) {
      return Response.json(
        {
          error:
            "서버 렌더링은 영상 클립만 지원합니다. 모든 씬에 영상을 먼저 생성해주세요.",
        },
        { status: 400 },
      );
    }

    const skipped = scenes.length - videoScenes.length;
    const jobId = `render_${Date.now()}_${randomUUID().slice(0, 6)}`;

    // 우선순위: videoSourceUrl(원본 CDN) → videoUrl(공개 URL) → 로컬은 Blob 업로드
    const clips: Array<{ url: string; startTime: number; endTime: number }> = [];
    for (let i = 0; i < videoScenes.length; i++) {
      const s = videoScenes[i];
      let publicUrl: string;

      if (s.videoSourceUrl && isPublicHttp(s.videoSourceUrl)) {
        publicUrl = s.videoSourceUrl;
      } else if (s.videoUrl && isPublicHttp(s.videoUrl)) {
        publicUrl = s.videoUrl;
      } else if (s.videoUrl && isLocalAsset(s.videoUrl)) {
        publicUrl = await uploadLocalToBlob(s.videoUrl, jobId, i);
      } else {
        return Response.json(
          {
            error: `클립 ${i + 1}: 영상 URL을 사용할 수 없습니다 — ${(s.videoUrl || "").slice(0, 80)}`,
          },
          { status: 400 },
        );
      }

      const dur = Math.max(0.5, Number(s.duration) || 3);
      clips.push({ url: publicUrl, startTime: 0, endTime: dur });
    }

    const lambdaRes = await fetch(`${LAMBDA_ENDPOINT}/merge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jobId,
        inputs: {
          clips,
          output: {
            projectName: body.projectName || "Mint",
          },
        },
      }),
    });

    if (!lambdaRes.ok) {
      const txt = await lambdaRes.text().catch(() => "");
      return Response.json(
        { error: `FFmpeg Lambda ${lambdaRes.status}: ${txt.slice(0, 300)}` },
        { status: lambdaRes.status },
      );
    }

    const contentType = lambdaRes.headers.get("content-type") || "";

    if (contentType.includes("video/mp4") || contentType.includes("octet-stream")) {
      const arrayBuf = await lambdaRes.arrayBuffer();
      const outputUrl = await saveRenderResult(Buffer.from(arrayBuf));
      return Response.json({
        jobId,
        status: "completed",
        outputUrl,
        skippedScenes: skipped,
        renderedClips: clips.length,
      });
    }

    const data = await lambdaRes.json().catch(() => ({}));
    if (data.outputUrl) {
      // Lambda가 URL을 줬으면 다운로드해서 로컬에 저장 (사용자 폴더로 다운로드용)
      try {
        const dl = await fetch(data.outputUrl);
        if (dl.ok) {
          const buf = Buffer.from(await dl.arrayBuffer());
          const localUrl = await saveRenderResult(buf);
          return Response.json({
            jobId,
            status: "completed",
            outputUrl: localUrl,
            skippedScenes: skipped,
            renderedClips: clips.length,
          });
        }
      } catch {}
      return Response.json({
        jobId,
        status: "completed",
        outputUrl: data.outputUrl,
        skippedScenes: skipped,
        renderedClips: clips.length,
      });
    }

    if (data.status === "processing" && data.jobId) {
      const start = Date.now();
      while (Date.now() - start < 480000) {
        await new Promise((r) => setTimeout(r, 5000));
        const statusRes = await fetch(`${LAMBDA_ENDPOINT}/status/${data.jobId}`);
        if (!statusRes.ok) continue;
        const statusData = await statusRes.json();
        if (statusData.status === "completed" && statusData.outputUrl) {
          try {
            const dl = await fetch(statusData.outputUrl);
            if (dl.ok) {
              const buf = Buffer.from(await dl.arrayBuffer());
              const localUrl = await saveRenderResult(buf);
              return Response.json({
                jobId: data.jobId,
                status: "completed",
                outputUrl: localUrl,
                skippedScenes: skipped,
                renderedClips: clips.length,
              });
            }
          } catch {}
          return Response.json({
            jobId: data.jobId,
            status: "completed",
            outputUrl: statusData.outputUrl,
            skippedScenes: skipped,
            renderedClips: clips.length,
          });
        }
        if (statusData.status === "failed") {
          return Response.json(
            { error: `렌더 실패: ${statusData.error || "unknown"}` },
            { status: 500 },
          );
        }
      }
      return Response.json({ error: "렌더링 시간 초과" }, { status: 504 });
    }

    return Response.json(
      { error: "Lambda 응답을 해석할 수 없습니다." },
      { status: 500 },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "서버 렌더 실패";
    return Response.json({ error: msg }, { status: 500 });
  }
}
