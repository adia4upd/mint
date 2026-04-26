"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  CHAT_MODELS,
  DEFAULT_MODEL_ID,
  isValidModelId,
} from "../lib/models";
import { CUSTOM_ID, Guideline, loadGuidelines } from "../lib/guidelines";

const MODEL_STORAGE_KEY = "mint-chat-model";
const SELECTED_GUIDELINE_STORAGE_KEY = "mint-rebuild-selected-guideline";

type SseEvent =
  | { type: "status"; label: string }
  | { type: "text"; text: string }
  | { type: "error"; message: string }
  | { type: "done" };

const TONES = ["친근", "정보", "진지", "유쾌"];
const LENGTHS = ["30초", "1분", "2분", "5분"];

export default function RebuildPage() {
  const [source, setSource] = useState("");
  const [tone, setTone] = useState("친근");
  const [length, setLength] = useState("2분");
  const [modelId, setModelId] = useState<string>(DEFAULT_MODEL_ID);
  const [savedList, setSavedList] = useState<Guideline[]>([]);
  const [selectedId, setSelectedId] = useState<string>(CUSTOM_ID);
  const [status, setStatus] = useState<string | null>(null);
  const [result, setResult] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem(MODEL_STORAGE_KEY);
    if (isValidModelId(saved)) setModelId(saved);
    const list = loadGuidelines();
    setSavedList(list);
    const storedSel =
      window.localStorage.getItem(SELECTED_GUIDELINE_STORAGE_KEY) ?? CUSTOM_ID;
    if (storedSel === CUSTOM_ID || list.some((g) => g.id === storedSel)) {
      setSelectedId(storedSel);
    }

    const prefill = window.localStorage.getItem("mint-prefill-rebuild");
    if (prefill) {
      setSource(prefill);
      window.localStorage.removeItem("mint-prefill-rebuild");
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(SELECTED_GUIDELINE_STORAGE_KEY, selectedId);
  }, [selectedId]);

  const activeGuideline =
    selectedId === CUSTOM_ID
      ? ""
      : savedList.find((g) => g.id === selectedId)?.content ?? "";

  const handleGenerate = async () => {
    const s = source.trim();
    if (!s || running) return;
    setRunning(true);
    setStatus(null);
    setResult("");
    setError(null);
    setCopied(false);

    try {
      const res = await fetch("/api/rebuild", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: s,
          tone,
          length,
          guidelines: activeGuideline.trim(),
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
            if (e.type === "text") setResult((r) => r + e.text);
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

  const handleCopy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center justify-between px-6 h-14 border-b border-[var(--border)]">
        <span className="text-sm font-medium">해외영상 리빌드</span>
      </header>

      <div className="flex-1 scroll-y">
        <div className="max-w-3xl mx-auto w-full px-6 py-8 flex flex-col gap-6">
          <section className="flex flex-col gap-2">
            <label className="text-sm font-medium">
              원본 (URL 또는 외국어 텍스트/자막)
            </label>
            <textarea
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder={`URL 예) https://www.example.com/article\n또는 외국어 원문/자막을 붙여넣으세요`}
              rows={8}
              className="w-full resize-y rounded-xl border border-[var(--border)] bg-[var(--panel)] px-4 py-3 text-sm leading-6 outline-none focus:border-[var(--text)] font-mono"
            />
          </section>

          <section className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">톤</label>
              <div className="flex gap-1.5 flex-wrap">
                {TONES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTone(t)}
                    className={`h-8 px-3 rounded-md text-sm border ${
                      tone === t
                        ? "bg-white text-black border-white"
                        : "bg-[var(--panel)] border-[var(--border)] hover:bg-[var(--hover)]"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">길이</label>
              <div className="flex gap-1.5 flex-wrap">
                {LENGTHS.map((l) => (
                  <button
                    key={l}
                    type="button"
                    onClick={() => setLength(l)}
                    className={`h-8 px-3 rounded-md text-sm border ${
                      length === l
                        ? "bg-white text-black border-white"
                        : "bg-[var(--panel)] border-[var(--border)] hover:bg-[var(--hover)]"
                    }`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">대본 지침 (선택)</label>
              <Link
                href="/settings/guidelines"
                className="text-xs text-[var(--text-muted)] hover:text-[var(--text)] underline-offset-2 hover:underline"
              >
                지침 관리 →
              </Link>
            </div>
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="h-10 rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3 text-sm outline-none focus:border-[var(--text)]"
            >
              <option value={CUSTOM_ID}>지침 없음</option>
              {savedList.length > 0 && (
                <optgroup label="저장된 지침">
                  {savedList.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
            {activeGuideline && (
              <pre className="whitespace-pre-wrap rounded-xl border border-[var(--border)] bg-[var(--hover)] px-4 py-3 text-xs leading-5 text-[var(--text-muted)] font-mono">
                {activeGuideline}
              </pre>
            )}
          </section>

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={handleGenerate}
              disabled={!source.trim() || running}
              className="h-9 px-4 rounded-md text-sm font-medium bg-white text-black disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {running ? "리빌드 중…" : "리빌드 시작"}
            </button>
          </div>

          {(result || error || status) && (
            <section className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">결과</label>
                <button
                  type="button"
                  onClick={handleCopy}
                  disabled={!result}
                  className="h-8 px-3 rounded-md text-xs hover:bg-[var(--hover)] disabled:opacity-30"
                >
                  {copied ? "복사됨" : "복사"}
                </button>
              </div>
              {status && !result && (
                <div className="rounded-lg border border-[var(--border)] bg-[var(--hover)] px-4 py-3 text-sm text-[var(--text-muted)] italic">
                  {status}
                </div>
              )}
              {error && (
                <div className="rounded-lg border border-[var(--border)] bg-[var(--hover)] px-4 py-3 text-sm text-[var(--text)]">
                  [에러] {error}
                </div>
              )}
              {result && (
                <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)] px-5 py-4 text-sm leading-7 whitespace-pre-wrap">
                  {result}
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
