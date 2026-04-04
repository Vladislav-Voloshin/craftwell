import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { requireAuth, apiError, handleApiError, parseBody } from "@/lib/api/helpers";
import { getRequestId } from "@/lib/api/request-id";
import { coreEnv } from "@/lib/env";
import { z } from "zod";

/**
 * Lightweight admin client that only requires Supabase keys —
 * avoids importing getSupabaseAdmin which pulls in the full
 * AI/ingestion env (ANTHROPIC_API_KEY, PINECONE_API_KEY, etc.).
 */
function getAdminClient() {
  const { NEXT_PUBLIC_SUPABASE_URL } = coreEnv();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  }
  return createSupabaseClient(NEXT_PUBLIC_SUPABASE_URL, serviceRoleKey);
}

const profileUpdateSchema = z.object({
  profile: z.object({
    display_name: z.string().max(100).nullish(),
    first_name: z.string().max(50).nullish(),
    last_name: z.string().max(50).nullish(),
    age: z.number().int().min(1).max(150).nullish(),
  }).optional(),
  survey: z.object({
    health_goals: z.array(z.string()).optional(),
    sleep_quality: z.number().int().min(1).max(10).optional(),
    exercise_frequency: z.string().optional(),
    stress_level: z.number().int().min(1).max(10).optional(),
    supplement_experience: z.string().nullish(),
    focus_areas: z.array(z.string()).optional(),
  }).optional(),
});

export async function GET() {
  try {
    const { user, supabase } = await requireAuth();

    const [{ data: profile }, { data: survey }] = await Promise.all([
      supabase.from("users").select("*").eq("id", user.id).single(),
      supabase.from("survey_responses").select("*").eq("user_id", user.id).maybeSingle(),
    ]);

    return NextResponse.json({ profile, survey });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PUT(request: NextRequest) {
  const requestId = getRequestId(request);
  try {
    const { user, supabase } = await requireAuth();

    const body = await parseBody(request, profileUpdateSchema);
    if (body instanceof Response) return body;

    const { profile: profileData, survey: surveyData } = body;

    const results: { profile?: string; survey?: string } = {};

    // Update users table — Zod already strips unknown fields
    if (profileData && Object.keys(profileData).length > 0) {
      const { error } = await supabase
        .from("users")
        .update(profileData)
        .eq("id", user.id);

      if (error) {
        // If columns don't exist yet, try without the new columns
        if (error.message.includes("does not exist") && profileData.display_name !== undefined) {
          const { error: fallbackErr } = await supabase
            .from("users")
            .update({ display_name: profileData.display_name })
            .eq("id", user.id);

          results.profile = fallbackErr
            ? fallbackErr.message
            : "updated (some fields pending migration)";
        } else {
          return apiError(error.message, 500);
        }
      } else {
        results.profile = "updated";
      }
    }

    // Update survey_responses — Zod already strips unknown fields
    if (surveyData && Object.keys(surveyData).length > 0) {
      const { error } = await supabase
        .from("survey_responses")
        .upsert({ user_id: user.id, ...surveyData }, { onConflict: "user_id" });

      if (error) {
        return apiError(error.message, 500);
      }
      results.survey = "updated";
    }

    return NextResponse.json({ status: "ok", ...results });
  } catch (err) {
    return handleApiError(err, requestId);
  }
}

export async function DELETE(request: NextRequest) {
  const requestId = getRequestId(request);
  try {
    const { user, supabase } = await requireAuth();
    const admin = getAdminClient();

    // ── 1. Delete application data FIRST (child → parent for FK order) ──
    // If any delete fails, the user can still sign in and retry.
    // This is safer than deleting auth first and leaving orphaned data.

    // Protocol favorites
    const { error: favError } = await supabase
      .from("protocol_favorites")
      .delete()
      .eq("user_id", user.id);
    if (favError) throw new Error(`Failed to delete favorites: ${favError.message}`);

    // Protocol completions
    const { error: compError } = await supabase
      .from("protocol_completions")
      .delete()
      .eq("user_id", user.id);
    if (compError) throw new Error(`Failed to delete completions: ${compError.message}`);

    // Protocol notes
    const { error: notesError } = await supabase
      .from("protocol_notes")
      .delete()
      .eq("user_id", user.id);
    if (notesError) throw new Error(`Failed to delete notes: ${notesError.message}`);

    // User protocols
    const { error: upError } = await supabase
      .from("user_protocols")
      .delete()
      .eq("user_id", user.id);
    if (upError) throw new Error(`Failed to delete user protocols: ${upError.message}`);

    // Chat messages (via sessions)
    const { data: sessions } = await supabase
      .from("chat_sessions")
      .select("id")
      .eq("user_id", user.id);

    if (sessions && sessions.length > 0) {
      const sessionIds = sessions.map((s) => s.id);
      const { error: msgError } = await supabase
        .from("chat_messages")
        .delete()
        .in("session_id", sessionIds);
      if (msgError) throw new Error(`Failed to delete messages: ${msgError.message}`);
    }

    // Chat sessions
    const { error: sessError } = await supabase
      .from("chat_sessions")
      .delete()
      .eq("user_id", user.id);
    if (sessError) throw new Error(`Failed to delete sessions: ${sessError.message}`);

    // Survey responses
    const { error: surveyError } = await supabase
      .from("survey_responses")
      .delete()
      .eq("user_id", user.id);
    if (surveyError) throw new Error(`Failed to delete survey: ${surveyError.message}`);

    // User profile row
    const { error: userError } = await supabase
      .from("users")
      .delete()
      .eq("id", user.id);
    if (userError) throw new Error(`Failed to delete user profile: ${userError.message}`);

    // ── 2. Delete auth user LAST ──
    // Only after all data is cleaned up. If this fails, the user
    // has no data but can still sign in — they'll just see a fresh state.
    const { error: authError } = await admin.auth.admin.deleteUser(user.id);
    if (authError) {
      return apiError(`Data deleted but auth removal failed: ${authError.message}`, 500);
    }

    return NextResponse.json({ status: "deleted" });
  } catch (err) {
    return handleApiError(err, requestId);
  }
}
