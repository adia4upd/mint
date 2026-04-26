"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DEFAULT_MODEL_ID,
  isValidModelId,
} from "../lib/models";

const MODEL_STORAGE_KEY = "mint-chat-model";
const EDITOR_DRAFT_KEY = "mint-storyboard-draft";

type SseEvent =
  | { type: "status"; label: string }
  | { type: "text"; text: string }
  | { type: "error"; message: string }
  | { type: "done" };

type Scene = {
  idx: number;
  duration: number;
  visual: string;
  narration: string;
  subtitle: string;
  motion: string;
};

const DURATIONS = [30, 60, 120, 300];
const ASPECTS = ["9:16", "1:1", "16:9"];

function extractJson(raw: string): Scene[] | null {
  const trimmed = raw.trim();
  const start = trimmed.indexOf("[");
  const end = trimmed.lastIndexOf("]");
  if (start < 0 || end <= start) return null;
  const slice = trimmed.slice(start, end + 1);
  try {
    const parsed = JSON.parse(slice);
    if (!Array.isArray(parsed)) return null;
    return parsed.map((s, i) => ({
      idx: typeof s.idx === "number" ? s.idx : i + 1,
      duration: Number(s.duration) || 0,
      visual: String(s.visual ?? ""),
      narration: String(s.narration ?? ""),
      subtitle: String(s.subtitle ?? ""),
      motion: String(s.motion ?? ""),
    }));
  } catch {
    return null;
  }
}

function genId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export default function StudioPage() {
  const router = useRouter();
  const [script, setScript] = useState("");
  const [duration, setDuration] = useState(60);
  const [aspect, setAspect] = useState("9:16");
  const [modelId, setModelId] = useState<string>(DEFAULT_MODEL_ID);
  const [status, setStatus] = useState<string | null>(null);
  const [raw, setRaw] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [sentToEditor, setSentToEditor] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem(MODEL_STORAGE_KEY);
    if (isValidModelId(saved)) setModelId(saved);

    const prefill = window.localStorage.getItem("mint-prefill-studio");
    if (prefill) {
      setScript(prefill);
      window.localStorage.removeItem("mint-prefill-studio");
    }
  }, []);

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  };

  const handleCopyAll = async (visuals: string[]) => {
    const ok = await copyToClipboard(visuals.join("\n\n"));
    if (ok) {
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 1500);
    }
  };

  const handleCopyOne = async (idx: number, visual: string) => {
    const ok = await copyToClipboard(visual);
    if (ok) {
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx((v) => (v === idx ? null : v)), 1500);
    }
  };

  const handleSendToEditor = (sceneList: Scene[]) => {
    const editorScenes = sceneList.map((s) => {
      const narration = s.narration || "";
      return {
        id: genId(),
        sceneNumber: s.idx,
        script: narration,
        stageDirection: s.visual || "",
        motion: s.motion || "",
        charCount: narration.length,
        estimatedDuration: s.duration || 5,
        mediaType: "video" as const,
        imageUrl: null,
        videoUrl: null,
        videoSourceUrl: null,
        audioUrl: null,
      };
    });
    const firstLine = (script.trim().split(/\r?\n/)[0] || "").slice(0, 40);
    const draft = {
      projectName: firstLine || `Mint_${Date.now()}`,
      script: script.trim(),
      style: "시네마틱",
      format: aspect === "9:16" ? "shorts" : "longform",
      scenes: editorScenes,
      styleGuide: "",
    };
    window.localStorage.setItem(EDITOR_DRAFT_KEY, JSON.stringify(draft));
    setSentToEditor(true);
    router.push("/storyboard-editor");
  };

  const scenes = running ? null : extractJson(raw);
  const totalDuration = scenes?.reduce((acc, s) => acc + s.duration, 0) ?? 0;

  const handleGenerate = async () => {
    const s = script.trim();
    if (!s || running) return;
    setRunning(true);
    setStatus(null);
    setRaw("");
    setError(null);

    try {
      const res = await fetch("/api/studio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          script: s,
          duration,
          aspect,
          model: modelId,
        }),
      });
      if (!res.ok || !res.body) {
        const errText = await res.text().catch(() => "");
        throw new Error(errText || `HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buf.indexOf("\n\n")) !== -1) {
          const frame = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const line = frame.trim();
          if (!line.startsWith("data:")) continue;
          try {
            const e = JSON.parse(line.slice(5).trim()) as SseEvent;
            if (e.type === "text") setRaw((r) => r + e.text);
            else if (e.type === "status") setStatus(e.label);
            else if (e.type === "error") setError(e.message);
          } catch {
            // ignore malformed
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "요청 실패");
    } finally {
      setRunning(false);
      setStatus(null);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center justify-between px-6 h-14 border-b border-[var(--border)]">
        <span className="text-sm font-medium">AI 스토리보드</span>
      </header>

      <div className="flex-1 scroll-y">
        <div className="max-w-4xl mx-auto w-full px-6 py-8 flex flex-col gap-6">
          <section className="flex flex-col gap-2">
            <label className="text-sm font-medium">대본</label>
            <textarea
              value={script}
              onChange={(e) => setScript(e.target.value)}
              placeholder="대본을 붙여넣으세요. (제목 + 본문)"
              rows={10}
              className="w-full resize-y rounded-xl border border-[var(--border)] bg-[var(--panel)] px-4 py-3 text-sm leading-6 outline-none focus:border-[var(--text)]"
            />
          </section>

          <section className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">길이</label>
              <div className="flex gap-1.5 flex-wrap">
                {DURATIONS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDuration(d)}
                    className={`h-8 px-3 rounded-md text-sm border ${
                      duration === d
                        ? "bg-white text-black border-white"
                        : "bg-[var(--panel)] border-[var(--border)] hover:bg-[var(--hover)]"
                    }`}
                  >
                    {d < 60 ? `${d}초` : `${d / 60}분`}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">화면비</label>
              <div className="flex gap-1.5 flex-wrap">
                {ASPECTS.map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => setAspect(a)}
                    className={`h-8 px-3 rounded-md text-sm border ${
                      aspect === a
                        ? "bg-white text-black border-white"
                        : "bg-[var(--panel)] border-[var(--border)] hover:bg-[var(--hover)]"
                    }`}
                  >
                    {a}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <div className="flex items-center justify-end">
            <button
              type="button"
              onClick={handleGenerate}
              disabled={!script.trim() || running}
              className="h-9 px-4 rounded-md text-sm font-medium bg-white text-black disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {running ? "생성 중…" : "스토리보드 생성"}
            </button>
          </div>

          {(raw || error || status) && (
            <section className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">
                  씬 {scenes?.length ?? "…"}
                  {scenes && ` · 총 ${totalDuration}초`}
                </label>
                {scenes && scenes.length > 0 && (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleCopyAll(scenes.map((s) => s.visual))}
                      className="h-8 px-3 rounded-md text-xs border border-[var(--border)] hover:bg-[var(--hover)]"
                      title="모든 씬의 비주얼 프롬프트를 빈 줄로 구분해 복사"
                    >
                      {copiedAll ? "복사됨" : "비주얼 전체 복사"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSendToEditor(scenes)}
                      disabled={sentToEditor}
                      className="h-8 px-3 rounded-md text-xs font-medium bg-white text-black disabled:opacity-50"
                      title="씬 데이터를 스토리보드 에디터로 보내기"
                    >
                      {sentToEditor ? "이동 중…" : "에디터에서 열기 →"}
                    </button>
                  </div>
                )}
              </div>
              {status && !raw && (
                <div className="rounded-lg border border-[var(--border)] bg-[var(--hover)] px-4 py-3 text-sm text-[var(--text-muted)] italic">
                  {status}
                </div>
              )}
              {error && (
                <div className="rounded-lg border border-[var(--border)] bg-[var(--hover)] px-4 py-3 text-sm text-[var(--text)]">
                  [에러] {error}
                </div>
              )}
              {scenes ? (
                <div className="flex flex-col gap-3">
                  {scenes.map((s) => (
                    <article
                      key={s.idx}
                      className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-4 flex flex-col gap-2"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-7 h-7 rounded-md bg-white text-black text-xs font-semibold grid place-items-center">
                            {s.idx}
                          </span>
                          <span className="text-xs text-[var(--text-muted)]">
                            {s.duration}초
                          </span>
                        </div>
                        {s.motion && (
                          <span className="text-[11px] text-[var(--text-muted)] px-2 py-0.5 rounded bg-[var(--hover)]">
                            {s.motion}
                          </span>
                        )}
                      </div>
                      <div className="text-sm flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <span className="text-[11px] text-[var(--text-muted)] mr-1.5">
                            비주얼
                          </span>
                          {s.visual}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleCopyOne(s.idx, s.visual)}
                          className="shrink-0 h-6 px-2 rounded-md text-[11px] border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--hover)] hover:text-[var(--text)]"
                          title="이 씬의 비주얼 프롬프트 복사"
                        >
                          {copiedIdx === s.idx ? "복사됨" : "복사"}
                        </button>
                      </div>
                      <div className="text-sm leading-6">
                        <span className="text-[11px] text-[var(--text-muted)] mr-1.5">
                          나레이션
                        </span>
                        {s.narration}
                      </div>
                      {s.subtitle && (
                        <div className="text-sm font-medium bg-[var(--hover)] px-3 py-1.5 rounded-md w-fit">
                          「{s.subtitle}」
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              ) : (
                raw && (
                  <pre className="rounded-xl border border-[var(--border)] bg-[var(--panel)] px-4 py-3 text-xs leading-5 whitespace-pre-wrap font-mono text-[var(--text-muted)]">
                    {raw}
                  </pre>
                )
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
