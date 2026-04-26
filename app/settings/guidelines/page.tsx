"use client";

import { useEffect, useState } from "react";
import {
  Guideline,
  deleteGuideline,
  loadGuidelines,
  newGuideline,
  saveGuidelines,
  upsertGuideline,
} from "../../lib/guidelines";
import { PRESETS } from "../../lib/guideline-presets";

export default function GuidelinesSettingsPage() {
  const [list, setList] = useState<Guideline[]>([]);
  const [editing, setEditing] = useState<Guideline | null>(null);

  useEffect(() => {
    setList(loadGuidelines());
  }, []);

  const startNew = () => setEditing(newGuideline());
  const startEdit = (g: Guideline) => setEditing({ ...g });
  const cancel = () => setEditing(null);

  const save = () => {
    if (!editing) return;
    const name = editing.name.trim();
    const content = editing.content.trim();
    if (!name || !content) return;
    const next = upsertGuideline({
      ...editing,
      name,
      content,
      updatedAt: Date.now(),
    });
    setList(next);
    setEditing(null);
  };

  const remove = (id: string) => {
    if (!window.confirm("이 지침을 삭제할까요?")) return;
    setList(deleteGuideline(id));
    if (editing?.id === id) setEditing(null);
  };

  const importPresets = () => {
    const current = loadGuidelines();
    const existingIds = new Set(current.map((g) => g.id));
    const toAdd = PRESETS.filter((p) => !existingIds.has(p.id));
    if (toAdd.length === 0) {
      window.alert("모든 프리셋 지침이 이미 저장되어 있습니다.");
      return;
    }
    const ok = window.confirm(
      `프리셋 지침 ${toAdd.length}개를 저장합니다.\n(기존 지침은 유지됩니다)`,
    );
    if (!ok) return;
    const merged = [...toAdd, ...current];
    saveGuidelines(merged);
    setList(merged);
  };

  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center justify-between px-6 h-14 border-b border-[var(--border)]">
        <span className="text-sm font-medium">대본 지침 관리</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={importPresets}
            className="h-8 px-3 rounded-md text-sm hover:bg-[var(--hover)] text-[var(--text)] border border-[var(--border)]"
          >
            📥 프리셋 불러오기
          </button>
          <button
            type="button"
            onClick={startNew}
            className="h-8 px-3 rounded-md text-sm font-medium bg-white text-black"
          >
            + 새 지침
          </button>
        </div>
      </header>

      <div className="flex-1 scroll-y">
        <div className="max-w-3xl mx-auto w-full px-6 py-8 flex flex-col gap-4">
          {editing && (
            <section className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-5 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">
                  {list.some((g) => g.id === editing.id) ? "지침 수정" : "새 지침"}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={cancel}
                    className="h-8 px-3 rounded-md text-sm hover:bg-[var(--hover)] text-[var(--text-muted)]"
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    onClick={save}
                    disabled={!editing.name.trim() || !editing.content.trim()}
                    className="h-8 px-3 rounded-md text-sm font-medium bg-white text-black disabled:opacity-30"
                  >
                    저장
                  </button>
                </div>
              </div>
              <input
                value={editing.name}
                onChange={(e) =>
                  setEditing({ ...editing, name: e.target.value })
                }
                placeholder="이름 (예: 유튜브 숏츠 기본)"
                className="h-10 rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3 text-sm outline-none focus:border-[var(--text)]"
              />
              <textarea
                value={editing.content}
                onChange={(e) =>
                  setEditing({ ...editing, content: e.target.value })
                }
                rows={10}
                placeholder={`지침 본문\n예)\n- 훅은 의문형으로\n- 한 문장 15자 이내\n- 외래어 최소화`}
                className="resize-y rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-sm leading-6 outline-none focus:border-[var(--text)] font-mono"
              />
            </section>
          )}

          {list.length === 0 && !editing && (
            <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--panel)] px-6 py-12 text-center">
              <div className="text-sm font-medium">저장된 지침이 없습니다</div>
              <div className="mt-1 text-xs text-[var(--text-muted)]">
                자주 쓰는 대본 규칙을 지침으로 저장해두면 대본 생성에서 바로
                불러올 수 있어요.
              </div>
              <button
                type="button"
                onClick={startNew}
                className="mt-4 h-9 px-4 rounded-md text-sm font-medium bg-white text-black"
              >
                + 첫 지침 만들기
              </button>
            </div>
          )}

          {list.map((g) => (
            <article
              key={g.id}
              className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-5 flex flex-col gap-2"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{g.name}</div>
                  <div className="text-[11px] text-[var(--text-muted)]">
                    {new Date(g.updatedAt).toLocaleString("ko-KR")}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => startEdit(g)}
                    className="h-8 px-3 rounded-md text-xs hover:bg-[var(--hover)]"
                  >
                    편집
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(g.id)}
                    className="h-8 px-3 rounded-md text-xs hover:bg-[var(--hover)] text-[var(--text-muted)]"
                  >
                    삭제
                  </button>
                </div>
              </div>
              <pre className="whitespace-pre-wrap text-xs leading-5 text-[var(--text-muted)] font-mono">
                {g.content}
              </pre>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
