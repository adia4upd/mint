"use client";
import { useState, useRef, useEffect, useCallback } from "react";

type Scene = {
  id: string;
  sceneNumber: number;
  script: string;
  imageUrl?: string | null;
  videoUrl?: string | null;
  audioUrl?: string | null;
  audioDuration?: number | null;
  estimatedDuration: number;
  kenBurns?: string;
};

const CANVAS_W: Record<string, number> = { "16:9": 1920, "9:16": 1080, "1:1": 1080 };
const CANVAS_H: Record<string, number> = { "16:9": 1080, "9:16": 1920, "1:1": 1080 };

function drawKenBurns(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  mode: string,
  progress: number,
  W: number,
  H: number,
) {
  const s =
    mode === "zoom-in"   ? 1 + 0.12 * progress :
    mode === "zoom-out"  ? 1.12 - 0.12 * progress :
    mode === "ken-burns" ? 1 + 0.1 * progress : 1.08;
  const tx =
    mode === "pan-left"  ?  W * 0.06 * progress :
    mode === "pan-right" ? -W * 0.06 * progress :
    mode === "ken-burns" ?  W * 0.02 * progress : 0;
  const ty = mode === "ken-burns" ? H * 0.01 * progress : 0;

  const ar = img.naturalWidth / img.naturalHeight;
  const cr = W / H;
  let sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight;
  if (ar > cr) { sw = sh * cr; sx = (img.naturalWidth - sw) / 2; }
  else         { sh = sw / cr; sy = (img.naturalHeight - sh) / 2; }

  const dw = W * s, dh = H * s;
  ctx.drawImage(img, sx, sy, sw, sh, (W - dw) / 2 + tx, (H - dh) / 2 + ty, dw, dh);
}

function drawSubtitle(ctx: CanvasRenderingContext2D, text: string, W: number, H: number) {
  if (!text?.trim()) return;
  const sz = W < 1200 ? 52 : 60;
  ctx.save();
  ctx.font = `bold ${sz}px 'Apple SD Gothic Neo','Noto Sans KR',sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";

  const mw = W - 160, lh = sz * 1.4;
  const lines: string[] = [];
  let ln = "";
  for (const w of text.split(/\s+/)) {
    const t = ln ? `${ln} ${w}` : w;
    if (ctx.measureText(t).width > mw && ln) { lines.push(ln); ln = w; }
    else ln = t;
  }
  if (ln) lines.push(ln);

  const bh = lines.length * lh + 32;
  const by = H - 180;
  const bw = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 64;

  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.beginPath();
  ctx.roundRect(W / 2 - bw / 2, by - bh, bw, bh, 12);
  ctx.fill();

  ctx.fillStyle = "#fff";
  ctx.shadowColor = "rgba(0,0,0,0.9)";
  ctx.shadowBlur = 6;
  lines.forEach((l, i) => ctx.fillText(l, W / 2, by - (lines.length - 1 - i) * lh - 16));
  ctx.restore();
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────
export default function CanvasRendererPanel({
  scenes = [],
  ratio = "9:16",
  onLambdaRender,
  serverRendering = false,
  serverResultUrl = "",
}: {
  scenes: Scene[];
  ratio: string;
  onLambdaRender?: () => void;
  serverRendering?: boolean;
  serverResultUrl?: string;
}) {
  const W = CANVAS_W[ratio] || 1080;
  const H = CANVAS_H[ratio] || 1920;
  const totalDur = scenes.reduce((s, sc) => s + (sc.estimatedDuration || 3), 0);

  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const imgRef      = useRef<Record<string, HTMLImageElement>>({});
  const vidRef      = useRef<Record<string, HTMLVideoElement>>({});
  const rafRef      = useRef<number>(0);
  const startMsRef  = useRef<number>(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const recRef      = useRef<MediaRecorder | null>(null);
  const chunksRef   = useRef<Blob[]>([]);

  const [phase, setPhase]     = useState<"loading" | "idle" | "playing" | "recording" | "done">("loading");
  const [loadPct, setLoadPct] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [blob, setBlob]       = useState<Blob | null>(null);
  const [mime, setMime]       = useState("");

  // ── 에셋 프리로드 ─────────────────────────────────────────
  useEffect(() => {
    let dead = false;
    imgRef.current = {};
    vidRef.current = {};

    const items = scenes.flatMap((sc) => [
      sc.imageUrl && { url: sc.imageUrl, type: "img" as const },
      sc.videoUrl && { url: sc.videoUrl, type: "vid" as const },
    ].filter(Boolean)) as { url: string; type: "img" | "vid" }[];

    if (!items.length) { setPhase("idle"); setLoadPct(100); return; }

    let done = 0;
    const tick = () => { if (!dead) setLoadPct(Math.round((++done) / items.length * 100)); };

    Promise.all(items.map(({ url, type }) => new Promise<void>((res) => {
      if (type === "vid") {
        const v = document.createElement("video");
        v.crossOrigin = "anonymous"; v.preload = "auto";
        v.muted = true; v.playsInline = true; v.src = url;
        v.oncanplay = () => { vidRef.current[url] = v; tick(); res(); };
        v.onerror   = () => { tick(); res(); };
        v.load();
      } else {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload  = () => { imgRef.current[url] = img; tick(); res(); };
        img.onerror = () => { tick(); res(); };
        img.src = url;
      }
    }))).then(() => { if (!dead) setPhase("idle"); });

    return () => { dead = true; };
  }, [scenes]);

  // ── 씬 위치 계산 ──────────────────────────────────────────
  const getSceneAt = useCallback((t: number) => {
    let acc = 0;
    for (let i = 0; i < scenes.length; i++) {
      const dur = scenes[i].estimatedDuration || 3;
      if (t < acc + dur) return { sc: scenes[i], si: i, se: t - acc, sd: dur };
      acc += dur;
    }
    const last = scenes[scenes.length - 1];
    return { sc: last, si: scenes.length - 1, se: last.estimatedDuration || 3, sd: last.estimatedDuration || 3 };
  }, [scenes]);

  // ── 프레임 렌더 ───────────────────────────────────────────
  const renderFrame = useCallback((t: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const { sc, si, se, sd } = getSceneAt(t);
    const FADE = 0.5;

    const drawSc = (scene: Scene, elt: number, alpha = 1) => {
      if (alpha < 1) { ctx.save(); ctx.globalAlpha = alpha; }
      const vid = scene.videoUrl ? vidRef.current[scene.videoUrl] : null;
      const img = scene.imageUrl ? imgRef.current[scene.imageUrl] : null;
      if (vid) {
        const lt = vid.duration ? elt % vid.duration : 0;
        if (Math.abs(vid.currentTime - lt) > 0.2) vid.currentTime = lt;
        ctx.drawImage(vid, 0, 0, W, H);
      } else if (img) {
        drawKenBurns(ctx, img, scene.kenBurns || "zoom-in", Math.min(elt / (scene.estimatedDuration || 3), 1), W, H);
      } else {
        ctx.fillStyle = "#111"; ctx.fillRect(0, 0, W, H);
      }
      if (alpha < 1) ctx.restore();
    };

    ctx.clearRect(0, 0, W, H);
    drawSc(sc, se);
    if (se > sd - FADE && si + 1 < scenes.length) {
      drawSc(scenes[si + 1], 0, Math.min((se - (sd - FADE)) / FADE, 1));
    }
    drawSubtitle(ctx, sc.script, W, H);
  }, [scenes, W, H, getSceneAt]);

  // ── 재생 / 녹화 시작 ──────────────────────────────────────
  // Path A: Canvas → captureStream() → MediaRecorder → MP4
  const startPlay = useCallback(async (record: boolean) => {
    cancelAnimationFrame(rafRef.current);
    chunksRef.current = []; setBlob(null); setElapsed(0);
    setPhase(record ? "recording" : "playing");

    // 씬별 오디오를 AudioContext 타임라인에 스케줄링
    let audioStream: MediaStream | null = null;
    const hasAudio = scenes.some((sc) => sc.audioUrl);

    if (hasAudio) {
      try {
        await audioCtxRef.current?.close();
        const ctx = new AudioContext();
        audioCtxRef.current = ctx;
        const dst = ctx.createMediaStreamDestination();

        // 각 씬 오디오를 시작 시간에 맞춰 디코딩 후 스케줄
        let offset = 0;
        await Promise.all(scenes.map(async (sc, i) => {
          const scStart = scenes.slice(0, i).reduce((s, x) => s + (x.estimatedDuration || 3), 0);
          if (!sc.audioUrl) { return; }
          try {
            const res = await fetch(sc.audioUrl);
            const ab = await res.arrayBuffer();
            const buf = await ctx.decodeAudioData(ab);
            const src = ctx.createBufferSource();
            src.buffer = buf;
            src.connect(dst);
            src.connect(ctx.destination);
            src.start(scStart); // 씬 시작 시간에 맞춰 스케줄
          } catch { /* 개별 씬 오디오 실패 시 무시 */ }
        }));

        audioStream = dst.stream;
      } catch { /* 오디오 없이 진행 */ }
    }

    if (record) {
      const m = [
        "video/mp4;codecs=h264,mp4a.40.2", "video/mp4;codecs=avc1", "video/mp4",
        "video/webm;codecs=vp9", "video/webm",
      ].find((t) => MediaRecorder.isTypeSupported(t)) || "video/webm";
      setMime(m);

      const tracks = [
        ...canvasRef.current!.captureStream(30).getTracks(),
        ...(audioStream?.getTracks() || []),
      ];
      const rec = new MediaRecorder(new MediaStream(tracks), { mimeType: m });
      recRef.current = rec;
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = () => { setBlob(new Blob(chunksRef.current, { type: m })); setPhase("done"); };
      rec.start(100);
    }

    startMsRef.current = performance.now();
    const loop = () => {
      const t = (performance.now() - startMsRef.current) / 1000;
      setElapsed(t);
      renderFrame(t);
      if (t < totalDur + 0.3) {
        rafRef.current = requestAnimationFrame(loop);
      } else {
        if (record && recRef.current?.state !== "inactive") recRef.current!.stop();
        else setPhase("idle");
      }
    };
    rafRef.current = requestAnimationFrame(loop);
  }, [scenes, totalDur, renderFrame]);

  const stopPlay = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    if (recRef.current?.state !== "inactive") recRef.current?.stop();
    else setPhase("idle");
    audioCtxRef.current?.suspend();
  }, []);

  useEffect(() => () => {
    cancelAnimationFrame(rafRef.current);
    audioCtxRef.current?.close();
  }, []);

  const download = () => {
    if (!blob) return;
    const ext = blob.type.includes("mp4") ? "mp4" : "webm";
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `render_${Date.now()}.${ext}`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  // 캔버스 표시 크기 (패널 안에서 비율 유지)
  const AREA_W = 560, AREA_H = 310;
  const ar = W / H;
  let dw = AREA_H * ar, dh = AREA_H;
  if (dw > AREA_W) { dw = AREA_W; dh = AREA_W / ar; }
  dw = Math.round(dw); dh = Math.round(dh);

  const pct = Math.min(elapsed / Math.max(totalDur, 0.1) * 100, 100);
  const isActive = phase === "playing" || phase === "recording";
  const sceneOffsets = scenes.map((_, i) =>
    scenes.slice(0, i).reduce((s, sc) => s + (sc.estimatedDuration || 3), 0),
  );

  return (
    <div
      className="flex border-t border-[var(--border)] bg-[var(--panel)] overflow-hidden"
      style={{ height: 380 }}
    >
      {/* ── 캔버스 미리보기 ── */}
      <div className="flex-1 bg-black flex items-center justify-center min-w-0">
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          style={{ width: dw, height: dh, display: "block", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 4 }}
        />
      </div>

      {/* ── 컨트롤 패널 ── */}
      <div className="w-64 border-l border-[var(--border)] flex flex-col flex-shrink-0">
        <div className="flex-1 overflow-y-auto p-3 space-y-3">

          {/* 진행 바 */}
          <div>
            <div className="h-1 bg-[var(--hover)] rounded-full overflow-hidden mb-1">
              <div className="h-full bg-[var(--text)] rounded-full" style={{ width: `${pct}%`, transition: "none" }} />
            </div>
            <div className="flex justify-between text-[10px] text-[var(--text-muted)]">
              <span>{Math.floor(elapsed / 60)}:{String(Math.floor(elapsed % 60)).padStart(2, "0")}</span>
              <span>{Math.floor(totalDur / 60)}:{String(Math.floor(totalDur % 60)).padStart(2, "0")}</span>
            </div>
          </div>

          {phase === "loading" && (
            <div className="text-[10px] text-[var(--text-muted)]">
              에셋 로딩 중... {loadPct}%
              <div className="h-0.5 bg-[var(--hover)] rounded mt-1">
                <div className="h-full bg-[var(--text)] rounded transition-all" style={{ width: `${loadPct}%` }} />
              </div>
            </div>
          )}

          {/* ── Path A: 브라우저 녹화 ── */}
          <div className="border border-[var(--border)] rounded-xl p-2.5 space-y-2">
            <div className="text-[11px] font-bold text-[var(--text)]">🖥️ 브라우저 녹화</div>
            <div className="text-[10px] text-[var(--text-muted)]">Canvas → captureStream → MP4</div>

            <div className="flex gap-1.5">
              <button
                onClick={() => startPlay(false)}
                disabled={isActive || phase === "loading" || !scenes.length}
                className="flex-1 py-1.5 text-[11px] rounded-lg border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--hover)] disabled:opacity-40 transition"
              >
                ▶ 미리보기
              </button>
              <button
                onClick={() => startPlay(true)}
                disabled={isActive || phase === "loading" || !scenes.length}
                className="flex-1 py-1.5 text-[11px] rounded-lg bg-[var(--text)] text-[var(--bg)] font-bold disabled:opacity-40 hover:opacity-80 transition"
              >
                ⏺ 녹화
              </button>
            </div>

            {isActive && (
              <div className="space-y-1">
                {phase === "recording" && (
                  <div className="text-[10px] text-[var(--text-muted)] animate-pulse font-bold">● 녹화 중...</div>
                )}
                <button
                  onClick={stopPlay}
                  className="w-full py-1.5 text-[11px] rounded-lg border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--hover)] transition"
                >
                  ⏹ 중지
                </button>
              </div>
            )}

            {phase === "done" && blob && (
              <div className="space-y-1.5">
                <div className="text-[10px] text-[var(--text-muted)]">
                  ✓ {mime.includes("mp4") ? "MP4" : "WebM"} · {(blob.size / 1024 / 1024).toFixed(1)}MB
                </div>
                <button
                  onClick={download}
                  className="w-full py-1.5 text-[11px] rounded-lg bg-[var(--text)] text-[var(--bg)] font-bold hover:opacity-80 transition"
                >
                  ⬇ 다운로드
                </button>
                <button
                  onClick={() => { setBlob(null); setPhase("idle"); setElapsed(0); }}
                  className="w-full py-1.5 text-[11px] rounded-lg border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--hover)] transition"
                >
                  다시 녹화
                </button>
              </div>
            )}
          </div>

          {/* ── Path B: Lambda 서버 렌더 ── */}
          <div className="border border-[var(--border)] rounded-xl p-2.5 space-y-2">
            <div className="text-[11px] font-bold text-[var(--text)]">☁️ Lambda 서버 렌더</div>
            <div className="text-[10px] text-[var(--text-muted)]">씬 URL → FFmpeg → MP4 (롱폼 고속)</div>
            <button
              onClick={onLambdaRender}
              disabled={serverRendering || !scenes.length || !onLambdaRender}
              className="w-full py-1.5 text-[11px] rounded-lg border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--hover)] disabled:opacity-40 transition"
            >
              {serverRendering ? "⏳ 렌더링 중..." : "🖥️ Lambda 렌더 시작"}
            </button>
            {serverResultUrl && (
              <a
                href={serverResultUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-center text-[11px] text-[var(--text)] hover:opacity-70 border border-[var(--border)] rounded-lg px-2 py-1.5 transition"
              >
                ⬇ 렌더 결과 다운로드
              </a>
            )}
          </div>

        </div>

        {/* 씬 목록 */}
        <div className="border-t border-[var(--border)] p-2 space-y-0.5 max-h-36 overflow-y-auto flex-shrink-0">
          <div className="text-[10px] font-bold text-[var(--text-muted)] mb-1">씬 목록</div>
          {scenes.map((sc, i) => {
            const start = sceneOffsets[i];
            const active = elapsed >= start && elapsed < start + (sc.estimatedDuration || 3);
            return (
              <div
                key={sc.id || i}
                className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded text-[10px] transition ${active ? "bg-[var(--hover)] text-[var(--text)]" : "text-[var(--text-muted)]"}`}
              >
                <span className="w-3 font-bold text-center flex-shrink-0">{sc.sceneNumber}</span>
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${sc.videoUrl ? "bg-[var(--text)]" : sc.imageUrl ? "bg-[var(--text-muted)]" : "bg-[var(--border)]"}`} />
                <span className="flex-1 truncate">{sc.script?.slice(0, 16) || "—"}</span>
                <span className="flex-shrink-0">{sc.estimatedDuration || 3}s</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
