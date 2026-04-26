export type Guideline = {
  id: string;
  name: string;
  content: string;
  updatedAt: number;
};

const STORAGE_KEY = "mint-guidelines-v1";

export const CUSTOM_ID = "__custom__";

function isGuideline(v: unknown): v is Guideline {
  if (!v || typeof v !== "object") return false;
  const g = v as Record<string, unknown>;
  return (
    typeof g.id === "string" &&
    typeof g.name === "string" &&
    typeof g.content === "string" &&
    typeof g.updatedAt === "number"
  );
}

export function loadGuidelines(): Guideline[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isGuideline).sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

export function saveGuidelines(list: Guideline[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export function upsertGuideline(g: Guideline): Guideline[] {
  const list = loadGuidelines();
  const idx = list.findIndex((x) => x.id === g.id);
  const next = idx >= 0 ? list.map((x) => (x.id === g.id ? g : x)) : [g, ...list];
  saveGuidelines(next);
  return next;
}

export function deleteGuideline(id: string): Guideline[] {
  const next = loadGuidelines().filter((g) => g.id !== id);
  saveGuidelines(next);
  return next;
}

export function newGuideline(name = "", content = ""): Guideline {
  return {
    id: crypto.randomUUID(),
    name,
    content,
    updatedAt: Date.now(),
  };
}
