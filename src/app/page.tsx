import Link from "next/link";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";
import { WaitlistForm } from "@/components/ui/waitlist-form";
import { AppStoreButton } from "@/components/ui/app-store-button";
import {
  Moon,
  Brain,
  Dumbbell,
  Heart,
  Apple,
  Zap,
  Snowflake,
  Sun,
  Target,
  Smile,
  Search,
  FlaskConical,
  TrendingUp,
  MessageCircle,
  BarChart3,
  Shield,
  BookOpen,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

const categories: { icon: LucideIcon; label: string; accent: string }[] = [
  { icon: Moon, label: "Sleep", accent: "text-indigo-400" },
  { icon: Brain, label: "Focus", accent: "text-amber-400" },
  { icon: Dumbbell, label: "Exercise", accent: "text-emerald-400" },
  { icon: Heart, label: "Stress", accent: "text-rose-400" },
  { icon: Apple, label: "Nutrition", accent: "text-green-400" },
  { icon: Zap, label: "Hormones", accent: "text-yellow-400" },
  { icon: Snowflake, label: "Cold/Heat", accent: "text-cyan-400" },
  { icon: Sun, label: "Light", accent: "text-orange-400" },
  { icon: Target, label: "Motivation", accent: "text-purple-400" },
  { icon: Smile, label: "Mental Health", accent: "text-pink-400" },
];

const steps: {
  num: number;
  title: string;
  icon: LucideIcon;
  description: string;
}[] = [
  {
    num: 1,
    title: "Browse Protocols",
    icon: Search,
    description:
      "Explore 50+ evidence-based health protocols across 10 categories",
  },
  {
    num: 2,
    title: "Follow the Science",
    icon: FlaskConical,
    description:
      "Each tool is ranked by effectiveness with cited research sources",
  },
  {
    num: 3,
    title: "Track Your Progress",
    icon: TrendingUp,
    description:
      "Build streaks, track completions, and optimize your routine",
  },
];

const stats: { value: string; label: string }[] = [
  { value: "50+", label: "Protocols" },
  { value: "500+", label: "Evidence-Based Tools" },
  { value: "Cited", label: "Peer-Reviewed Sources" },
  { value: "Free", label: "To Use" },
];

export default function HomePage() {
  return (
    <div className="flex flex-col min-h-screen">
      {/* ── Header ── */}
      <header className="sticky top-0 z-50 border-b border-border/40 bg-background/80 backdrop-blur-lg px-4 sm:px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm">
              C
            </div>
            <span className="font-semibold text-lg">Craftwell</span>
          </div>
          <div className="flex items-center gap-3 sm:gap-4">
            <Link
              href="/pricing"
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Pricing
            </Link>
            <Link href="/auth">
              <Button variant="outline" size="sm">
                Sign In
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="px-4 sm:px-6 pt-20 pb-24 sm:pt-28 sm:pb-32">
        <div className="max-w-3xl mx-auto text-center space-y-6">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight">
            Science-Based Health Protocols
          </h1>
          <p className="text-base sm:text-lg text-muted-foreground max-w-xl mx-auto leading-relaxed">
            50+ evidence-based protocols ranked by effectiveness. Get
            personalized recommendations from an AI adviser grounded in
            peer-reviewed research.
          </p>
          <div className="flex gap-3 sm:gap-4 justify-center flex-wrap pt-2">
            {/* Use buttonVariants on Link directly — <a><button> nesting is invalid HTML
                and prevents click propagation in Chrome/Safari (PB-216) */}
            <Link href="/auth" className={cn(buttonVariants(), "py-3 px-8 text-base h-auto")}>
              Get Started
              <ArrowRight className="ml-1.5 size-4" />
            </Link>
            <Link
              href="/protocols"
              className={cn(buttonVariants({ variant: "ghost" }), "py-3 px-8 text-base h-auto border border-border")}
            >
              Browse Protocols
            </Link>
          </div>
          <div className="flex justify-center pt-2">
            <AppStoreButton />
          </div>
          <p className="text-sm text-muted-foreground/70 pt-1">
            iOS app coming soon &middot; Free to start, no credit card required
          </p>
        </div>
      </section>

      {/* ── How It Works ── */}
      <section className="bg-muted/5 px-4 sm:px-6 py-20 sm:py-24">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-14">
            How It Works
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10 md:gap-6 relative">
            {/* Connecting lines (desktop only) */}
            <div className="hidden md:block absolute top-10 left-[calc(33.33%+0.75rem)] right-[calc(33.33%+0.75rem)] h-px bg-border" />

            {steps.map((step) => {
              const Icon = step.icon;
              return (
                <div
                  key={step.num}
                  className="flex flex-col items-center text-center space-y-4"
                >
                  <div className="relative">
                    <div className="w-20 h-20 rounded-2xl bg-muted/50 flex items-center justify-center">
                      <Icon className="size-8 text-primary" />
                    </div>
                    <div className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">
                      {step.num}
                    </div>
                  </div>
                  <h3 className="text-lg font-semibold">{step.title}</h3>
                  <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
                    {step.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Feature Highlights ── */}
      <section className="px-4 sm:px-6 py-20 sm:py-24">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-14">
            Everything You Need
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Feature 1: Categories */}
            <div className="rounded-2xl border border-border/50 bg-muted/10 p-6 space-y-5">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <BookOpen className="size-6 text-primary" />
              </div>
              <h3 className="text-lg font-semibold">10 Health Categories</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                From sleep optimization and focus enhancement to cold exposure
                and hormonal health &mdash; explore all ten below.
              </p>
            </div>

            {/* Feature 2: AI Adviser */}
            <div className="rounded-2xl border border-border/50 bg-muted/10 p-6 space-y-5">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <MessageCircle className="size-6 text-primary" />
              </div>
              <h3 className="text-lg font-semibold">AI Health Adviser</h3>
              <div className="space-y-2.5 text-sm">
                <div className="flex items-start gap-2">
                  <Sparkles className="size-4 text-primary mt-0.5 shrink-0" />
                  <span className="text-muted-foreground">
                    Ask any health question
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <Shield className="size-4 text-primary mt-0.5 shrink-0" />
                  <span className="text-muted-foreground">
                    Answers grounded in research
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <BookOpen className="size-4 text-primary mt-0.5 shrink-0" />
                  <span className="text-muted-foreground">
                    Cited peer-reviewed sources
                  </span>
                </div>
              </div>
            </div>

            {/* Feature 3: Tracking */}
            <div className="rounded-2xl border border-border/50 bg-muted/10 p-6 space-y-5">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <BarChart3 className="size-6 text-primary" />
              </div>
              <h3 className="text-lg font-semibold">Track &amp; Build Habits</h3>
              <div className="space-y-2.5 text-sm">
                <div className="flex items-start gap-2">
                  <Target className="size-4 text-primary mt-0.5 shrink-0" />
                  <span className="text-muted-foreground">
                    Daily completions
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <Zap className="size-4 text-primary mt-0.5 shrink-0" />
                  <span className="text-muted-foreground">
                    Streaks &amp; weekly dashboards
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <TrendingUp className="size-4 text-primary mt-0.5 shrink-0" />
                  <span className="text-muted-foreground">
                    Progress analytics
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Categories ── */}
      <section className="bg-muted/5 px-4 sm:px-6 py-20 sm:py-24">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-14">
            Explore 10 Science-Based Categories
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {categories.map((cat) => {
              const Icon = cat.icon;
              return (
                <div
                  key={cat.label}
                  className="flex flex-col items-center gap-2 p-4 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors"
                >
                  <Icon className={`size-6 ${cat.accent}`} />
                  <span className="text-sm text-muted-foreground font-medium">
                    {cat.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Social Proof / Stats ── */}
      <section className="px-4 sm:px-6 py-20 sm:py-24">
        <div className="max-w-4xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8">
            {stats.map((stat) => (
              <div key={stat.label} className="text-center space-y-2">
                <div className="text-3xl sm:text-4xl font-bold text-primary">
                  {stat.value}
                </div>
                <div className="text-sm text-muted-foreground font-medium">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA / Waitlist ── */}
      <section className="px-4 sm:px-6 pb-20 sm:pb-24">
        <div className="max-w-3xl mx-auto">
          <div className="rounded-2xl bg-muted/20 border border-border/50 p-8 sm:p-12 text-center space-y-6">
            <h2 className="text-2xl sm:text-3xl font-bold">
              Be first to download Craftwell
            </h2>
            <p className="text-muted-foreground max-w-lg mx-auto leading-relaxed">
              The iOS app is coming soon. Join the waitlist and we&apos;ll let you
              know the moment it lands &mdash; plus get early access to protocols,
              personalized recommendations, and an AI health adviser.
            </p>
            <div className="flex justify-center pt-1">
              <AppStoreButton />
            </div>
            <WaitlistForm source="landing_cta" />
            <p className="text-xs text-muted-foreground/60">
              Already have an account?{" "}
              <Link href="/auth" className="underline underline-offset-4 hover:text-foreground">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-border/40 px-4 sm:px-6 py-8">
        <div className="max-w-6xl mx-auto space-y-4 text-center">
          <div className="flex items-center justify-center gap-6 text-sm text-muted-foreground">
            <Link
              href="/privacy"
              className="hover:text-foreground transition-colors"
            >
              Privacy Policy
            </Link>
            <Link
              href="/terms"
              className="hover:text-foreground transition-colors"
            >
              Terms of Service
            </Link>
          </div>
          <p className="text-xs text-muted-foreground/70 max-w-lg mx-auto leading-relaxed">
            Protocols sourced from peer-reviewed research and expert analysis.
            This content is for informational purposes only and is not medical
            advice. Always consult a healthcare professional before making
            changes to your health routine.
          </p>
          <p className="text-xs text-muted-foreground/50">
            &copy; 2026 Craftwell
          </p>
        </div>
      </footer>
    </div>
  );
}
