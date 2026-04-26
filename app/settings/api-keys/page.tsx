"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "mint-api-keys";

type Keys = {
  anthropic: string;
  elevenlabs: string;
};

function loadKeys(): Keys {
  if (typeof window === "undefined") return { anthropic: "", elevenlabs: "" };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : { anthropic: "", elevenlabs: "" };
  } catch {
    return { anthropic: "", elevenlabs: "" };
  }
}

function saveKeys(keys: Keys) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
}

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<Keys>({ anthropic: "", elevenlabs: "" });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setKeys(loadKeys());
  }, []);

  const handleSave = () => {
    saveKeys(keys);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="max-w-xl mx-auto p-8">
      <h1 className="text-xl font-semibold mb-1">API 키 설정</h1>
      <p className="text-sm text-[var(--text-muted)] mb-8">
        키는 이 브라우저의 localStorage에만 저장됩니다. 서버로 전송되지 않습니다.
      </p>

      <div className="flex flex-col gap-6">
        <KeyField
          label="Anthropic API Key"
          placeholder="sk-ant-..."
          value={keys.anthropic}
          onChange={(v) => setKeys((k) => ({ ...k, anthropic: v }))}
          hint="Claude 채팅·대본 생성·트렌드 조사에 사용"
          link="https://console.anthropic.com/settings/keys"
        />
        <KeyField
          label="ElevenLabs API Key"
          placeholder="sk_..."
          value={keys.elevenlabs}
          onChange={(v) => setKeys((k) => ({ ...k, elevenlabs: v }))}
          hint="TTS(나레이션 생성)에 사용"
          link="https://elevenlabs.io/app/settings/api-keys"
        />
      </div>

      <button
        onClick={handleSave}
        className="mt-8 h-9 px-5 rounded-md text-sm font-medium bg-[var(--text)] text-[#0a0a0a] hover:opacity-90 transition"
      >
        {saved ? "저장 완료 ✓" : "저장"}
      </button>
    </div>
  );
}

function KeyField({
  label,
  placeholder,
  value,
  onChange,
  hint,
  link,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  hint: string;
  link: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium">{label}</label>
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text)] transition"
        >
          키 발급 ↗
        </a>
      </div>
      <div className="flex items-center gap-2">
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 h-9 rounded-md border border-[var(--border)] bg-[var(--panel)] px-3 text-sm outline-none focus:border-[var(--border2)] transition"
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          className="h-9 px-3 rounded-md border border-[var(--border)] text-xs text-[var(--text-muted)] hover:bg-[var(--hover)] transition"
        >
          {show ? "숨기기" : "보기"}
        </button>
      </div>
      <p className="text-[11px] text-[var(--text-muted)]">{hint}</p>
    </div>
  );
}
