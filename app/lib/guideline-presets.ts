import {
  GUIDELINE_SEEDS,
  DEFAULT_GLOBAL_BASE,
} from "./_guideline-seeds-source.js";
import type { Guideline } from "./guidelines";

type Seed = {
  id: string;
  title: string;
  emoji?: string;
  category?: string;
  description?: string;
  version?: string;
  content: string;
};

const seeds = GUIDELINE_SEEDS as Seed[];

const formatName = (s: Seed) => {
  const parts = [s.emoji, s.title].filter(Boolean);
  return parts.join(" ").trim();
};

const now = () => Date.now();

export const GLOBAL_BASE_PRESET: Guideline = {
  id: "preset_global_base",
  name: "🌐 글로벌 베이스 지침 (모든 채널 공통)",
  content: DEFAULT_GLOBAL_BASE,
  updatedAt: now(),
};

export const PRESETS: Guideline[] = [
  GLOBAL_BASE_PRESET,
  ...seeds.map((s) => ({
    id: s.id,
    name: formatName(s),
    content: s.content,
    updatedAt: now(),
  })),
];
