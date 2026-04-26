"use client";

import { useEffect, useRef, useState } from "react";
import {
  CHAT_MODELS,
  DEFAULT_MODEL_ID,
  isValidModelId,
  IMAGE_MODELS,
  DEFAULT_IMAGE_MODEL_ID,
  isValidImageModelId,
} from "../lib/models";

type Role = "user" | "assistant";

type TextPart = { type: "text"; text: string };
type ImagePart = { type: "image"; url: string; prompt: string };
type StatusPart = { type: "status"; label: string };
type SourcesPart = {
  type: "sources";
  items: { url: string; title: string }[];
};
type AttachmentPart = {
  type: "attachment";
  kind: "image" | "document";
  name: string;
  mediaType: string;
  dataUrl: string;
};
type MessagePart =
  | TextPart
  | ImagePart
  | StatusPart
  | SourcesPart
  | AttachmentPart;

type Message = { id: string; role: Role; parts: MessagePart[] };

type PendingAttachment = {
  id: string;
  kind: "image" | "document";
  name: string;
  mediaType: string;
  dataUrl: string;
};

const ACCEPTED_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);
const ACCEPTED_DOC_TYPES = new Set(["application/pdf"]);
const MAX_FILE_BYTES = 20 * 1024 * 1024;

const fileToDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error ?? new Error("read failed"));
    r.readAsDataURL(file);
  });

type SseEvent =
  | { type: "text"; text: string }
  | { type: "tool_start"; name: string }
  | { type: "image"; url: string; prompt: string }
  | { type: "search_result"; url: string; title: string }
  | { type: "error"; message: string }
  | { type: "done" };

const MODEL_STORAGE_KEY = "mint-chat-model";
const IMAGE_MODEL_STORAGE_KEY = "mint-image-model";

const TOOL_TARGETS = [
  { key: "script", label: "대본", icon: "📝", path: "/script" },
  { key: "rebuild", label: "리빌드", icon: "🌐", path: "/rebuild" },
  { key: "studio", label: "스토리보드", icon: "🎬", path: "/studio" },
] as const;

const messageToText = (m: Message) =>
  m.parts
    .map((p) => (p.type === "text" ? p.text : p.type === "image" ? `[이미지: ${p.prompt}]` : ""))
    .join("")
    .trim();

const buildUserContent = (m: Message) => {
  const text = m.parts
    .filter((p): p is TextPart => p.type === "text")
    .map((p) => p.text)
    .join("")
    .trim();
  const atts = m.parts.filter(
    (p): p is AttachmentPart => p.type === "attachment",
  );
  if (atts.length === 0) return text;
  const blocks: Array<Record<string, unknown>> = atts.map((a) => ({
    type: a.kind,
    source: {
      type: "base64",
      media_type: a.mediaType,
      data: a.dataUrl.split(",")[1] ?? "",
    },
  }));
  if (text) blocks.push({ type: "text", text });
  return blocks;
};

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState<PendingAttachment[]>([]);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [modelId, setModelId] = useState<string>(DEFAULT_MODEL_ID);
  const [imageModelId, setImageModelId] = useState<string>(
    DEFAULT_IMAGE_MODEL_ID,
  );
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addFiles = async (files: FileList | File[]) => {
    setAttachError(null);
    const list = Array.from(files);
    const next: PendingAttachment[] = [];
    for (const f of list) {
      if (f.size > MAX_FILE_BYTES) {
        setAttachError(`${f.name}: 20MB를 초과합니다.`);
        continue;
      }
      const isImg = ACCEPTED_IMAGE_TYPES.has(f.type);
      const isDoc = ACCEPTED_DOC_TYPES.has(f.type);
      if (!isImg && !isDoc) {
        setAttachError(`${f.name}: 이미지(png/jpg/webp/gif) 또는 PDF만 가능합니다.`);
        continue;
      }
      try {
        const dataUrl = await fileToDataUrl(f);
        next.push({
          id: crypto.randomUUID(),
          kind: isImg ? "image" : "document",
          name: f.name,
          mediaType: f.type,
          dataUrl,
        });
      } catch {
        setAttachError(`${f.name}: 파일 읽기 실패`);
      }
    }
    if (next.length) setPending((prev) => [...prev, ...next]);
  };

  const removePending = (id: string) =>
    setPending((prev) => prev.filter((p) => p.id !== id));

  useEffect(() => {
    const saved = window.localStorage.getItem(MODEL_STORAGE_KEY);
    if (isValidModelId(saved)) setModelId(saved);
    const savedImg = window.localStorage.getItem(IMAGE_MODEL_STORAGE_KEY);
    if (isValidImageModelId(savedImg)) setImageModelId(savedImg);
  }, []);

  const changeModel = (id: string) => {
    setModelId(id);
    window.localStorage.setItem(MODEL_STORAGE_KEY, id);
  };

  const changeImageModel = (id: string) => {
    setImageModelId(id);
    window.localStorage.setItem(IMAGE_MODEL_STORAGE_KEY, id);
  };

  const appendToAssistant = (
    id: string,
    updater: (parts: MessagePart[]) => MessagePart[],
  ) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, parts: updater(m.parts) } : m)),
    );
  };

  const handleEvent = (assistantId: string, e: SseEvent) => {
    appendToAssistant(assistantId, (parts) => {
      if (e.type === "text") {
        const last = parts[parts.length - 1];
        if (last?.type === "text") {
          return [...parts.slice(0, -1), { type: "text", text: last.text + e.text }];
        }
        return [...parts, { type: "text", text: e.text }];
      }
      if (e.type === "tool_start") {
        const label =
          e.name === "generate_image"
            ? "🎨 이미지 생성 중…"
            : e.name === "web_search"
              ? "🔍 웹 검색 중…"
              : e.name === "fetch_url"
                ? "🔗 URL 읽는 중…"
                : `${e.name} 실행 중…`;
        return [
          ...parts.filter((p) => p.type !== "status"),
          { type: "status", label },
        ];
      }
      if (e.type === "image") {
        return [
          ...parts.filter((p) => p.type !== "status"),
          { type: "image", url: e.url, prompt: e.prompt },
        ];
      }
      if (e.type === "search_result") {
        const withoutStatus = parts.filter((p) => p.type !== "status");
        const lastIdx = withoutStatus.findLastIndex(
          (p) => p.type === "sources",
        );
        const newItem = { url: e.url, title: e.title };
        if (lastIdx >= 0) {
          const existing = withoutStatus[lastIdx] as SourcesPart;
          if (existing.items.some((x) => x.url === newItem.url)) {
            return withoutStatus;
          }
          const updated: SourcesPart = {
            type: "sources",
            items: [...existing.items, newItem],
          };
          return [
            ...withoutStatus.slice(0, lastIdx),
            updated,
            ...withoutStatus.slice(lastIdx + 1),
          ];
        }
        return [...withoutStatus, { type: "sources", items: [newItem] }];
      }
      if (e.type === "error") {
        return [
          ...parts.filter((p) => p.type !== "status"),
          { type: "text", text: `\n\n[에러] ${e.message}` },
        ];
      }
      return parts;
    });
  };

  const handleSend = async () => {
    const text = input.trim();
    if ((!text && pending.length === 0) || sending) return;

    const userParts: MessagePart[] = [
      ...pending.map<AttachmentPart>((p) => ({
        type: "attachment",
        kind: p.kind,
        name: p.name,
        mediaType: p.mediaType,
        dataUrl: p.dataUrl,
      })),
    ];
    if (text) userParts.push({ type: "text", text });

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      parts: userParts,
    };
    const assistantId = crypto.randomUUID();
    const history = [...messages, userMsg];

    setMessages([
      ...history,
      { id: assistantId, role: "assistant", parts: [] },
    ]);
    setInput("");
    setPending([]);
    setAttachError(null);
    setSending(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: modelId,
          imageModel: imageModelId,
          messages: history.map((m) => ({
            role: m.role,
            content: m.role === "user" ? buildUserContent(m) : messageToText(m),
          })),
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
          const json = line.slice(5).trim();
          if (!json) continue;
          try {
            const parsed = JSON.parse(json) as SseEvent;
            handleEvent(assistantId, parsed);
          } catch {
            // ignore malformed frames
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "요청 실패";
      handleEvent(assistantId, { type: "error", message: msg });
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center justify-between px-6 h-14 border-b border-[var(--border)]">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium mr-1">AI 채팅</span>
          <ModelPicker
            options={CHAT_MODELS}
            value={modelId}
            onChange={changeModel}
          />
          <span className="text-[var(--border)]">·</span>
          <ModelPicker
            options={IMAGE_MODELS}
            value={imageModelId}
            onChange={changeImageModel}
            prefix="🎨"
          />
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="h-8 px-3 rounded-md text-sm hover:bg-[var(--hover)] text-[var(--text-muted)]"
          >
            공유
          </button>
          <button
            type="button"
            className="w-8 h-8 grid place-items-center rounded-md hover:bg-[var(--hover)] text-[var(--text-muted)]"
            aria-label="더보기"
          >
            ⋯
          </button>
        </div>
      </header>

      <div className="flex-1 scroll-y">
        {messages.length === 0 ? (
          <EmptyState onPick={(t) => setInput(t)} />
        ) : (
          <div className="max-w-3xl mx-auto w-full px-6 py-8 flex flex-col gap-6">
            {messages.map((m) => (
              <MessageBubble key={m.id} message={m} sending={sending} />
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-[var(--border)] px-6 py-4">
        <div className="max-w-3xl mx-auto w-full">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)] px-3 py-2 focus-within:border-[var(--text)]">
            {pending.length > 0 && (
              <div className="flex flex-wrap gap-2 pb-2 border-b border-[var(--border)] mb-2">
                {pending.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-md border border-[var(--border)] bg-[var(--hover)] text-xs max-w-[14rem]"
                    title={p.name}
                  >
                    {p.kind === "image" ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={p.dataUrl}
                        alt=""
                        className="w-6 h-6 rounded object-cover"
                      />
                    ) : (
                      <span className="w-6 h-6 grid place-items-center bg-[var(--panel)] rounded border border-[var(--border)]">
                        📄
                      </span>
                    )}
                    <span className="truncate">{p.name}</span>
                    <button
                      type="button"
                      onClick={() => removePending(p.id)}
                      className="text-[var(--text-muted)] hover:text-[var(--text)]"
                      aria-label="첨부 제거"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-end gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={sending}
                className="h-8 w-8 grid place-items-center rounded-md hover:bg-[var(--hover)] text-[var(--text-muted)] disabled:opacity-30"
                aria-label="파일 첨부"
                title="이미지·PDF 첨부"
              >
                📎
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/png,image/jpeg,image/webp,image/gif,application/pdf"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="무엇이든 물어보세요"
                rows={1}
                className="flex-1 resize-none bg-transparent outline-none text-sm leading-6 py-1 min-h-[28px] max-h-48"
              />
              <button
                type="button"
                onClick={handleSend}
                disabled={(!input.trim() && pending.length === 0) || sending}
                className="h-8 px-3 rounded-md text-sm font-medium bg-white text-black disabled:opacity-30 disabled:cursor-not-allowed"
              >
                전송
              </button>
            </div>
          </div>
          {attachError && (
            <p className="mt-2 text-[11px] text-red-600 text-center">
              {attachError}
            </p>
          )}
          <p className="mt-2 text-[11px] text-[var(--text-muted)] text-center">
            Enter 전송 · Shift+Enter 줄바꿈 · 📎 이미지·PDF
          </p>
        </div>
      </div>
    </div>
  );
}

function SendToToolBar({ text }: { text: string }) {
  const send = (target: (typeof TOOL_TARGETS)[number]) => {
    window.localStorage.setItem(`mint-prefill-${target.key}`, text);
    window.open(target.path, "_blank");
  };
  return (
    <div className="flex flex-wrap gap-1.5 pt-2 mt-1 border-t border-black/5">
      {TOOL_TARGETS.map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => send(t)}
          className="text-[11px] px-2 py-1 rounded-md border border-[var(--border)] bg-white/60 hover:bg-white text-[var(--text-muted)] hover:text-[var(--text)]"
          title={`${t.label}으로 보내기 (새 탭)`}
        >
          {t.icon} {t.label}으로 →
        </button>
      ))}
    </div>
  );
}

function MessageBubble({
  message,
  sending,
}: {
  message: Message;
  sending: boolean;
}) {
  const isUser = message.role === "user";
  const isWaiting = !isUser && sending && message.parts.length === 0;
  const assistantText = !isUser
    ? message.parts
        .filter((p): p is TextPart => p.type === "text")
        .map((p) => p.text)
        .join("\n")
        .trim()
    : "";
  const showSendBar = !isUser && !isWaiting && assistantText.length > 0;
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-6 ${
          isUser
            ? "bg-white text-black"
            : "bg-[var(--hover)] text-[var(--text)]"
        }`}
      >
        {isWaiting ? (
          <span className="text-[var(--text-muted)]">생각 중…</span>
        ) : (
          <div className="flex flex-col gap-2">
            {message.parts.map((p, i) => {
              if (p.type === "text") {
                return (
                  <div key={i} className="whitespace-pre-wrap">
                    {p.text}
                  </div>
                );
              }
              if (p.type === "image") {
                return (
                  <figure key={i} className="flex flex-col gap-1">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={p.url}
                      alt={p.prompt}
                      className="rounded-lg max-w-full h-auto border border-black/5"
                    />
                    <figcaption className="text-[11px] text-[var(--text-muted)] truncate">
                      {p.prompt}
                    </figcaption>
                  </figure>
                );
              }
              if (p.type === "status") {
                return (
                  <div
                    key={i}
                    className="text-[var(--text-muted)] italic text-xs"
                  >
                    {p.label}
                  </div>
                );
              }
              if (p.type === "attachment") {
                if (p.kind === "image") {
                  return (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      key={i}
                      src={p.dataUrl}
                      alt={p.name}
                      className={`rounded-lg max-w-full h-auto border ${isUser ? "border-black/10" : "border-white/10"}`}
                    />
                  );
                }
                return (
                  <div
                    key={i}
                    className={`flex items-center gap-2 text-xs px-2 py-1.5 rounded-md border ${isUser ? "bg-black/5 border-black/10" : "bg-white/10 border-white/10"}`}
                  >
                    <span>📄</span>
                    <span className="truncate">{p.name}</span>
                  </div>
                );
              }
              if (p.type === "sources") {
                return (
                  <div key={i} className="flex flex-col gap-1 pt-1">
                    <div className="text-[11px] text-[var(--text-muted)]">
                      출처 {p.items.length}개
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {p.items.map((s, j) => (
                        <a
                          key={j}
                          href={s.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] px-2 py-1 rounded-md bg-[var(--panel)] border border-[var(--border)] hover:bg-[var(--hover)] text-[var(--text)] max-w-[16rem] truncate"
                          title={s.url}
                        >
                          {s.title}
                        </a>
                      ))}
                    </div>
                  </div>
                );
              }
              return null;
            })}
            {showSendBar && <SendToToolBar text={assistantText} />}
          </div>
        )}
      </div>
    </div>
  );
}

const SUGGESTIONS = [
  "이번 주 트렌드 주제 3개 추천해줘",
  "20대 타깃 숏폼 대본 아이디어 줘",
  "이 영상 주제로 썸네일 문구 10개",
  "해외 영상 리빌드는 어떻게 시작해?",
];

function EmptyState({ onPick }: { onPick: (t: string) => void }) {
  return (
    <div className="h-full grid place-items-center px-6">
      <div className="text-center max-w-xl w-full">
        <h1 className="text-2xl font-semibold tracking-tight">
          무엇을 만들어볼까요?
        </h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          아이디어, 기획, 대본 — 편하게 대화하듯 물어보세요.
        </p>
        <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onPick(s)}
              className="text-left text-sm px-4 py-3 rounded-lg border border-[var(--border)] hover:bg-[var(--hover)]"
            >
              {s}
            </button>
          ))}
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
  prefix,
}: {
  options: readonly PickerOption[];
  value: string;
  onChange: (id: string) => void;
  prefix?: string;
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
        {prefix && <span className="text-xs">{prefix}</span>}
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
