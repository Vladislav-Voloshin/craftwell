"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";

const PLANS = [
  {
    key: "free",
    name: "Free",
    price: "$0",
    period: "forever",
    description: "Get started with science-based health protocols",
    features: [
      "Browse all 200+ protocols",
      "5 AI chat messages per day",
      "Track up to 3 active protocols",
      "Basic streak tracking",
    ],
    cta: "Current Plan",
    disabled: true,
    popular: false,
  },
  {
    key: "monthly",
    name: "Pro",
    price: "$12.99",
    period: "/month",
    yearlyEquiv: "$155.88/yr",
    description: "Unlock the full power of Craftwell",
    features: [
      "Everything in Free",
      "Unlimited AI chat",
      "Unlimited active protocols",
      "AI Protocol Builder (personalized plans)",
      "Export protocols to PDF",
      "Priority support",
    ],
    cta: "Start Pro",
    disabled: false,
    popular: true,
  },
  {
    key: "lifetime",
    name: "Founding Member",
    price: "$149",
    period: "one-time",
    description: "Early supporter pricing — limited to 500",
    features: [
      "Everything in Pro, forever",
      "Founding Member badge",
      "Early access to new features",
      "Shape the product roadmap",
      "Never pay again",
    ],
    cta: "Become a Founder",
    disabled: false,
    popular: false,
    badge: "Limited",
  },
];

export default function PricingPage() {
  const [loading, setLoading] = useState<string | null>(null);
  const [yearly, setYearly] = useState(false);

  async function handleCheckout(plan: string) {
    setLoading(plan);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: yearly && plan === "monthly" ? "yearly" : plan }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      setLoading(null);
    }
  }

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto px-4 py-12">
        <div className="text-center space-y-4 mb-10">
          <h1 className="text-3xl font-bold">Simple, Transparent Pricing</h1>
          <p className="text-muted-foreground max-w-lg mx-auto">
            Science-based health optimization for everyone. Upgrade when you&#39;re ready.
          </p>

          {/* Yearly toggle */}
          <div className="flex items-center justify-center gap-3 pt-2">
            <span className={`text-sm ${!yearly ? "font-semibold" : "text-muted-foreground"}`}>Monthly</span>
            <button
              onClick={() => setYearly(!yearly)}
              className={`relative w-12 h-6 rounded-full transition-colors ${yearly ? "bg-primary" : "bg-muted"}`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                  yearly ? "translate-x-6" : ""
                }`}
              />
            </button>
            <span className={`text-sm ${yearly ? "font-semibold" : "text-muted-foreground"}`}>
              Yearly <Badge variant="secondary" className="ml-1 text-xs">Save 36%</Badge>
            </span>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {PLANS.map((plan) => (
            <Card
              key={plan.key}
              className={`relative flex flex-col ${
                plan.popular ? "border-primary shadow-lg ring-1 ring-primary/20" : "shadow-sm"
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge className="bg-primary text-primary-foreground px-3">Most Popular</Badge>
                </div>
              )}
              {plan.badge && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge variant="secondary" className="px-3">{plan.badge}</Badge>
                </div>
              )}
              <CardHeader className="text-center pb-4 pt-6">
                <CardTitle className="text-lg">{plan.name}</CardTitle>
                <div className="mt-2">
                  <span className="text-3xl font-bold">
                    {plan.key === "monthly" && yearly ? "$99" : plan.price}
                  </span>
                  <span className="text-muted-foreground text-sm">
                    {plan.key === "monthly" && yearly ? "/year" : ` ${plan.period}`}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground mt-2">{plan.description}</p>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col">
                <ul className="space-y-3 flex-1">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-sm">
                      <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
                <Button
                  className="w-full mt-6"
                  variant={plan.popular ? "default" : "outline"}
                  disabled={plan.disabled || loading !== null}
                  onClick={() => handleCheckout(plan.key)}
                >
                  {loading === plan.key ? "Redirecting..." : plan.cta}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* FAQ */}
        <div className="mt-16 max-w-2xl mx-auto space-y-6">
          <h2 className="text-2xl font-bold text-center">Frequently Asked Questions</h2>
          <div className="space-y-4">
            {[
              {
                q: "Can I cancel anytime?",
                a: "Yes, you can cancel your subscription at any time. You'll keep access until the end of your billing period.",
              },
              {
                q: "What's included in the free plan?",
                a: "Browse all protocols, 5 AI chat messages per day, and track up to 3 active protocols with basic streak tracking.",
              },
              {
                q: "What is the Founding Member plan?",
                a: "A one-time payment of $149 that gives you lifetime Pro access. Limited to the first 500 members.",
              },
              {
                q: "Is my payment secure?",
                a: "All payments are processed securely through Stripe. We never store your card details.",
              },
            ].map((faq) => (
              <details key={faq.q} className="group border rounded-lg p-4">
                <summary className="font-medium cursor-pointer list-none flex items-center justify-between">
                  {faq.q}
                  <span className="text-muted-foreground group-open:rotate-180 transition-transform">▾</span>
                </summary>
                <p className="mt-2 text-sm text-muted-foreground">{faq.a}</p>
              </details>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
