"use client";

import { useCallback, useEffect, useState, lazy, Suspense } from "react";
const CanvasRendererPanel = lazy(() => import("../components/CanvasRendererPanel"));
import { DEFAULT_MODEL_ID, isValidModelId } from "../lib/models";
import {
  AssetHistoryItem,
  addHistory,
  clearHistory,
  listHistory,
  removeHistory,
} from "../lib/assetHistory";

const MODEL_STORAGE_KEY = "mint-chat-model";
const DRAFT_KEY = "mint-storyboard-draft";

type Scene = {
  id: string;
  sceneNumber: number;
  script: string;
  stageDirection: string;
  motion: string;
  charCount: number;
  estimatedDuration: number;
  mediaType: "video" | "image";
  kenBurns?: string;
  imageUrl?: string | null;
  videoUrl?: string | null;
  videoSourceUrl?: string | null;
  audioUrl?: string | null;
  audioDuration?: number | null;
};

const IMAGE_MODELS = [
  { id: "dall-e", label: "DALL-E 3" },
  { id: "gemini", label: "Gemini" },
  { id: "grok", label: "Grok" },
  { id: "minimax", label: "MiniMax" },
];

const IMAGE_VIDEO_MATCH: Record<string, { default: string; label: string }> = {
  "dall-e": { default: "seedance-1.5", label: "DALL-E 3 + Seedance 1.5 (안정적)" },
  gemini: { default: "veo-3.1-lite", label: "Gemini + Veo 3.1 Lite (저렴)" },
  grok: { default: "grok-video", label: "Grok + Grok Video (스타일 일관)" },
  minimax: { default: "seedance-1.5", label: "MiniMax + Seedance 1.5 (캐릭터 일관성)" },
};

const VIDEO_MODELS = [
  { id: "seedance-2.0", label: "Seedance 2.0 🆕" },
  { id: "seedance-2.0-fast", label: "Seedance 2.0 Fast ⚡" },
  { id: "seedance-1.5", label: "Seedance 1.5 ⭐" },
  { id: "seedance-audio", label: "Seedance Audio" },
  { id: "veo-3.1-lite", label: "Veo 3.1 Lite 💰" },
  { id: "veo-3.1", label: "Veo 3.1 ✨" },
  { id: "grok-video", label: "Grok Video" },
];

const KEN_BURNS_OPTIONS = [
  { id: "none", label: "없음" },
  { id: "zoom-in", label: "줌인" },
  { id: "zoom-out", label: "줌아웃" },
  { id: "ken-burns", label: "Ken Burns" },
  { id: "pan-left", label: "좌→우" },
  { id: "pan-right", label: "우→좌" },
];

const FORMATS = [
  { id: "shorts", label: "숏폼 9:16" },
  { id: "longform", label: "롱폼 16:9" },
];

const STYLES = [
  "실사풍",
  "시네마틱",
  "3D 애니메이션",
  "일본 애니",
  "카툰",
  "수채화",
  "미니멀 일러스트",
];

function genId() {
  return `sb_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function fmtTime(sec: number) {
  const total = Math.round(sec);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}분 ${s}초` : `${s}초`;
}

export default function StoryboardEditorPage() {
  const [projectName, setProjectName] = useState("");
  const [script, setScript] = useState("");
  const [style, setStyle] = useState(STYLES[0]);
  const [format, setFormat] = useState<"shorts" | "longform">("shorts");
  const [imageModel, setImageModel] = useState("dall-e");
  const [videoModel, setVideoModel] = useState("seedance-1.5");
  const [ratio, setRatio] = useState("9:16");
  const [ttsEngine, setTtsEngine] = useState<"elevenlabs" | "google">("elevenlabs");
  const [modelId, setModelId] = useState<string>(DEFAULT_MODEL_ID);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [styleGuide, setStyleGuide] = useState("");
  const [splitting, setSplitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [genImageIds, setGenImageIds] = useState<Set<string>>(new Set());
  const [genVideoIds, setGenVideoIds] = useState<Set<string>>(new Set());
  const [genTtsIds, setGenTtsIds] = useState<Set<string>>(new Set());
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number; label: string } | null>(null);
  const [exporting, setExporting] = useState<"capcut" | "render" | null>(null);
  const [renderUrl, setRenderUrl] = useState<string | null>(null);
  const [history, setHistory] = useState<AssetHistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showRenderer, setShowRenderer] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem(MODEL_STORAGE_KEY);
    if (isValidModelId(saved)) setModelId(saved);

    const draft = window.localStorage.getItem(DRAFT_KEY);
    if (draft) {
      try {
        const d = JSON.parse(draft);
        if (d.projectName) setProjectName(d.projectName);
        if (d.script) setScript(d.script);
        if (d.style) setStyle(d.style);
        if (d.format) setFormat(d.format);
        if (d.scenes) setScenes(d.scenes);
        if (d.styleGuide) setStyleGuide(d.styleGuide);
      } catch {
        // ignore
      }
    }
    setHistory(listHistory());
  }, []);

  useEffect(() => {
    const payload = JSON.stringify({
      projectName,
      script,
      style,
      format,
      scenes,
      styleGuide,
    });
    window.localStorage.setItem(DRAFT_KEY, payload);
  }, [projectName, script, style, format, scenes, styleGuide]);

  const handleSplit = async () => {
    const s = script.trim();
    if (!s || splitting) return;
    setSplitting(true);
    setError(null);
    try {
      const res = await fetch("/api/scene-split", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ script: s, style, format, ratio, model: modelId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      const newScenes: Scene[] = (data.scenes || []).map((sc: Scene) => ({
        ...sc,
        id: genId(),
        imageUrl: null,
        videoUrl: null,
        videoSourceUrl: null,
        audioUrl: null,
      }));
      setScenes(newScenes);
      setStyleGuide(data.styleGuide || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "씬 분할 실패");
    } finally {
      setSplitting(false);
    }
  };

  const updateScene = useCallback(
    (id: string, patch: Partial<Scene>) => {
      setScenes((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    },
    [],
  );

  const handleReset = () => {
    if (!confirm("작업을 초기화할까요? 모든 씬이 사라집니다.")) return;
    setScript("");
    setScenes([]);
    setStyleGuide("");
    setProjectName("");
    setError(null);
  };

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  };

  const handleCopyAll = async () => {
    const visuals = scenes.map((s) => s.stageDirection).filter(Boolean);
    if (visuals.length === 0) return;
    const ok = await copyText(visuals.join("\n\n"));
    if (ok) {
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 1500);
    }
  };

  const handleCopyOne = async (id: string, text: string) => {
    const ok = await copyText(text);
    if (ok) {
      setCopiedId(id);
      setTimeout(() => setCopiedId((v) => (v === id ? null : v)), 1500);
    }
  };

  const generateVideoFor = async (scene: Scene) => {
    setGenVideoIds((prev) => new Set(prev).add(scene.id));
    try {
      const res = await fetch("/api/generate-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: scene.stageDirection,
          model: videoModel,
          imageUrl: scene.imageUrl || undefined,
          ratio,
          duration: scene.estimatedDuration || 5,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      updateScene(scene.id, { videoUrl: data.url, videoSourceUrl: data.sourceUrl ?? null });
      const next = addHistory({
        id: data.id,
        kind: "video",
        url: data.url,
        prompt: scene.stageDirection,
        model: data.model,
        ratio: data.ratio,
        projectName: projectName || undefined,
        sceneNumber: scene.sceneNumber,
      });
      setHistory(next);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "영상 생성 실패");
      return false;
    } finally {
      setGenVideoIds((prev) => {
        const next = new Set(prev);
        next.delete(scene.id);
        return next;
      });
    }
  };

  const generateTtsFor = async (scene: Scene) => {
    setGenTtsIds((prev) => new Set(prev).add(scene.id));
    try {
      const res = await fetch("/api/generate-tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: scene.script, engine: ttsEngine }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      updateScene(scene.id, {
        audioUrl: data.url,
        audioDuration: data.duration ?? null,
      });
      const next = addHistory({
        id: data.id,
        kind: "audio",
        url: data.url,
        prompt: scene.script,
        model: data.engine,
        projectName: projectName || undefined,
        sceneNumber: scene.sceneNumber,
      });
      setHistory(next);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "TTS 생성 실패");
      return false;
    } finally {
      setGenTtsIds((prev) => {
        const next = new Set(prev);
        next.delete(scene.id);
        return next;
      });
    }
  };

  const handleGenVideoOne = async (scene: Scene) => {
    setError(null);
    await generateVideoFor(scene);
  };

  const handleGenVideoAll = async () => {
    if (scenes.length === 0 || batchProgress) return;
    setError(null);
    setBatchProgress({ done: 0, total: scenes.length, label: "영상 생성" });
    for (let i = 0; i < scenes.length; i++) {
      await generateVideoFor(scenes[i]);
      setBatchProgress({ done: i + 1, total: scenes.length, label: "영상 생성" });
    }
    setBatchProgress(null);
  };

  const handleGenTtsOne = async (scene: Scene) => {
    setError(null);
    await generateTtsFor(scene);
  };

  const handleGenTtsAll = async () => {
    if (scenes.length === 0 || batchProgress) return;
    setError(null);
    setBatchProgress({ done: 0, total: scenes.length, label: "TTS 생성" });
    for (let i = 0; i < scenes.length; i++) {
      await generateTtsFor(scenes[i]);
      setBatchProgress({ done: i + 1, total: scenes.length, label: "TTS 생성" });
    }
    setBatchProgress(null);
  };

  const handleExportCapcut = async () => {
    if (scenes.length === 0 || exporting) return;
    setError(null);
    setExporting("capcut");
    try {
      const res = await fetch("/api/export-capcut", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scenes: scenes.map((s) => ({
            sceneNumber: s.sceneNumber,
            script: s.script,
            imageUrl: s.imageUrl,
            videoUrl: s.videoUrl,
            audioUrl: s.audioUrl,
            duration: s.estimatedDuration,
            kenBurns: s.kenBurns,
            mediaType: s.mediaType,
          })),
          projectName: projectName || `Mint_${Date.now()}`,
          ratio,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(projectName || "Mint").replace(/\s+/g, "_")}_capcut.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "CapCut 내보내기 실패");
    } finally {
      setExporting(null);
    }
  };

  const handleServerRender = async () => {
    if (scenes.length === 0 || exporting) return;
    setError(null);
    setRenderUrl(null);
    setExporting("render");
    try {
      const res = await fetch("/api/render-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scenes: scenes.map((s) => ({
            sceneNumber: s.sceneNumber,
            script: s.script,
            imageUrl: s.imageUrl,
            videoUrl: s.videoUrl,
            videoSourceUrl: s.videoSourceUrl,
            audioUrl: s.audioUrl,
            duration: s.estimatedDuration,
            mediaType: s.mediaType,
          })),
          ratio,
          projectName: projectName || `Mint_${Date.now()}`,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      if (data.outputUrl) {
        setRenderUrl(data.outputUrl);
      } else {
        throw new Error("렌더링 결과 URL을 받지 못했습니다.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "서버 렌더 실패");
    } finally {
      setExporting(null);
    }
  };

  const generateImageFor = async (scene: Scene) => {
    setGenImageIds((prev) => new Set(prev).add(scene.id));
    try {
      const res = await fetch("/api/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: scene.stageDirection,
          model: imageModel,
          style,
          ratio,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      updateScene(scene.id, { imageUrl: data.url });
      const next = addHistory({
        id: data.id,
        kind: "image",
        url: data.url,
        prompt: scene.stageDirection,
        model: data.model,
        ratio: data.ratio,
        projectName: projectName || undefined,
        sceneNumber: scene.sceneNumber,
      });
      setHistory(next);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "이미지 생성 실패");
      return false;
    } finally {
      setGenImageIds((prev) => {
        const next = new Set(prev);
        next.delete(scene.id);
        return next;
      });
    }
  };

  const handleGenImageOne = async (scene: Scene) => {
    setError(null);
    await generateImageFor(scene);
  };

  const handleGenImageAll = async () => {
    if (scenes.length === 0 || batchProgress) return;
    setError(null);
    setBatchProgress({ done: 0, total: scenes.length, label: "이미지 생성" });
    for (let i = 0; i < scenes.length; i++) {
      await generateImageFor(scenes[i]);
      setBatchProgress({ done: i + 1, total: scenes.length, label: "이미지 생성" });
    }
    setBatchProgress(null);
  };

  const handleClearHistory = () => {
    if (!confirm("히스토리를 모두 지울까요? (서버 파일은 유지됩니다)")) return;
    setHistory(clearHistory());
  };

  const handleRemoveHistoryItem = (id: string) => {
    setHistory(removeHistory(id));
  };

  const totalDuration = scenes.reduce(
    (acc, s) => acc + (s.estimatedDuration || 0),
    0,
  );

  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center justify-between px-4 h-13 border-b border-[var(--border)] gap-3">
        <div className="flex items-center gap-3 flex-1">
          <span className="text-sm font-medium shrink-0">스토리보드 에디터</span>
          <input
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            placeholder="프로젝트 이름"
            className="h-8 max-w-60 rounded-md border border-[var(--border)] bg-[var(--panel)] px-3 text-xs outline-none focus:border-[var(--text)]"
          />
          <span className="text-xs text-[var(--text-muted)]">
            씬 {scenes.length}
            {totalDuration > 0 && ` · ${fmtTime(totalDuration)}`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowRenderer((v) => !v)}
            className={`h-8 px-3 rounded-md text-xs border transition ${
              showRenderer
                ? "bg-[var(--text)] text-[var(--bg)] border-[var(--text)]"
                : "border-[var(--border)] hover:bg-[var(--hover)]"
            }`}
          >
            🎬 렌더러
          </button>
          <button
            type="button"
            onClick={() => setShowHistory((v) => !v)}
            className={`h-8 px-3 rounded-md text-xs border ${
              showHistory
                ? "bg-white text-black border-white"
                : "border-[var(--border)] hover:bg-[var(--hover)]"
            }`}
          >
            📚 히스토리 ({history.length})
          </button>
          <button
            type="button"
            onClick={handleCopyAll}
            disabled={scenes.length === 0}
            className="h-8 px-3 rounded-md text-xs border border-[var(--border)] hover:bg-[var(--hover)] disabled:opacity-30"
          >
            {copiedAll ? "복사됨" : "비주얼 전체 복사"}
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="h-8 px-3 rounded-md text-xs text-[var(--text-muted)] hover:text-red-400 border border-[var(--border)]"
          >
            초기화
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-80 shrink-0 border-r border-[var(--border)] bg-[var(--panel)] overflow-y-auto scroll-y flex flex-col">
          <Section title="🎨 이미지 스타일 & 모델">
            <select
              value={style}
              onChange={(e) => setStyle(e.target.value)}
              className="w-full h-8 rounded-md bg-[var(--hover)] border border-[var(--border)] px-2 text-xs text-[var(--text)] outline-none mb-2"
            >
              {STYLES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <div className="flex gap-1.5">
              <select
                value={imageModel}
                onChange={(e) => {
                  const m = e.target.value;
                  setImageModel(m);
                  setVideoModel(IMAGE_VIDEO_MATCH[m]?.default || "seedance-1.5");
                }}
                className="flex-1 h-8 rounded-md bg-[var(--hover)] border border-[var(--border)] px-2 text-xs outline-none"
              >
                {IMAGE_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
              <select
                value={ratio}
                onChange={(e) => setRatio(e.target.value)}
                className="w-20 h-8 rounded-md bg-[var(--hover)] border border-[var(--border)] px-2 text-xs outline-none"
              >
                <option value="16:9">16:9</option>
                <option value="9:16">9:16</option>
                <option value="1:1">1:1</option>
              </select>
            </div>
          </Section>

          <Section title="🎬 영상 모델">
            <select
              value={videoModel}
              onChange={(e) => setVideoModel(e.target.value)}
              className="w-full h-8 rounded-md bg-[var(--hover)] border border-[var(--border)] px-2 text-xs outline-none mb-1"
            >
              {VIDEO_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
            <div className="text-[10px] text-[var(--text-muted)]">
              {IMAGE_VIDEO_MATCH[imageModel]?.label}
            </div>
          </Section>

          <Section title="📝 포맷 · 대본">
            <div className="flex gap-1.5 mb-2">
              {FORMATS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => {
                    const next = f.id as "shorts" | "longform";
                    setFormat(next);
                    setRatio(next === "shorts" ? "9:16" : "16:9");
                  }}
                  className={`flex-1 h-8 rounded-md text-xs border ${
                    format === f.id
                      ? "bg-white text-black border-white"
                      : "bg-[var(--hover)] border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <textarea
              value={script}
              onChange={(e) => setScript(e.target.value)}
              placeholder={"나레이션 대본 전체를 입력하세요.\n길이 제한 없음 (10분, 20분 OK)"}
              rows={6}
              className="w-full bg-[var(--hover)] border border-[var(--border)] rounded-md p-2 text-xs text-[var(--text)] resize-none outline-none focus:border-[var(--text)]"
            />
            <button
              type="button"
              onClick={handleSplit}
              disabled={!script.trim() || splitting}
              className="w-full mt-2 h-9 rounded-md text-xs font-medium bg-white text-black disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {splitting ? "씬 분할 중…" : "✂️ 씬 분할"}
            </button>
            {error && (
              <div className="mt-2 text-[11px] text-red-400">{error}</div>
            )}
            {styleGuide && (
              <div className="mt-2 p-2 rounded-md bg-[var(--hover)] border border-[var(--border)] text-[10px] text-[var(--text-muted)]">
                <span className="font-semibold text-[var(--text)]">스타일 가이드</span>
                <br />
                {styleGuide}
              </div>
            )}
          </Section>

          <Section title="🖼️ 이미지 일괄 생성">
            <button
              type="button"
              onClick={handleGenImageAll}
              disabled={scenes.length === 0 || !!batchProgress}
              className="w-full h-9 rounded-md text-xs font-medium bg-white text-black disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {batchProgress?.label === "이미지 생성"
                ? `생성 중 ${batchProgress.done}/${batchProgress.total}`
                : "모든 씬 이미지 생성"}
            </button>
            <div className="mt-1.5 text-[10px] text-[var(--text-muted)]">
              Imagen 3 · 서버 저장 · 히스토리 자동 기록
            </div>
          </Section>

          <Section title="🎙️ 나레이션 (TTS)">
            <select
              value={ttsEngine}
              onChange={(e) =>
                setTtsEngine(e.target.value as "elevenlabs" | "google")
              }
              className="w-full h-8 rounded-md bg-[var(--hover)] border border-[var(--border)] px-2 text-xs outline-none mb-2"
            >
              <option value="elevenlabs">ElevenLabs (프리미엄)</option>
              <option value="google">Google TTS (기본)</option>
            </select>
            <button
              type="button"
              onClick={handleGenTtsAll}
              disabled={scenes.length === 0 || !!batchProgress}
              className="w-full h-9 rounded-md text-xs font-medium border border-[var(--border)] hover:bg-[var(--hover)] disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {batchProgress?.label === "TTS 생성"
                ? `TTS 생성 중 ${batchProgress.done}/${batchProgress.total}`
                : "모든 씬 TTS 생성"}
            </button>
            <div className="mt-1.5 text-[10px] text-[var(--text-muted)]">
              씬별 나레이션을 mp3로 저장
            </div>
          </Section>

          <Section title="🎞️ 영상 일괄 생성">
            <button
              type="button"
              onClick={handleGenVideoAll}
              disabled={scenes.length === 0 || !!batchProgress}
              className="w-full h-9 rounded-md text-xs font-medium border border-[var(--border)] hover:bg-[var(--hover)] disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {batchProgress?.label === "영상 생성"
                ? `영상 생성 중 ${batchProgress.done}/${batchProgress.total}`
                : "모든 씬 영상 생성"}
            </button>
            <div className="mt-1.5 text-[10px] text-[var(--text-muted)]">
              {VIDEO_MODELS.find((m) => m.id === videoModel)?.label}
            </div>
          </Section>

          <Section title="📦 내보내기">
            <button
              type="button"
              onClick={handleExportCapcut}
              disabled={scenes.length === 0 || !!exporting}
              className="w-full h-9 rounded-md text-xs font-medium border border-[var(--border)] hover:bg-[var(--hover)] disabled:opacity-30 disabled:cursor-not-allowed mb-1.5"
            >
              {exporting === "capcut" ? "CapCut ZIP 만드는 중…" : "CapCut ZIP"}
            </button>
            <button
              type="button"
              onClick={handleServerRender}
              disabled={scenes.length === 0 || !!exporting}
              className="w-full h-9 rounded-md text-xs font-medium border border-[var(--border)] hover:bg-[var(--hover)] disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {exporting === "render" ? "렌더링 중…" : "서버 렌더 (MP4)"}
            </button>
            {renderUrl && (
              <a
                href={renderUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 block w-full h-9 grid place-items-center rounded-md text-xs font-medium bg-white text-black"
              >
                ⬇ 렌더 결과 다운로드
              </a>
            )}
            <div className="mt-1.5 text-[10px] text-[var(--text-muted)]">
              CapCut 8.3 호환 · FFmpeg Lambda 렌더
            </div>
          </Section>
        </aside>

        {showHistory && (
          <aside className="w-80 shrink-0 border-r border-[var(--border)] bg-[var(--panel)] overflow-y-auto scroll-y flex flex-col">
            <div className="p-3 border-b border-[var(--border)] flex items-center justify-between">
              <span className="text-[11px] font-bold text-[var(--text-muted)]">
                📚 에셋 히스토리 ({history.length})
              </span>
              <button
                type="button"
                onClick={handleClearHistory}
                disabled={history.length === 0}
                className="text-[10px] px-2 h-6 rounded border border-[var(--border)] text-[var(--text-muted)] hover:text-red-400 disabled:opacity-30"
              >
                전체 삭제
              </button>
            </div>
            {history.length === 0 ? (
              <div className="p-6 text-center text-[11px] text-[var(--text-muted)]">
                아직 생성된 에셋이 없어요
              </div>
            ) : (
              <div className="p-2 grid grid-cols-2 gap-2">
                {history.map((item) => (
                  <div
                    key={item.id}
                    className="relative group rounded-md overflow-hidden border border-[var(--border)] bg-[var(--hover)]"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.url}
                      alt=""
                      className="w-full aspect-square object-cover"
                    />
                    <div className="absolute bottom-0 left-0 right-0 bg-black/70 px-1.5 py-1 text-[9px] text-white flex justify-between">
                      <span className="truncate">
                        {item.projectName || "이름없음"}
                        {item.sceneNumber ? ` #${item.sceneNumber}` : ""}
                      </span>
                      <span className="shrink-0 opacity-60">
                        {item.ratio}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveHistoryItem(item.id)}
                      className="absolute top-1 right-1 w-5 h-5 rounded bg-black/60 text-white text-[10px] opacity-0 group-hover:opacity-100 hover:bg-red-500"
                      aria-label="삭제"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </aside>
        )}

        <main className="flex-1 overflow-y-auto scroll-y p-6 bg-[var(--bg-page)]">
          {scenes.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center gap-3">
              <div className="text-4xl opacity-30">🎞️</div>
              <div className="text-sm text-[var(--text-muted)]">
                좌측에서 대본을 입력한 뒤 <b className="text-[var(--text)]">✂️ 씬 분할</b>을 눌러주세요
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
              {scenes.map((scene) => (
                <SceneCard
                  key={scene.id}
                  scene={scene}
                  copied={copiedId === scene.id}
                  genImage={genImageIds.has(scene.id)}
                  genVideo={genVideoIds.has(scene.id)}
                  genTts={genTtsIds.has(scene.id)}
                  onUpdate={(patch) => updateScene(scene.id, patch)}
                  onCopy={() => handleCopyOne(scene.id, scene.stageDirection)}
                  onGenImage={() => handleGenImageOne(scene)}
                  onGenVideo={() => handleGenVideoOne(scene)}
                  onGenTts={() => handleGenTtsOne(scene)}
                />
              ))}
            </div>
          )}

          {/* ── Canvas 렌더러 패널 ── */}
          {showRenderer && (
            <Suspense fallback={null}>
              <CanvasRendererPanel
                scenes={scenes}
                ratio={ratio}
                onLambdaRender={handleServerRender}
                serverRendering={exporting === "render"}
                serverResultUrl={renderUrl ?? ""}
              />
            </Suspense>
          )}
        </main>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="p-4 border-b border-[var(--border)]">
      <div className="text-[11px] font-bold text-[var(--text-muted)] mb-2 tracking-wide">
        {title}
      </div>
      {children}
    </div>
  );
}

function SceneCard({
  scene,
  copied,
  genImage,
  genVideo,
  genTts,
  onUpdate,
  onCopy,
  onGenImage,
  onGenVideo,
  onGenTts,
}: {
  scene: Scene;
  copied: boolean;
  genImage: boolean;
  genVideo: boolean;
  genTts: boolean;
  onUpdate: (patch: Partial<Scene>) => void;
  onCopy: () => void;
  onGenImage: () => void;
  onGenVideo: () => void;
  onGenTts: () => void;
}) {
  return (
    <article className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-3 flex flex-col gap-2">
      <div className="aspect-video rounded-md bg-[var(--hover)] border border-[var(--border)] grid place-items-center text-[var(--text-muted)] text-xs relative overflow-hidden">
        {scene.videoUrl ? (
          <video
            src={scene.videoUrl}
            controls
            className="w-full h-full rounded-md object-cover"
          />
        ) : scene.imageUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={scene.imageUrl}
            alt=""
            className="w-full h-full rounded-md object-cover"
          />
        ) : (
          <span>이미지 없음</span>
        )}
        <span className="absolute top-1.5 left-1.5 w-5 h-5 rounded bg-black/60 text-white text-[10px] font-bold grid place-items-center">
          {scene.sceneNumber}
        </span>
        <span className="absolute top-1.5 right-1.5 text-[10px] px-1.5 py-0.5 rounded bg-black/60 text-white">
          {scene.estimatedDuration}초
        </span>
      </div>

      {scene.audioUrl && (
        <audio
          src={scene.audioUrl}
          controls
          className="w-full h-8"
        />
      )}

      <div className="text-[11px] text-[var(--text-muted)]">나레이션</div>
      <textarea
        value={scene.script}
        onChange={(e) => onUpdate({ script: e.target.value })}
        rows={2}
        className="w-full text-xs bg-[var(--hover)] border border-[var(--border)] rounded p-1.5 resize-none outline-none focus:border-[var(--text)]"
      />

      <div className="flex items-center justify-between">
        <div className="text-[11px] text-[var(--text-muted)]">비주얼 프롬프트</div>
        <button
          type="button"
          onClick={onCopy}
          className="text-[10px] px-1.5 py-0.5 rounded border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--hover)] hover:text-[var(--text)]"
        >
          {copied ? "복사됨" : "복사"}
        </button>
      </div>
      <textarea
        value={scene.stageDirection}
        onChange={(e) => onUpdate({ stageDirection: e.target.value })}
        rows={3}
        className="w-full text-[11px] bg-[var(--hover)] border border-[var(--border)] rounded p-1.5 resize-none outline-none focus:border-[var(--text)] font-mono"
      />

      <div className="text-[11px] text-[var(--text-muted)]">모션</div>
      <input
        value={scene.motion}
        onChange={(e) => onUpdate({ motion: e.target.value })}
        className="w-full h-7 text-[11px] bg-[var(--hover)] border border-[var(--border)] rounded px-1.5 outline-none focus:border-[var(--text)] font-mono"
      />

      {scene.mediaType === "image" && (
        <div className="flex flex-wrap gap-1 pt-1">
          {KEN_BURNS_OPTIONS.map((k) => (
            <button
              key={k.id}
              type="button"
              onClick={() =>
                onUpdate({ kenBurns: k.id === "none" ? undefined : k.id })
              }
              className={`text-[10px] px-1.5 h-6 rounded border ${
                (scene.kenBurns || "none") === k.id
                  ? "bg-white text-black border-white"
                  : "bg-[var(--hover)] border-[var(--border)] text-[var(--text-muted)]"
              }`}
            >
              {k.label}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-3 gap-1.5 pt-1">
        <button
          type="button"
          onClick={onGenImage}
          disabled={genImage}
          className="h-7 rounded-md text-[11px] border border-[var(--border)] hover:bg-[var(--hover)] disabled:opacity-40"
        >
          {genImage ? "🖼…" : scene.imageUrl ? "🖼 재생성" : "🖼 이미지"}
        </button>
        <button
          type="button"
          onClick={onGenVideo}
          disabled={genVideo}
          className="h-7 rounded-md text-[11px] border border-[var(--border)] hover:bg-[var(--hover)] disabled:opacity-40"
        >
          {genVideo ? "🎬…" : scene.videoUrl ? "🎬 재생성" : "🎬 영상"}
        </button>
        <button
          type="button"
          onClick={onGenTts}
          disabled={genTts || !scene.script}
          className="h-7 rounded-md text-[11px] border border-[var(--border)] hover:bg-[var(--hover)] disabled:opacity-40"
        >
          {genTts ? "🔊…" : scene.audioUrl ? "🔊 재생성" : "🔊 TTS"}
        </button>
      </div>
    </article>
  );
}
