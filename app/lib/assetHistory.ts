export type AssetKind = "image" | "video" | "audio";

export type AssetHistoryItem = {
  id: string;
  kind: AssetKind;
  url: string;
  prompt?: string;
  model?: string;
  ratio?: string;
  projectName?: string;
  sceneNumber?: number;
  createdAt: number;
};

const STORAGE_KEY = "mint-asset-history";
const MAX_ITEMS = 500;

function safeRead(): AssetHistoryItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function safeWrite(items: AssetHistoryItem[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // storage full → drop oldest half and retry
    try {
      const trimmed = items.slice(0, Math.floor(items.length / 2));
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    } catch {
      // give up silently
    }
  }
}

export function listHistory(): AssetHistoryItem[] {
  return safeRead().sort((a, b) => b.createdAt - a.createdAt);
}

export function addHistory(
  entry: Omit<AssetHistoryItem, "createdAt"> & { createdAt?: number },
): AssetHistoryItem[] {
  const item: AssetHistoryItem = { createdAt: Date.now(), ...entry };
  const next = [item, ...safeRead().filter((x) => x.id !== item.id)].slice(
    0,
    MAX_ITEMS,
  );
  safeWrite(next);
  return next;
}

export function removeHistory(id: string): AssetHistoryItem[] {
  const next = safeRead().filter((x) => x.id !== id);
  safeWrite(next);
  return next;
}

export function clearHistory(): AssetHistoryItem[] {
  safeWrite([]);
  return [];
}
