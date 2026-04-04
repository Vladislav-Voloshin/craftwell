import { NextRequest, NextResponse } from "next/server";
import { requireAuth, apiError, handleApiError, parseBody } from "@/lib/api/helpers";
import { getRequestId } from "@/lib/api/request-id";
import { z } from "zod";

const renameSchema = z.object({
  session_id: z.string().uuid(),
  title: z.string().min(1).max(200),
});

export async function GET(request: NextRequest) {
  const requestId = getRequestId(request);
  try {
    const { user, supabase } = await requireAuth();

    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get("session_id");

    if (sessionId) {
      // Verify the session belongs to the user
      const { data: session } = await supabase
        .from("chat_sessions")
        .select("id, user_id")
        .eq("id", sessionId)
        .single();

      if (!session || session.user_id !== user.id) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }

      // Load messages for a specific session
      const { data: messages } = await supabase
        .from("chat_messages")
        .select("id, role, content, sources, created_at")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: true });

      return NextResponse.json({ messages: messages || [] });
    }

    // List all sessions with pagination
    const parsedLimit = parseInt(searchParams.get("limit") || "50", 10);
    const parsedOffset = parseInt(searchParams.get("offset") || "0", 10);
    const limit = Math.min(Math.max(1, Number.isNaN(parsedLimit) ? 50 : parsedLimit), 200);
    const offset = Math.max(0, Number.isNaN(parsedOffset) ? 0 : parsedOffset);

    // Fetch total count for pagination metadata
    const { count: total } = await supabase
      .from("chat_sessions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);

    const { data: sessions } = await supabase
      .from("chat_sessions")
      .select("id, title, protocol_id, created_at, updated_at")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .range(offset, offset + limit - 1);

    const totalCount = total ?? 0;

    return NextResponse.json({
      sessions: sessions || [],
      total: totalCount,
      hasMore: offset + limit < totalCount,
    });
  } catch (err) {
    return handleApiError(err, requestId);
  }
}

export async function PATCH(request: NextRequest) {
  const requestId = getRequestId(request);
  try {
    const { user, supabase } = await requireAuth();

    const body = await parseBody(request, renameSchema);
    if (body instanceof Response) return body;

    const { session_id, title } = body;

    const { data: session } = await supabase
      .from("chat_sessions")
      .select("id, user_id")
      .eq("id", session_id)
      .single();

    if (!session || session.user_id !== user.id) {
      return apiError("Not found", 404);
    }

    const { error } = await supabase
      .from("chat_sessions")
      .update({ title })
      .eq("id", session_id);

    if (error) return apiError(error.message, 500);

    return NextResponse.json({ status: "renamed", title });
  } catch (err) {
    return handleApiError(err, requestId);
  }
}

export async function DELETE(request: NextRequest) {
  const requestId = getRequestId(request);
  try {
    const { user, supabase } = await requireAuth();

    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get("id");

    if (!sessionId) return apiError("id query parameter required", 400);

    const { data: session } = await supabase
      .from("chat_sessions")
      .select("id, user_id")
      .eq("id", sessionId)
      .single();

    if (!session || session.user_id !== user.id) {
      return apiError("Not found", 404);
    }

    // Delete messages first (child rows), then the session
    await supabase
      .from("chat_messages")
      .delete()
      .eq("session_id", sessionId);

    const { error } = await supabase
      .from("chat_sessions")
      .delete()
      .eq("id", sessionId);

    if (error) return apiError(error.message, 500);

    return NextResponse.json({ status: "deleted" });
  } catch (err) {
    return handleApiError(err, requestId);
  }
}
