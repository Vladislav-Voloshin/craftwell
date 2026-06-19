import { NextRequest, NextResponse } from "next/server";
import { requireAuth, apiError, handleApiError, parseBody } from "@/lib/api/helpers";
import { getRequestId } from "@/lib/api/request-id";
import { favoriteToggleSchema } from "@/lib/api/schemas";

export async function GET() {
  try {
    const { user, supabase } = await requireAuth();

    const { data: favorites } = await supabase
      .from("protocol_favorites")
      .select("protocol_id")
      .eq("user_id", user.id);

    return NextResponse.json({
      protocol_ids: (favorites || []).map((f) => f.protocol_id),
    });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request);
  try {
    const { user, supabase } = await requireAuth();

    const body = await parseBody(request, favoriteToggleSchema);
    if (body instanceof Response) return body;

    const { protocol_id } = body;

    // Check if already favorited
    const { data: existing } = await supabase
      .from("protocol_favorites")
      .select("id")
      .eq("user_id", user.id)
      .eq("protocol_id", protocol_id)
      .maybeSingle();

    if (existing) {
      // Remove favorite
      const { error } = await supabase
        .from("protocol_favorites")
        .delete()
        .eq("id", existing.id);
      if (error) return apiError(error.message, 500);
      return NextResponse.json({ favorited: false });
    } else {
      // Add favorite
      const { error } = await supabase
        .from("protocol_favorites")
        .insert({ user_id: user.id, protocol_id });
      if (error) return apiError(error.message, 500);
      return NextResponse.json({ favorited: true });
    }
  } catch (err) {
    return handleApiError(err, requestId);
  }
}
