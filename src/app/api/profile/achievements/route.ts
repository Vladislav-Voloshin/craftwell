import { NextResponse } from "next/server";
import { requireAuth, handleApiError } from "@/lib/api/helpers";
import { daysBetween } from "@/lib/api/date-utils";

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  unlocked: boolean;
  progress?: { current: number; target: number };
}

export async function GET() {
  try {
    const { user, supabase } = await requireAuth();

    const [
      { count: protocolCount },
      { count: completionDays },
      { count: chatCount },
      { count: favoriteCount },
      { data: completions },
    ] = await Promise.all([
      supabase.from("user_protocols").select("id", { count: "exact", head: true }).eq("user_id", user.id),
      supabase.from("protocol_completions").select("completed_date", { count: "exact", head: true }).eq("user_id", user.id),
      supabase.from("chat_sessions").select("id", { count: "exact", head: true }).eq("user_id", user.id),
      supabase.from("protocol_favorites").select("id", { count: "exact", head: true }).eq("user_id", user.id),
      supabase.from("protocol_completions").select("completed_date").eq("user_id", user.id).order("completed_date", { ascending: false }),
    ]);

    const protocols = protocolCount ?? 0;
    const totalCompletions = completionDays ?? 0;
    const chats = chatCount ?? 0;
    const favorites = favoriteCount ?? 0;

    const uniqueDays = new Set((completions || []).map((c) => c.completed_date)).size;

    const sortedDays = [...new Set((completions || []).map((c) => c.completed_date))].sort().reverse();
    let bestStreak = 0;
    if (sortedDays.length > 0) {
      let run = 1;
      bestStreak = 1;
      for (let i = 1; i < sortedDays.length; i++) {
        const diff = daysBetween(sortedDays[i - 1], sortedDays[i]);
        if (diff === 1) { run++; bestStreak = Math.max(bestStreak, run); }
        else { run = 1; }
      }
    }

    const achievements: Achievement[] = [
      { id: "first-protocol", title: "Getting Started", description: "Add your first protocol", icon: "Sprout", unlocked: protocols >= 1, progress: { current: Math.min(protocols, 1), target: 1 } },
      { id: "protocol-collector", title: "Protocol Collector", description: "Add 5 protocols to your stack", icon: "Library", unlocked: protocols >= 5, progress: { current: Math.min(protocols, 5), target: 5 } },
      { id: "first-completion", title: "Day One", description: "Complete a protocol tool for the first time", icon: "CheckCircle", unlocked: totalCompletions >= 1, progress: { current: Math.min(totalCompletions, 1), target: 1 } },
      { id: "week-warrior", title: "Week Warrior", description: "Complete protocol tools on 7 different days", icon: "Calendar", unlocked: uniqueDays >= 7, progress: { current: Math.min(uniqueDays, 7), target: 7 } },
      { id: "month-master", title: "Month Master", description: "Complete protocol tools on 30 different days", icon: "Trophy", unlocked: uniqueDays >= 30, progress: { current: Math.min(uniqueDays, 30), target: 30 } },
      { id: "streak-3", title: "On a Roll", description: "Achieve a 3-day streak", icon: "Flame", unlocked: bestStreak >= 3, progress: { current: Math.min(bestStreak, 3), target: 3 } },
      { id: "streak-7", title: "Unstoppable", description: "Achieve a 7-day streak", icon: "Zap", unlocked: bestStreak >= 7, progress: { current: Math.min(bestStreak, 7), target: 7 } },
      { id: "streak-30", title: "Habit Master", description: "Achieve a 30-day streak", icon: "Gem", unlocked: bestStreak >= 30, progress: { current: Math.min(bestStreak, 30), target: 30 } },
      { id: "chat-curious", title: "Curious Mind", description: "Start your first chat session", icon: "MessageCircle", unlocked: chats >= 1, progress: { current: Math.min(chats, 1), target: 1 } },
      { id: "chat-explorer", title: "Deep Diver", description: "Start 10 chat sessions", icon: "Brain", unlocked: chats >= 10, progress: { current: Math.min(chats, 10), target: 10 } },
      { id: "first-favorite", title: "Bookworm", description: "Favorite your first protocol", icon: "Heart", unlocked: favorites >= 1, progress: { current: Math.min(favorites, 1), target: 1 } },
      { id: "completions-50", title: "Dedicated", description: "Complete 50 protocol tools total", icon: "Target", unlocked: totalCompletions >= 50, progress: { current: Math.min(totalCompletions, 50), target: 50 } },
    ];

    const unlockedCount = achievements.filter((a) => a.unlocked).length;
    return NextResponse.json({ achievements, unlocked: unlockedCount, total: achievements.length });
  } catch (err) {
    return handleApiError(err);
  }
}
