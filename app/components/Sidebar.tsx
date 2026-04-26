"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Bookmark,
  BookmarkCategory,
  CATEGORY_ORDER,
  COLOR_PALETTE,
  addBookmark,
  loadBookmarks,
  normalizeUrl,
  removeBookmark,
} from "../lib/bookmarks";

type NavItem = {
  href: string;
  label: string;
  icon: string;
};

const TOP_ITEM: NavItem = {
  href: "/chat",
  label: "AI 채팅",
  icon: "💬",
};

const TOOL_ITEMS: NavItem[] = [
  { href: "/script", label: "대본 생성", icon: "📝" },
  { href: "/rebuild", label: "해외영상 리빌드", icon: "🌐" },
  { href: "/trend", label: "트렌드 조사", icon: "📊" },
  { href: "/studio", label: "AI 스토리보드", icon: "🎬" },
  { href: "/storyboard-editor", label: "스토리보드 에디터", icon: "🎞️" },
  { href: "/playlist", label: "플레이리스트", icon: "🎵" },
  { href: "/cards", label: "카드뉴스", icon: "🃏" },
  { href: "https://dodo-tube-factory.vercel.app/create", label: "튜브 팩토리", icon: "🏭" },
  { href: "https://claude.com/plugins", label: "클로드 플러그인", icon: "🧩" },
];

const FOOTER_ITEMS: NavItem[] = [
  { href: "/settings/guidelines", label: "대본 지침 관리", icon: "📋" },
  { href: "/settings/api-keys", label: "API 키 설정", icon: "🔑" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  const isActive = (href: string) =>
    pathname === href || pathname?.startsWith(href + "/");

  return (
    <aside
      className={`panel flex flex-col shrink-0 transition-[width] duration-200 ${
        collapsed ? "w-16" : "w-64"
      }`}
    >
      <div className="flex items-center justify-between px-4 h-14 border-b border-[var(--border)]">
        {!collapsed && (
          <span className="font-semibold tracking-tight text-[15px]">
            mint
          </span>
        )}
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          aria-label="사이드바 토글"
          className="w-8 h-8 grid place-items-center rounded-md hover:bg-[var(--hover)] text-[var(--text-muted)]"
        >
          {collapsed ? "›" : "‹"}
        </button>
      </div>

      <nav className="flex-1 scroll-y px-2 py-3 flex flex-col gap-1">
        <NavLink item={TOP_ITEM} active={isActive(TOP_ITEM.href)} collapsed={collapsed} />

        <div className="mt-4 mb-1 px-3 text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
          {!collapsed && "도구"}
        </div>
        {TOOL_ITEMS.map((item) => (
          <NavLink
            key={item.href}
            item={item}
            active={isActive(item.href)}
            collapsed={collapsed}
          />
        ))}

        <ExternalBookmarks collapsed={collapsed} />

        <div className="mt-4 mb-1 px-3 text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
          {!collapsed && "최근 작업"}
        </div>
        {!collapsed && (
          <div className="px-3 py-2 text-sm text-[var(--text-muted)]">
            아직 없음
          </div>
        )}
      </nav>

      <div className="border-t border-[var(--border)] px-2 py-2 flex flex-col gap-1">
        {FOOTER_ITEMS.map((item) => (
          <NavLink
            key={item.href}
            item={item}
            active={isActive(item.href)}
            collapsed={collapsed}
          />
        ))}
      </div>
    </aside>
  );
}

function NavLink({
  item,
  active,
  collapsed,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
}) {
  const isExternal = /^https?:\/\//i.test(item.href);
  const className = `group flex items-center gap-3 px-3 h-9 rounded-md text-sm transition-colors ${
    active
      ? "bg-[var(--active)] text-[var(--text)] font-medium"
      : "text-[var(--text)] hover:bg-[var(--hover)]"
  }`;
  const content = (
    <>
      <span className="text-base w-5 text-center">{item.icon}</span>
      {!collapsed && <span className="truncate flex-1">{item.label}</span>}
      {!collapsed && isExternal && (
        <span className="text-[10px] text-[var(--text-muted)] opacity-50">↗</span>
      )}
    </>
  );

  if (isExternal) {
    return (
      <a
        href={item.href}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
        title={collapsed ? item.label : undefined}
      >
        {content}
      </a>
    );
  }

  return (
    <Link
      href={item.href}
      className={className}
      title={collapsed ? item.label : undefined}
    >
      {content}
    </Link>
  );
}

const OPEN_KEY = "mint-bookmarks-open-cats";

function loadOpenCats(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(OPEN_KEY);
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

function ExternalBookmarks({ collapsed }: { collapsed: boolean }) {
  const [list, setList] = useState<Bookmark[]>([]);
  const [openCats, setOpenCats] = useState<Record<string, boolean>>({});
  const [addingIn, setAddingIn] = useState<BookmarkCategory | null>(null);
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setList(loadBookmarks());
    setOpenCats(loadOpenCats());
  }, []);

  const toggleCat = (id: BookmarkCategory) => {
    setOpenCats((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      if (typeof window !== "undefined") {
        window.localStorage.setItem(OPEN_KEY, JSON.stringify(next));
      }
      return next;
    });
  };

  const startAdd = (cat: BookmarkCategory) => {
    setAddingIn(cat);
    setLabel("");
    setUrl("");
    setError(null);
    if (!openCats[cat]) toggleCat(cat);
  };

  const cancelAdd = () => {
    setAddingIn(null);
    setLabel("");
    setUrl("");
    setError(null);
  };

  const submit = () => {
    if (!addingIn) return;
    if (!label.trim()) {
      setError("이름을 입력하세요.");
      return;
    }
    const normalized = normalizeUrl(url);
    if (!normalized) {
      setError("URL이 올바르지 않아요.");
      return;
    }
    const letter = label.trim().charAt(0).toUpperCase();
    const color = COLOR_PALETTE[list.length % COLOR_PALETTE.length];
    const next = addBookmark({
      label: label.trim(),
      url: normalized,
      letter,
      color,
      category: addingIn,
    });
    setList(next);
    cancelAdd();
  };

  const remove = (id: string) => {
    setList(removeBookmark(id));
  };

  return (
    <>
      <div className="mt-4 mb-1 px-3 text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
        {!collapsed && "외부 도구"}
      </div>

      {CATEGORY_ORDER.map((cat) => {
        const items = list.filter((b) => b.category === cat.id);
        if (cat.id === "etc" && items.length === 0 && addingIn !== "etc")
          return null;
        const isOpen = !!openCats[cat.id];

        if (collapsed) {
          return items.map((b) => (
            <CollapsedLink key={b.id} bookmark={b} />
          ));
        }

        return (
          <div key={cat.id} className="flex flex-col">
            <div className="group flex items-center px-2 h-7 rounded-md hover:bg-[var(--hover)]">
              <button
                type="button"
                onClick={() => toggleCat(cat.id)}
                className="flex-1 flex items-center gap-2 text-left text-xs text-[var(--text)]"
              >
                <span
                  className={`inline-block w-3 text-[var(--text-muted)] transition-transform ${
                    isOpen ? "rotate-90" : ""
                  }`}
                >
                  ▸
                </span>
                <span className="font-medium">{cat.name}</span>
                <span className="text-[10px] text-[var(--text-muted)]">
                  {items.length}
                </span>
              </button>
              <button
                type="button"
                onClick={() => startAdd(cat.id)}
                aria-label={`${cat.name}에 추가`}
                className="w-5 h-5 grid place-items-center rounded text-[var(--text-muted)] opacity-0 group-hover:opacity-100 hover:bg-[var(--active)] hover:text-[var(--text)] text-xs"
              >
                +
              </button>
            </div>

            {isOpen && (
              <div className="flex flex-col">
                {items.map((b) => (
                  <ExternalLink
                    key={b.id}
                    bookmark={b}
                    onRemove={() => remove(b.id)}
                  />
                ))}
                {items.length === 0 && addingIn !== cat.id && (
                  <div className="px-6 py-1 text-[10px] text-[var(--text-muted)]">
                    비어 있음
                  </div>
                )}
              </div>
            )}

            {addingIn === cat.id && (
              <div className="mx-2 mt-1 mb-2 p-2 rounded-md border border-[var(--border)] bg-[var(--hover)] flex flex-col gap-1.5">
                <input
                  autoFocus
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="이름"
                  className="h-7 rounded border border-[var(--border)] bg-[var(--panel)] px-2 text-xs outline-none focus:border-[var(--text)]"
                />
                <input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="chatgpt.com"
                  className="h-7 rounded border border-[var(--border)] bg-[var(--panel)] px-2 text-xs outline-none focus:border-[var(--text)]"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submit();
                    if (e.key === "Escape") cancelAdd();
                  }}
                />
                {error && (
                  <div className="text-[10px] text-red-600">{error}</div>
                )}
                <div className="flex items-center justify-end gap-1">
                  <button
                    type="button"
                    onClick={cancelAdd}
                    className="h-6 px-2 text-[11px] rounded text-[var(--text-muted)] hover:bg-[var(--active)]"
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    onClick={submit}
                    className="h-6 px-2 text-[11px] rounded font-medium bg-white text-black"
                  >
                    추가
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

function ExternalLink({
  bookmark,
  onRemove,
}: {
  bookmark: Bookmark;
  onRemove: () => void;
}) {
  return (
    <div className="group relative">
      <a
        href={bookmark.url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 pl-6 pr-3 h-8 rounded-md text-[13px] text-[var(--text)] hover:bg-[var(--hover)]"
        title={bookmark.url}
      >
        <span
          className="w-4 h-4 rounded-[3px] grid place-items-center text-[9px] font-extrabold text-white shrink-0"
          style={{ background: bookmark.color }}
        >
          {bookmark.letter}
        </span>
        <span className="truncate flex-1">{bookmark.label}</span>
        <span className="text-[10px] text-[var(--text-muted)] opacity-40">
          ↗
        </span>
      </a>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onRemove();
        }}
        aria-label={`${bookmark.label} 삭제`}
        className="absolute right-1 top-1/2 -translate-y-1/2 w-5 h-5 rounded hidden group-hover:grid place-items-center bg-[var(--panel)] border border-[var(--border)] text-[var(--text-muted)] hover:text-red-500 text-[10px]"
      >
        ✕
      </button>
    </div>
  );
}

function CollapsedLink({ bookmark }: { bookmark: Bookmark }) {
  return (
    <a
      href={bookmark.url}
      target="_blank"
      rel="noopener noreferrer"
      title={bookmark.label}
      className="flex items-center justify-center h-9 rounded-md hover:bg-[var(--hover)]"
    >
      <span
        className="w-5 h-5 rounded-[3px] grid place-items-center text-[10px] font-extrabold text-white"
        style={{ background: bookmark.color }}
      >
        {bookmark.letter}
      </span>
    </a>
  );
}
