"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  CHAT_MODELS,
  DEFAULT_MODEL_ID,
  isValidModelId,
} from "../lib/models";
import { CUSTOM_ID, Guideline, loadGuidelines } from "../lib/guidelines";

const MODEL_STORAGE_KEY = "mint-chat-model";
const GUIDELINES_STORAGE_KEY = "mint-script-guidelines";
const SELECTED_GUIDELINE_STORAGE_KEY = "mint-script-selected-guideline";

type SseEvent =
  | { type: "text"; text: string }
  | { type: "error"; message: string }
  | { type: "done" };

export default function ScriptPage() {
  const [topic, setTopic] = useState("");
  const [customGuidelines, setCustomGuidelines] = useState("");
  const [savedList, setSavedList] = useState<Guideline[]>([]);
  const [selectedId, setSelectedId] = useState<string>(CUSTOM_ID);
  const [modelId, setModelId] = useState<string>(DEFAULT_MODEL_ID);
  const [result, setResult] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const topicRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem(MODEL_STORAGE_KEY);
    if (isValidModelId(saved)) setModelId(saved);
    const savedGuide = window.localStorage.getItem(GUIDELINES_STORAGE_KEY);
    if (savedGuide) setCustomGuidelines(savedGuide);

    const list = loadGuidelines();
    setSavedList(list);

    const storedSel =
      window.localStorage.getItem(SELECTED_GUIDELINE_STORAGE_KEY) ?? CUSTOM_ID;
    if (storedSel === CUSTOM_ID || list.some((g) => g.id === storedSel)) {
      setSelectedId(storedSel);
    } else {
      setSelectedId(CUSTOM_ID);
    }

    const prefill = window.localStorage.getItem("mint-prefill-script");
    if (prefill) {
      setTopic(prefill);
      window.localStorage.removeItem("mint-prefill-script");
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(GUIDELINES_STORAGE_KEY, customGuidelines);
  }, [customGuidelines]);

  useEffect(() => {
    window.localStorage.setItem(SELECTED_GUIDELINE_STORAGE_KEY, selectedId);
  }, [selectedId]);

  const changeModel = (id: string) => {
    setModelId(id);
    window.localStorage.setItem(MODEL_STORAGE_KEY, id);
  };

  const activeGuideline =
    selectedId === CUSTOM_ID
      ? customGuidelines
      : savedList.find((g) => g.id === selectedId)?.content ?? "";
  const isCustom = selectedId === CUSTOM_ID;

  const handleGenerate = async () => {
    const t = topic.trim();
    if (!t || running) return;
    setRunning(true);
    setResult("");
    setError(null);
    setCopied(false);

    try {
      const res = await fetch("/api/script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: t,
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
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium mr-1">대본 생성</span>
          <ModelPicker
            options={CHAT_MODELS}
            value={modelId}
            onChange={changeModel}
          />
        </div>
      </header>

      <div className="flex-1 scroll-y">
        <div className="max-w-3xl mx-auto w-full px-6 py-8 flex flex-col gap-6">
          <section className="flex flex-col gap-2">
            <label className="text-sm font-medium">주제 · 요청</label>
            <textarea
              ref={topicRef}
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="예) 20대 직장인 타깃, 2분 분량 숏폼. 주제: 첫 투자 실수 3가지. 친근한 반말 톤."
              rows={4}
              className="w-full resize-y rounded-xl border border-[var(--border)] bg-[var(--panel)] px-4 py-3 text-sm leading-6 outline-none focus:border-[var(--text)]"
            />
          </section>

          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">대본 지침</label>
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
              <option value={CUSTOM_ID}>직접 입력</option>
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
            {isCustom ? (
              <textarea
                value={customGuidelines}
                onChange={(e) => setCustomGuidelines(e.target.value)}
                placeholder={`예)\n- 훅은 의문형으로\n- 한 문장 15자 이내\n- 외래어 최소화\n- 마지막 CTA는 "구독/좋아요" 대신 "댓글로 공유해주세요"`}
                rows={5}
                className="w-full resize-y rounded-xl border border-[var(--border)] bg-[var(--panel)] px-4 py-3 text-sm leading-6 outline-none focus:border-[var(--text)] font-mono"
              />
            ) : (
              <pre className="whitespace-pre-wrap rounded-xl border border-[var(--border)] bg-[var(--hover)] px-4 py-3 text-xs leading-5 text-[var(--text-muted)] font-mono min-h-[5rem]">
                {activeGuideline || "(내용 없음)"}
              </pre>
            )}
          </section>

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={handleGenerate}
              disabled={!topic.trim() || running}
              className="h-9 px-4 rounded-md text-sm font-medium bg-white text-black disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {running ? "생성 중…" : "대본 생성"}
            </button>
          </div>

          {(result || error) && (
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

type PickerOption = { id: string; label: string; hint: string };

function ModelPicker({
  options,
  value,
  onChange,
}: {
  options: readonly PickerOption[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const current = options.find((m) => m.id === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="h-8 px-2.5 rounded-md text-sm flex items-center gap-1.5 hover:bg-[var(--hover)] text-[var(--text)]"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span>{current.label}</span>
        <span className="text-[var(--text-muted)] text-xs">▾</span>
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute left-0 top-full mt-1 w-56 panel border border-[var(--border)] py-1 z-10"
        >
          {options.map((m) => {
            const selected = m.id === value;
            return (
              <button
                key={m.id}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => {
                  onChange(m.id);
                  setOpen(false);
                }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-[var(--hover)] flex items-start gap-2 ${
                  selected ? "bg-[var(--active)]" : ""
                }`}
              >
                <span className="w-4 text-[var(--text)] shrink-0">
                  {selected ? "✓" : ""}
                </span>
                <span className="flex-1 min-w-0">
                  <div className="font-medium">{m.label}</div>
                  <div className="text-xs text-[var(--text-muted)]">
                    {m.hint}
                  </div>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
