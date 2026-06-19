import {
  Moon,
  Brain,
  Dumbbell,
  Heart,
  Apple,
  Zap,
  Snowflake,
  Sun,
  Target,
  Smile,
  ClipboardList,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

/** Per-category icon + accent/background classes, keyed by protocol category slug. */
export const categoryMeta: Record<
  string,
  { icon: LucideIcon; accent: string; bg: string }
> = {
  sleep: { icon: Moon, accent: "text-indigo-500", bg: "bg-indigo-500/10" },
  focus: { icon: Brain, accent: "text-amber-500", bg: "bg-amber-500/10" },
  exercise: { icon: Dumbbell, accent: "text-emerald-500", bg: "bg-emerald-500/10" },
  stress: { icon: Heart, accent: "text-rose-500", bg: "bg-rose-500/10" },
  nutrition: { icon: Apple, accent: "text-green-500", bg: "bg-green-500/10" },
  hormones: { icon: Zap, accent: "text-yellow-500", bg: "bg-yellow-500/10" },
  "cold-heat": { icon: Snowflake, accent: "text-cyan-500", bg: "bg-cyan-500/10" },
  light: { icon: Sun, accent: "text-orange-500", bg: "bg-orange-500/10" },
  motivation: { icon: Target, accent: "text-purple-500", bg: "bg-purple-500/10" },
  "mental-health": { icon: Smile, accent: "text-pink-500", bg: "bg-pink-500/10" },
};

/** Fallback for categories without a specific icon. */
export const defaultMeta = {
  icon: ClipboardList,
  accent: "text-muted-foreground",
  bg: "bg-muted",
};
