import { NextRequest, NextResponse } from "next/server";
import { requireAuth, handleApiError } from "@/lib/api/helpers";
import { getRequestId } from "@/lib/api/request-id";

/** Shape of each row returned by the completions join query. */
interface CompletionRow {
  completed_date: string;
  protocol_id: string;
  tool_id: string;
  protocols: { title: string } | null;
  protocol_tools: { title: string } | null;
}

/** Extract the title from a Supabase embedded-relation result with a runtime check. */
function getRelationTitle(relation: unknown): string {
  if (
    relation !== null &&
    typeof relation === "object" &&
    "title" in relation &&
    typeof (relation as Record<string, unknown>).title === "string"
  ) {
    return (relation as { title: string }).title;
  }
  return "Unknown";
}

/** Escape a CSV field — wraps in quotes when the value contains commas, quotes, or newlines. */
function escapeField(s: string): string {
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function GET(request: NextRequest) {
  const requestId = getRequestId(request);
  try {
    const { user, supabase } = await requireAuth();

    // Get all completions with protocol and tool info
    const { data } = await supabase
      .from("protocol_completions")
      .select("completed_date, protocol_id, tool_id, protocols(title), protocol_tools(title)")
      .eq("user_id", user.id)
      .order("completed_date", { ascending: false });

    const completions = (data ?? []) as CompletionRow[];

    if (completions.length === 0) {
      const csv = "Date,Protocol,Tool,Completed\n";
      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="craftwell-progress-${new Date().toISOString().split("T")[0]}.csv"`,
        },
      });
    }

    const rows = completions.map((c) => {
      const protocol = getRelationTitle(c.protocols);
      const tool = getRelationTitle(c.protocol_tools);
      return `${c.completed_date},${escapeField(protocol)},${escapeField(tool)},Yes`;
    });

    const csv = ["Date,Protocol,Tool,Completed", ...rows].join("\n");
    const today = new Date().toISOString().split("T")[0];

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="craftwell-progress-${today}.csv"`,
      },
    });
  } catch (err) {
    return handleApiError(err, requestId);
  }
}
