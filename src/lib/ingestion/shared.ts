import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdminEnv } from "@/lib/env";

export function getSupabaseAdmin(): SupabaseClient {
  const env = supabaseAdminEnv();
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
}

export function cleanHtml(text: string): string {
  return text
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export const TOPIC_KEYWORDS = [
  "sleep",
  "circadian",
  "melatonin",
  "adenosine",
  "dopamine",
  "serotonin",
  "norepinephrine",
  "acetylcholine",
  "cortisol",
  "testosterone",
  "estrogen",
  "growth hormone",
  "exercise",
  "resistance training",
  "cardio",
  "HIIT",
  "recovery",
  "nutrition",
  "fasting",
  "glucose",
  "insulin",
  "ketosis",
  "supplements",
  "creatine",
  "omega-3",
  "vitamin D",
  "magnesium",
  "cold exposure",
  "heat exposure",
  "sauna",
  "ice bath",
  "breathing",
  "meditation",
  "mindfulness",
  "stress",
  "focus",
  "attention",
  "ADHD",
  "neuroplasticity",
  "light exposure",
  "sunlight",
  "blue light",
  "motivation",
  "habits",
  "goal setting",
  "longevity",
  "aging",
  "telomeres",
  "gut health",
  "microbiome",
  "probiotics",
  "mental health",
  "anxiety",
  "depression",
] as const;

export function extractTopics(title: string, content: string): string[] {
  const combined = `${title} ${content}`.toLowerCase();
  return TOPIC_KEYWORDS.filter((keyword) => combined.includes(keyword.toLowerCase()));
}
