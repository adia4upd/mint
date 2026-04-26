export type BookmarkCategory = "ai" | "edit" | "sns" | "research" | "etc";

export type Bookmark = {
  id: string;
  label: string;
  url: string;
  letter: string;
  color: string;
  category: BookmarkCategory;
};

export const CATEGORY_ORDER: { id: BookmarkCategory; name: string }[] = [
  { id: "ai", name: "AI" },
  { id: "edit", name: "편집" },
  { id: "sns", name: "SNS" },
  { id: "research", name: "리서치" },
  { id: "etc", name: "기타" },
];

export const SEED_BOOKMARKS: Bookmark[] = [
  { id: "bm-claude",    label: "Claude",       url: "https://claude.ai",             letter: "C", color: "#d97706", category: "ai" },
  { id: "bm-chatgpt",   label: "ChatGPT",      url: "https://chatgpt.com",           letter: "G", color: "#059669", category: "ai" },
  { id: "bm-gemini",    label: "Gemini",       url: "https://gemini.google.com",     letter: "G", color: "#2563eb", category: "ai" },
  { id: "bm-genspark",  label: "Genspark",     url: "https://www.genspark.ai",       letter: "S", color: "#0891b2", category: "ai" },
  { id: "bm-vmake",     label: "Vmake",        url: "https://vmake.ai/workspace",    letter: "V", color: "#9333ea", category: "ai" },
  { id: "bm-capcut",    label: "CapCut",       url: "https://www.capcut.com/ko-kr",  letter: "C", color: "#52525b", category: "edit" },
  { id: "bm-vrew",      label: "브루",         url: "https://vrew.voyagerx.com",     letter: "B", color: "#7c3aed", category: "edit" },
  { id: "bm-timecast",  label: "타임캐스트",   url: "https://timecast.kr",           letter: "T", color: "#e11d48", category: "edit" },
  { id: "bm-youtube",   label: "유튜브",       url: "https://youtube.com",           letter: "Y", color: "#dc2626", category: "sns" },
  { id: "bm-instagram", label: "인스타",       url: "https://instagram.com",         letter: "I", color: "#db2777", category: "sns" },
  { id: "bm-tiktok",    label: "틱톡",         url: "https://www.tiktok.com",        letter: "T", color: "#0284c7", category: "sns" },
  { id: "bm-daangn",    label: "당근마켓",     url: "https://www.daangn.com",        letter: "D", color: "#ea580c", category: "sns" },
  { id: "bm-playboard", label: "플레이보드",   url: "https://playboard.co/ko",       letter: "P", color: "#4f46e5", category: "research" },
  { id: "bm-itemscout", label: "아이템스카우트", url: "https://itemscout.io",        letter: "I", color: "#0d9488", category: "research" },
  { id: "bm-datalab",   label: "데이터랩",     url: "https://datalab.naver.com",     letter: "D", color: "#16a34a", category: "research" },
];

export const COLOR_PALETTE = [
  "#d97706", "#059669", "#2563eb", "#0891b2", "#9333ea",
  "#dc2626", "#db2777", "#0284c7", "#4f46e5", "#16a34a",
  "#52525b", "#7c3aed", "#e11d48", "#ea580c", "#0d9488",
];

const STORAGE_KEY = "mint-bookmarks-v2";
const SEED_APPLIED_KEY = "mint-bookmarks-v2-seeded";

function isBrowser() {
  return typeof window !== "undefined";
}

function isValidCategory(v: unknown): v is BookmarkCategory {
  return (
    v === "ai" ||
    v === "edit" ||
    v === "sns" ||
    v === "research" ||
    v === "etc"
  );
}

function isValidBookmark(v: unknown): v is Bookmark {
  if (!v || typeof v !== "object") return false;
  const b = v as Bookmark;
  return (
    typeof b.id === "string" &&
    typeof b.label === "string" &&
    typeof b.url === "string" &&
    typeof b.letter === "string" &&
    typeof b.color === "string" &&
    isValidCategory(b.category)
  );
}

export function loadBookmarks(): Bookmark[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      if (!window.localStorage.getItem(SEED_APPLIED_KEY)) {
        saveBookmarks(SEED_BOOKMARKS);
        window.localStorage.setItem(SEED_APPLIED_KEY, "1");
        return SEED_BOOKMARKS;
      }
      return [];
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidBookmark).slice(0, 60);
  } catch {
    return [];
  }
}

export function saveBookmarks(list: Bookmark[]): void {
  if (!isBrowser()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export function addBookmark(
  input: Omit<Bookmark, "id"> & { id?: string },
): Bookmark[] {
  const list = loadBookmarks();
  const next: Bookmark[] = [
    ...list,
    {
      id: input.id ?? `bm-${Date.now()}`,
      label: input.label,
      url: input.url,
      letter: (input.letter || input.label.charAt(0) || "?").toUpperCase(),
      color:
        input.color || COLOR_PALETTE[list.length % COLOR_PALETTE.length],
      category: input.category,
    },
  ];
  saveBookmarks(next);
  return next;
}

export function removeBookmark(id: string): Bookmark[] {
  const next = loadBookmarks().filter((b) => b.id !== id);
  saveBookmarks(next);
  return next;
}

export function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  try {
    const u = new URL(withScheme);
    return u.toString();
  } catch {
    return null;
  }
}
