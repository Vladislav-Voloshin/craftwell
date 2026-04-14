import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseBody, apiError, handleApiError } from "@/lib/api/helpers";
import { getRequestId } from "@/lib/api/request-id";
import { checkIpRateLimit } from "@/lib/api/rate-limit";
import logger from "@/lib/logger";
import { z } from "zod";

const waitlistSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  name: z.string().max(100).optional(),
  source: z.string().max(50).optional(),
});

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request);
  const log = logger.child({ requestId, route: "POST /api/waitlist" });

  // IP-based rate limiting for unauthenticated endpoint
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rateLimited = checkIpRateLimit(ip, "/api/waitlist");
  if (rateLimited) return rateLimited;

  try {
    const supabase = await createClient();

    const body = await parseBody(request, waitlistSchema);
    if (body instanceof Response) return body;

    const { email, name, source = "landing_page" } = body;

    const { error } = await supabase.from("waitlist").insert({
      email: email.toLowerCase().trim(),
      name: name?.trim() || null,
      source,
    });

    if (error) {
      // Unique constraint violation — already on the list
      if (error.code === "23505") {
        return NextResponse.json(
          { message: "You're already on the waitlist!" },
          { status: 200 }
        );
      }
      log.error({ err: error }, "Waitlist insert error");
      return apiError("Failed to join waitlist. Please try again.", 500);
    }

    log.info({ email }, "New waitlist signup");
    return NextResponse.json(
      { message: "You're on the list! We'll be in touch soon." },
      { status: 201 }
    );
  } catch (err) {
    return handleApiError(err, requestId);
  }
}
