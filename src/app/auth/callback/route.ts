import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const errorParam = searchParams.get("error_description") || searchParams.get("error");
  const next = searchParams.get("next") ?? "/onboarding";

  // Handle OAuth provider errors — map to generic messages to prevent information leakage
  if (errorParam) {
    const genericErrors: Record<string, string> = {
      access_denied: "Authentication was denied",
      invalid_request: "Invalid authentication request",
      server_error: "Authentication service error",
      temporarily_unavailable: "Authentication temporarily unavailable",
    };
    const safeMessage = genericErrors[errorParam] || "Authentication failed. Please try again.";
    const encoded = encodeURIComponent(safeMessage);
    return NextResponse.redirect(`${origin}/auth?error=${encoded}`);
  }

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        // Use maybeSingle() — row may not exist yet for first-time OAuth users.
        // The middleware will create it on the next request.
        const { data: profile } = await supabase
          .from("users")
          .select("onboarding_completed")
          .eq("id", user.id)
          .maybeSingle();

        if (profile?.onboarding_completed) {
          return NextResponse.redirect(`${origin}/protocols`);
        }
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/auth?error=Could+not+authenticate`);
}
