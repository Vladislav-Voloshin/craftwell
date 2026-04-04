import { NextRequest, NextResponse } from "next/server";
import { requireAuth, apiError, handleApiError, parseBody } from "@/lib/api/helpers";
import { getRequestId } from "@/lib/api/request-id";
import { getLocalDate, daysBetween } from "@/lib/api/date-utils";
import { completionSchema } from "@/lib/api/schemas";

/** Get today's date in the user's local timezone using tz_offset query param. */
function getLocalToday(request: NextRequest): string {
  const offsetStr = new URL(request.url).searchParams.get("tz_offset");
  const offsetMinutes = offsetStr ? parseInt(offsetStr, 10) : 0;
  return getLocalDate(offsetMinutes);
}

export async function GET(request: NextRequest) {
  const requestId = getRequestId(request);
  try {
    const { user, supabase } = await requireAuth();

    const { searchParams } = new URL(request.url);
    const protocolId = searchParams.get("protocol_id");
    const type = searchParams.get("type"); // "today" | "streaks"

    if (!protocolId) {
      return apiError("protocol_id required", 400);
    }

    if (type === "streaks") {
      return getStreaks(user.id, protocolId, supabase, request);
    }

    // Default: get today's completions (using user's local date)
    const today = getLocalToday(request);

    const parsedLimit = parseInt(searchParams.get("limit") || "100", 10);
    const parsedOffset = parseInt(searchParams.get("offset") || "0", 10);
    const limit = Math.min(Math.max(1, Number.isNaN(parsedLimit) ? 100 : parsedLimit), 500);
    const offset = Math.max(0, Number.isNaN(parsedOffset) ? 0 : parsedOffset);

    const { data: completions, count } = await supabase
      .from("protocol_completions")
      .select("tool_id", { count: "exact" })
      .eq("user_id", user.id)
      .eq("protocol_id", protocolId)
      .eq("completed_date", today)
      .range(offset, offset + limit - 1);

    const totalCount = count ?? 0;

    return NextResponse.json({
      completed_tool_ids: (completions || []).map((c) => c.tool_id),
      date: today,
      hasMore: offset + limit < totalCount,
    });
  } catch (err) {
    return handleApiError(err, requestId);
  }
}

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request);
  try {
    const { user, supabase } = await requireAuth();

    const body = await parseBody(request, completionSchema);
    if (body instanceof Response) return body;

    const { protocol_id, tool_id, tz_offset } = body;

    // Use client-provided timezone offset for local date
    const today = getLocalDate(tz_offset ?? 0);

    // Check if already completed today
    const { data: existing } = await supabase
      .from("protocol_completions")
      .select("id")
      .eq("user_id", user.id)
      .eq("protocol_id", protocol_id)
      .eq("tool_id", tool_id)
      .eq("completed_date", today)
      .maybeSingle();

    if (existing) {
      // Uncomplete (toggle off)
      await supabase.from("protocol_completions").delete().eq("id", existing.id);
      return NextResponse.json({ status: "uncompleted" });
    }

    // Complete (toggle on)
    const { error } = await supabase.from("protocol_completions").insert({
      user_id: user.id,
      protocol_id,
      tool_id,
      completed_date: today,
    });

    if (error) {
      return apiError(error.message, 500);
    }

    return NextResponse.json({ status: "completed" });
  } catch (err) {
    return handleApiError(err, requestId);
  }
}

/** Calculate streak data for a protocol. */
async function getStreaks(
  userId: string,
  protocolId: string,
  supabase: import("@supabase/supabase-js").SupabaseClient,
  request: NextRequest
) {
  const { count: totalTools } = await supabase
    .from("protocol_tools")
    .select("id", { count: "exact", head: true })
    .eq("protocol_id", protocolId);

  const toolCount = totalTools ?? 0;

  const { data: completions } = await supabase
    .from("protocol_completions")
    .select("completed_date")
    .eq("user_id", userId)
    .eq("protocol_id", protocolId)
    .order("completed_date", { ascending: false });

  if (!completions || completions.length === 0 || toolCount === 0) {
    return NextResponse.json({ streak: 0, longest_streak: 0, total_days: 0 });
  }

  // Count completions per date
  const dateCounts = new Map<string, number>();
  for (const c of completions) {
    dateCounts.set(c.completed_date, (dateCounts.get(c.completed_date) || 0) + 1);
  }

  // Get fully completed dates (all tools done)
  const fullDates = [...dateCounts.entries()]
    .filter(([, count]) => count >= toolCount)
    .map(([date]) => date)
    .sort()
    .reverse();

  if (fullDates.length === 0) {
    return NextResponse.json({ streak: 0, longest_streak: 0, total_days: 0 });
  }

  // Calculate current streak (using user's local date)
  let streak = 0;
  const today = getLocalToday(request);
  const yesterdayDate = new Date(today + "T12:00:00Z");
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = yesterdayDate.toISOString().split("T")[0];

  if (fullDates[0] === today || fullDates[0] === yesterday) {
    streak = 1;
    for (let i = 1; i < fullDates.length; i++) {
      const diffDays = daysBetween(fullDates[i - 1], fullDates[i]);
      if (diffDays === 1) {
        streak++;
      } else {
        break;
      }
    }
  }

  // Calculate longest streak
  let longestStreak = 1;
  let currentRun = 1;
  for (let i = 1; i < fullDates.length; i++) {
    const diffDays = daysBetween(fullDates[i - 1], fullDates[i]);
    if (diffDays === 1) {
      currentRun++;
      longestStreak = Math.max(longestStreak, currentRun);
    } else {
      currentRun = 1;
    }
  }

  return NextResponse.json({
    streak,
    longest_streak: longestStreak,
    total_days: fullDates.length,
  });
}
