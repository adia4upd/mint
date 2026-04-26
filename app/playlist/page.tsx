"use client";

import { useEffect, useState } from "react";
import {
  DEFAULT_MODEL_ID,
  isValidModelId,
} from "../lib/models";

const MODEL_STORAGE_KEY = "mint-chat-model";

type SseEvent =
  | { type: "text"; text: string }
  | { type: "error"; message: string }
  | { type: "done" };

const COUNTS = [5, 10, 15, 20, 30];
const PRESETS = [
  "새벽 4시 카페 LoFi",
  "운동 자극 힙합",
  "비 오는 날 감성 발라드",
  "집중 공부 피아노",
];

export default function PlaylistPage() {
  const [theme, setTheme] = useState("");
  const [count, setCount] = useState(10);
  const [modelId, setModelId] = useState<string>(DEFAULT_MODEL_ID);
  const [result, setResult] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem(MODEL_STORAGE_KEY);
    if (isValidModelId(saved)) setModelId(saved);
  }, []);

  const handleGenerate = async () => {
    const t = theme.trim();
    if (!t || running) return;
    setRunning(true);
    setResult("");
    setError(null);
    setCopied(false);

    try {
      const res = await fetch("/api/playlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme: t, count, model: modelId }),
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
        <span className="text-sm font-medium">플레이리스트</span>
      </header>

      <div className="flex-1 scroll-y">
        <div className="max-w-3xl mx-auto w-full px-6 py-8 flex flex-col gap-6">
          <section className="flex flex-col gap-2">
            <label className="text-sm font-medium">테마 · 분위기</label>
            <textarea
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              placeholder="예) 새벽 4시 카페에서 듣는 LoFi, 비 오는 퇴근길 발라드"
              rows={3}
              className="w-full resize-y rounded-xl border border-[var(--border)] bg-[var(--panel)] px-4 py-3 text-sm leading-6 outline-none focus:border-[var(--text)]"
            />
            <div className="flex flex-wrap gap-1.5 pt-1">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setTheme(p)}
                  className="h-7 px-3 rounded-md text-xs border border-[var(--border)] bg-[var(--panel)] hover:bg-[var(--hover)]"
                >
                  {p}
                </button>
              ))}
            </div>
          </section>

          <section className="flex flex-col gap-2">
            <label className="text-sm font-medium">트랙 수</label>
            <div className="flex gap-1.5 flex-wrap">
              {COUNTS.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setCount(n)}
                  className={`h-8 px-3 rounded-md text-sm border ${
                    count === n
                      ? "bg-white text-black border-white"
                      : "bg-[var(--panel)] border-[var(--border)] hover:bg-[var(--hover)]"
                  }`}
                >
                  {n}곡
                </button>
              ))}
            </div>
          </section>

          <div className="flex items-center justify-end">
            <button
              type="button"
              onClick={handleGenerate}
              disabled={!theme.trim() || running}
              className="h-9 px-4 rounded-md text-sm font-medium bg-white text-black disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {running ? "기획 중…" : "플레이리스트 생성"}
            </button>
          </div>

          {(result || error) && (
            <section className="flex flex-col gap-3">
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
              {error && (
                <div className="rounded-lg border border-[var(--border)] bg-[var(--hover)] px-4 py-3 text-sm text-[var(--text)]">
                  [에러] {error}
                </div>
              )}
              {result && (
                <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)] px-5 py-4 text-sm leading-7 whitespace-pre-wrap font-mono">
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
