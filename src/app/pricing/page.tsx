"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Check, Loader2 } from "lucide-react";

type Plan = "monthly" | "annual" | "lifetime";

const PRO_FEATURES = [
  "Unlimited active protocols",
  "Unlimited AI adviser messages",
  "Full streak & completion tracking",
  "Apple Health sync (sleep, HRV, heart rate)",
  "AI Protocol Coach — adaptive daily recommendations",
];

const FAQ = [
  {
    q: "Can I cancel anytime?",
    a: "Yes. Manage or cancel your subscription anytime from your profile — you keep Pro access until the end of the period.",
  },
  {
    q: "What's the Founding Member deal?",
    a: "A one-time payment for lifetime Pro access — everything in Pro, forever, no recurring charge. Limited to the first 500 members.",
  },
  {
    q: "Is this medical advice?",
    a: "No. Craftwell is educational and based on peer-reviewed research. Always consult a healthcare professional before changing your routine.",
  },
];

export default function PricingPage() {
  const router = useRouter();
  const [billing, setBilling] = useState<"monthly" | "annual">("monthly");
  const [loadingPlan, setLoadingPlan] = useState<Plan | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  async function startCheckout(plan: Plan) {
    setLoadingPlan(plan);
    setCheckoutError(null);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      if (res.status === 401) {
        router.push("/auth?redirect=/pricing");
        return;
      }
      if (res.status === 410) {
        setCheckoutError("The Founding Member lifetime plan is sold out.");
        return;
      }
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok) {
        setCheckoutError(
          data.error ??
            "Checkout could not be started. Your account was not charged."
        );
        return;
      }
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      setCheckoutError(
        "Checkout could not be started. Your account was not charged."
      );
    } catch {
      setCheckoutError(
        "Checkout could not be reached. Check your connection and try again."
      );
    } finally {
      setLoadingPlan(null);
    }
  }

  const proPlan: Plan = billing === "monthly" ? "monthly" : "annual";
  const proPrice = billing === "monthly" ? "$12.99" : "$99";
  const proSuffix = billing === "monthly" ? "/month" : "/year";

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border/40 bg-background/80 backdrop-blur-lg px-4 sm:px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm">
              C
            </div>
            <span className="font-semibold text-lg">Craftwell</span>
          </Link>
          <Link href="/auth">
            <Button variant="outline" size="sm">
              Sign In
            </Button>
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="px-4 sm:px-6 pt-16 pb-8 sm:pt-20 text-center space-y-4">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
          Simple, science-based pricing
        </h1>
        <p className="text-base sm:text-lg text-muted-foreground max-w-xl mx-auto">
          Start free. Upgrade when you want unlimited protocols, the AI coach, and
          wearable sync.
        </p>

        {/* Billing toggle */}
        <div className="inline-flex rounded-lg bg-muted p-1 mt-2">
          {(["monthly", "annual"] as const).map((b) => (
            <button
              key={b}
              onClick={() => setBilling(b)}
              className={cn(
                "rounded-md px-4 py-1.5 text-sm font-medium transition-colors capitalize",
                billing === b
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {b}
              {b === "annual" && (
                <span className="ml-1.5 text-xs text-emerald-500">save 36%</span>
              )}
            </button>
          ))}
        </div>
      </section>

      {/* Tiers */}
      <section className="px-4 sm:px-6 pb-16">
        <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
          {/* Free */}
          <TierCard title="Free" price="$0" suffix="forever">
            <Feature>3 active protocols</Feature>
            <Feature>5 AI messages / day</Feature>
            <Feature>Basic tracking</Feature>
            <Link href="/auth" className="mt-auto">
              <Button variant="outline" className="w-full">
                Get started
              </Button>
            </Link>
          </TierCard>

          {/* Pro — highlighted */}
          <TierCard title="Pro" price={proPrice} suffix={proSuffix} featured>
            {PRO_FEATURES.map((f) => (
              <Feature key={f}>{f}</Feature>
            ))}
            <Button
              className="w-full mt-auto"
              onClick={() => startCheckout(proPlan)}
              disabled={loadingPlan !== null}
            >
              {loadingPlan === proPlan ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                "Go Pro"
              )}
            </Button>
          </TierCard>

          {/* Founding Member */}
          <TierCard title="Founding Member" price="$149" suffix="once · lifetime">
            <Feature>Everything in Pro, forever</Feature>
            <Feature>No recurring charge</Feature>
            <Feature>Founding member badge</Feature>
            <Feature>First 500 members only</Feature>
            <Button
              variant="outline"
              className="w-full mt-auto"
              onClick={() => startCheckout("lifetime")}
              disabled={loadingPlan !== null}
            >
              {loadingPlan === "lifetime" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                "Become a Founder"
              )}
            </Button>
          </TierCard>
        </div>
        {checkoutError && (
          <p
            role="alert"
            className="max-w-2xl mx-auto mt-6 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-center text-sm text-destructive"
          >
            {checkoutError}
          </p>
        )}
      </section>

      {/* FAQ */}
      <section className="px-4 sm:px-6 pb-20">
        <div className="max-w-2xl mx-auto space-y-6">
          <h2 className="text-2xl font-bold text-center mb-8">Questions</h2>
          {FAQ.map(({ q, a }) => (
            <div key={q} className="space-y-1.5">
              <h3 className="font-semibold">{q}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/40 px-4 sm:px-6 py-8 mt-auto">
        <div className="max-w-6xl mx-auto flex items-center justify-center gap-6 text-sm text-muted-foreground">
          <Link href="/privacy" className="hover:text-foreground transition-colors">
            Privacy Policy
          </Link>
          <Link href="/terms" className="hover:text-foreground transition-colors">
            Terms of Service
          </Link>
        </div>
      </footer>
    </div>
  );
}

function TierCard({
  title,
  price,
  suffix,
  featured = false,
  children,
}: {
  title: string;
  price: string;
  suffix: string;
  featured?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-col rounded-2xl border p-6 space-y-4",
        featured
          ? "border-primary/50 bg-primary/5 shadow-sm"
          : "border-border/50 bg-muted/10"
      )}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">{title}</h3>
        {featured && <Badge>Most popular</Badge>}
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-3xl font-bold">{price}</span>
        <span className="text-sm text-muted-foreground">{suffix}</span>
      </div>
      {children}
    </div>
  );
}

function Feature({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 text-sm">
      <Check className="size-4 text-primary mt-0.5 shrink-0" />
      <span className="text-muted-foreground">{children}</span>
    </div>
  );
}
