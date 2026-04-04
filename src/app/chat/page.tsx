import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { ChatInterface } from "@/components/chat/chat-interface";
import { ErrorBoundary } from "@/components/error-boundary";

export const metadata: Metadata = {
  title: "Chat — Craftwell",
  description: "Ask your AI health adviser about science-based protocols, supplements, and routines.",
};

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ protocol?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth");

  const params = await searchParams;

  const [{ data: sessions }, { data: survey }] = await Promise.all([
    supabase
      .from("chat_sessions")
      .select("*")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false }),
    supabase
      .from("survey_responses")
      .select("focus_areas, health_goals")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  // Fetch protocol details when arriving from a protocol page
  let protocolContext: { id: string; title: string; description: string } | undefined;
  if (params.protocol) {
    const { data: protocol } = await supabase
      .from("protocols")
      .select("id, title, description")
      .eq("id", params.protocol)
      .maybeSingle();

    if (protocol) {
      protocolContext = protocol;
    }
  }

  return (
    <AppShell>
      <ErrorBoundary name="ChatInterface">
        <ChatInterface
          userId={user.id}
          sessions={sessions || []}
          initialProtocolId={protocolContext?.id}
          initialProtocolContext={protocolContext}
          userFocusAreas={survey?.focus_areas ?? []}
          userHealthGoals={survey?.health_goals ?? []}
        />
      </ErrorBoundary>
    </AppShell>
  );
}
