"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight, CheckCircle } from "lucide-react";

export function WaitlistForm({ source = "landing_page" }: { source?: string }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;

    setState("loading");
    setMessage("");

    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), source }),
      });

      const data = (await res.json()) as { message?: string; error?: string };

      if (res.ok || res.status === 200) {
        setState("success");
        setMessage(data.message || "You're on the list!");
        setEmail("");
      } else {
        setState("error");
        setMessage(data.error || "Something went wrong. Please try again.");
      }
    } catch {
      setState("error");
      setMessage("Something went wrong. Please try again.");
    }
  }

  if (state === "success") {
    return (
      <div className="flex items-center justify-center gap-2 py-3 px-5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-sm font-medium w-full max-w-sm mx-auto">
        <CheckCircle className="w-4 h-4 shrink-0" />
        <span>{message}</span>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col sm:flex-row gap-2 w-full max-w-sm mx-auto"
    >
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Enter your email"
        className="flex-1 rounded-full border border-border bg-background px-4 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary min-h-[44px]"
        disabled={state === "loading"}
      />
      <Button
        type="submit"
        disabled={state === "loading" || !email.trim()}
        className="rounded-full px-5 min-h-[44px] shrink-0"
      >
        {state === "loading" ? (
          "Joining..."
        ) : (
          <>
            Join Waitlist
            <ArrowRight className="ml-1.5 w-4 h-4" />
          </>
        )}
      </Button>
      {state === "error" && (
        <p className="text-xs text-destructive text-center sm:col-span-2 w-full">
          {message}
        </p>
      )}
    </form>
  );
}
