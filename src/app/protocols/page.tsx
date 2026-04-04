import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/app-shell";
import { ProtocolList } from "@/components/protocols/protocol-list";
import { StreakSummary } from "@/components/protocols/streak-summary";

export const metadata: Metadata = {
  title: "Protocols — Craftwell",
  description: "Browse science-based health protocols ranked by effectiveness. Sleep, focus, exercise, stress, and more.",
};

// Maps survey focus_areas values → protocol category slugs
const focusAreaToCategory: Record<string, string> = {
  "Sleep": "sleep",
  "Focus & Productivity": "focus",
  "Exercise & Recovery": "exercise",
  "Stress & Anxiety": "stress",
  "Nutrition": "nutrition",
  "Hormones": "hormones",
  "Cold/Heat Exposure": "cold-heat",
  "Light Optimization": "light",
  "Motivation & Dopamine": "motivation",
  "Mental Health": "mental-health",
};

// Maps health_goals → related category slugs (primary + secondary)
const healthGoalToCategories: Record<string, string[]> = {
  "Better Sleep": ["sleep", "stress", "light"],
  "More Energy": ["motivation", "focus", "sleep", "nutrition"],
  "Reduce Stress": ["stress", "exercise", "sleep", "cold-heat"],
  "Build Muscle": ["exercise", "nutrition", "hormones"],
  "Lose Weight": ["nutrition", "exercise", "hormones"],
  "Improve Focus": ["focus", "motivation", "nutrition", "light"],
  "Better Mood": ["mental-health", "motivation", "stress", "exercise"],
  "Longevity": ["hormones", "nutrition", "exercise", "stress"],
};

export default async function ProtocolsPage() {
  const supabase = await createClient();

  const [{ data: categories }, { data: protocols }, { data: { user } }] = await Promise.all([
    supabase.from("protocol_categories").select("*").order("sort_order"),
    supabase.from("protocols").select("*").order("effectiveness_rank"),
    supabase.auth.getUser(),
  ]);

  // Fetch survey data + favorites for personalization (if logged in)
  let userFocusCategories: string[] = [];
  let favoriteIds: string[] = [];
  if (user) {
    const { data: favorites } = await supabase
      .from("protocol_favorites")
      .select("protocol_id")
      .eq("user_id", user.id);
    favoriteIds = (favorites || []).map((f) => f.protocol_id);

    const { data: survey } = await supabase
      .from("survey_responses")
      .select("focus_areas, health_goals")
      .eq("user_id", user.id)
      .maybeSingle();

    if (survey) {
      // Primary: direct focus area → category mapping
      const focusCats = new Set<string>();
      if (survey.focus_areas) {
        for (const area of survey.focus_areas) {
          const cat = focusAreaToCategory[area];
          if (cat) focusCats.add(cat);
        }
      }
      // Secondary: health goals → category mapping
      if (survey.health_goals) {
        for (const goal of survey.health_goals) {
          const cats = healthGoalToCategories[goal];
          if (cats) {
            for (const cat of cats) focusCats.add(cat);
          }
        }
      }
      userFocusCategories = Array.from(focusCats);
    }
  }

  // Sort: user's focus categories first, then by effectiveness_rank
  const sortedProtocols = [...(protocols || [])].sort((a, b) => {
    const aMatch = userFocusCategories.includes(a.category) ? 0 : 1;
    const bMatch = userFocusCategories.includes(b.category) ? 0 : 1;
    if (aMatch !== bMatch) return aMatch - bMatch;
    return (a.effectiveness_rank || 999) - (b.effectiveness_rank || 999);
  });

  // Top 5 protocols from the user's focus categories for the Recommended strip
  const recommendedProtocols = userFocusCategories.length > 0
    ? sortedProtocols
        .filter((p) => userFocusCategories.includes(p.category))
        .slice(0, 5)
    : [];

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Protocols</h1>
          <p className="text-muted-foreground">
            {userFocusCategories.length > 0
              ? "Personalized for your health goals"
              : "Evidence-based tools ranked by effectiveness"}
          </p>
        </div>
        {!!user && <StreakSummary />}
        <ProtocolList
          categories={categories || []}
          protocols={sortedProtocols}
          favoriteIds={favoriteIds}
          isLoggedIn={!!user}
          recommendedProtocols={recommendedProtocols}
        />
      </div>
    </AppShell>
  );
}
