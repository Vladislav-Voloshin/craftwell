import { NextRequest, NextResponse } from "next/server";
import { requireAuth, handleApiError } from "@/lib/api/helpers";
import { getRequestId } from "@/lib/api/request-id";

export async function GET(request: NextRequest) {
  const requestId = getRequestId(request);
  try {
    const { user, supabase } = await requireAuth();

    const { searchParams } = new URL(request.url);
    const weekParam = searchParams.get("week"); // YYYY-MM-DD (Monday of the week)
    const rawOffset = parseInt(searchParams.get("tz_offset") || "0", 10);
    const tzOffset = Math.max(-720, Math.min(840, Number.isNaN(rawOffset) ? 0 : rawOffset));

    // Calculate week start (Monday) based on provided date or current date
    let weekStart: Date;
    if (weekParam && /^\d{4}-\d{2}-\d{2}$/.test(weekParam)) {
      weekStart = new Date(weekParam + "T12:00:00Z");
    } else {
      const now = new Date();
      const local = new Date(now.getTime() - tzOffset * 60000);
      const day = local.getUTCDay();
      const diff = day === 0 ? -6 : 1 - day; // Monday = 1
      weekStart = new Date(local);
      weekStart.setUTCDate(weekStart.getUTCDate() + diff);
    }

    // Generate 7 dates for the week
    const dates: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setUTCDate(d.getUTCDate() + i);
      dates.push(d.toISOString().split("T")[0]);
    }

    // Get active protocols
    const { data: activeProtocols } = await supabase
      .from("user_protocols")
      .select("protocol_id, protocols(id, title, slug)")
      .eq("user_id", user.id)
      .eq("is_active", true);

    if (!activeProtocols || activeProtocols.length === 0) {
      return NextResponse.json({
        week_start: dates[0],
        week_end: dates[6],
        dates,
        protocols: [],
        overall_adherence: 0,
      });
    }

    const protocolIds = activeProtocols.map((p) => p.protocol_id);

    // Get tool counts per protocol
    const { data: toolCounts } = await supabase
      .from("protocol_tools")
      .select("protocol_id")
      .in("protocol_id", protocolIds);

    const toolCountMap = new Map<string, number>();
    for (const t of toolCounts || []) {
      toolCountMap.set(t.protocol_id, (toolCountMap.get(t.protocol_id) || 0) + 1);
    }

    // Get completions for the week range
    const { data: completions } = await supabase
      .from("protocol_completions")
      .select("protocol_id, tool_id, completed_date")
      .eq("user_id", user.id)
      .in("protocol_id", protocolIds)
      .gte("completed_date", dates[0])
      .lte("completed_date", dates[6]);

    // Build completion map: protocol_id -> date -> count
    const completionMap = new Map<string, Map<string, number>>();
    for (const c of completions || []) {
      if (!completionMap.has(c.protocol_id)) {
        completionMap.set(c.protocol_id, new Map());
      }
      const dateMap = completionMap.get(c.protocol_id)!;
      dateMap.set(c.completed_date, (dateMap.get(c.completed_date) || 0) + 1);
    }

    // Build protocol rows
    let totalCells = 0;
    let completedCells = 0;

    const protocols = activeProtocols.map((up) => {
      const protocol = up.protocols as unknown as { id: string; title: string; slug: string };
      const totalTools = toolCountMap.get(up.protocol_id) || 1;
      const dateMap = completionMap.get(up.protocol_id) || new Map<string, number>();

      const daily = dates.map((date) => {
        const completed = dateMap.get(date) || 0;
        const pct = Math.min(100, Math.round((completed / totalTools) * 100));
        totalCells++;
        if (pct === 100) completedCells++;
        return { date, completed, total: totalTools, percentage: pct };
      });

      return {
        protocol_id: protocol.id,
        title: protocol.title,
        slug: protocol.slug,
        total_tools: totalTools,
        daily,
      };
    });

    return NextResponse.json({
      week_start: dates[0],
      week_end: dates[6],
      dates,
      protocols,
      overall_adherence: totalCells > 0 ? Math.round((completedCells / totalCells) * 100) : 0,
    });
  } catch (err) {
    return handleApiError(err, requestId);
  }
}
