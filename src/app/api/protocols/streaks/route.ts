import { NextRequest, NextResponse } from "next/server";
import { requireAuth, handleApiError } from "@/lib/api/helpers";
import { getRequestId } from "@/lib/api/request-id";

/** Compute days between two YYYY-MM-DD strings. */
function daysBetween(a: string, b: string): number {
  const msA = Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10));
  const msB = Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10));
  return Math.round((msA - msB) / 86400000);
}

function getLocalToday(request: NextRequest): string {
  const offsetStr = new URL(request.url).searchParams.get("tz_offset");
  const offsetMinutes = offsetStr ? parseInt(offsetStr, 10) : 0;
  const now = new Date();
  const local = new Date(now.getTime() - offsetMinutes * 60000);
  return local.toISOString().split("T")[0];
}

export async function GET(request: NextRequest) {
  const requestId = getRequestId(request);
  try {
    const { user, supabase } = await requireAuth();

    // Get active protocols with tool counts
    const { data: activeProtocols } = await supabase
      .from("user_protocols")
      .select("protocol_id, protocols(id, title, slug)")
      .eq("user_id", user.id)
      .eq("is_active", true);

    if (!activeProtocols || activeProtocols.length === 0) {
      return NextResponse.json({ protocols: [], best_current: 0, best_longest: 0 });
    }

    const protocolIds = activeProtocols.map((p) => p.protocol_id);

    // Get tool counts
    const { data: tools } = await supabase
      .from("protocol_tools")
      .select("protocol_id")
      .in("protocol_id", protocolIds);

    const toolCountMap = new Map<string, number>();
    for (const t of tools || []) {
      toolCountMap.set(t.protocol_id, (toolCountMap.get(t.protocol_id) || 0) + 1);
    }

    // Get completions for the last 90 days — unbounded queries grow with user history
    // and were a top contributor to Supabase Disk IO budget depletion.
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - 90);
    const sinceDate = since.toISOString().split("T")[0];

    const { data: completions } = await supabase
      .from("protocol_completions")
      .select("protocol_id, completed_date")
      .eq("user_id", user.id)
      .in("protocol_id", protocolIds)
      .gte("completed_date", sinceDate)
      .order("completed_date", { ascending: false });

    const today = getLocalToday(request);
    const yesterdayDate = new Date(today + "T12:00:00Z");
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterday = yesterdayDate.toISOString().split("T")[0];

    // Group completions by protocol → date → count
    const byProtocol = new Map<string, Map<string, number>>();
    for (const c of completions || []) {
      if (!byProtocol.has(c.protocol_id)) byProtocol.set(c.protocol_id, new Map());
      const m = byProtocol.get(c.protocol_id)!;
      m.set(c.completed_date, (m.get(c.completed_date) || 0) + 1);
    }

    let bestCurrent = 0;
    let bestLongest = 0;

    const protocolStreaks = activeProtocols.map((up) => {
      const protocol = up.protocols as unknown as { id: string; title: string; slug: string };
      const toolCount = toolCountMap.get(up.protocol_id) || 1;
      const dateCounts = byProtocol.get(up.protocol_id) || new Map<string, number>();

      // Fully completed dates
      const fullDates = [...dateCounts.entries()]
        .filter(([, count]) => count >= toolCount)
        .map(([date]) => date)
        .sort()
        .reverse();

      if (fullDates.length === 0) {
        return { protocol_id: protocol.id, title: protocol.title, slug: protocol.slug, current_streak: 0, longest_streak: 0, total_days: 0 };
      }

      // Current streak
      let streak = 0;
      if (fullDates[0] === today || fullDates[0] === yesterday) {
        streak = 1;
        for (let i = 1; i < fullDates.length; i++) {
          if (daysBetween(fullDates[i - 1], fullDates[i]) === 1) streak++;
          else break;
        }
      }

      // Longest streak
      let longest = 1;
      let run = 1;
      for (let i = 1; i < fullDates.length; i++) {
        if (daysBetween(fullDates[i - 1], fullDates[i]) === 1) {
          run++;
          longest = Math.max(longest, run);
        } else {
          run = 1;
        }
      }

      bestCurrent = Math.max(bestCurrent, streak);
      bestLongest = Math.max(bestLongest, longest);

      return {
        protocol_id: protocol.id,
        title: protocol.title,
        slug: protocol.slug,
        current_streak: streak,
        longest_streak: longest,
        total_days: fullDates.length,
      };
    });

    return NextResponse.json({
      protocols: protocolStreaks,
      best_current: bestCurrent,
      best_longest: bestLongest,
    });
  } catch (err) {
    return handleApiError(err, requestId);
  }
}
