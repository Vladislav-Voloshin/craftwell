"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface TourStep {
  target: string; // CSS selector
  title: string;
  description: string;
  position: "top" | "bottom" | "left" | "right";
}

const TOUR_STEPS: TourStep[] = [
  {
    target: "[data-tour='protocols-nav']",
    title: "Browse Protocols",
    description:
      "Explore science-based health protocols grounded in peer-reviewed research. Each one comes with actionable tools you can track daily.",
    position: "top",
  },
  {
    target: "[data-tour='chat-nav']",
    title: "Ask the AI Coach",
    description:
      "Chat with an AI grounded in peer-reviewed health science. Ask about sleep, supplements, exercise, or any health topic.",
    position: "top",
  },
  {
    target: "[data-tour='profile-nav']",
    title: "Track Your Progress",
    description:
      "View your stats, streaks, achievements, and active protocols all in one place.",
    position: "top",
  },
];

const STORAGE_KEY = "craftwell_tour_completed";

export function TourOverlay({ show }: { show?: boolean }) {
  const [step, setStep] = useState(0);
  const [delayComplete, setDelayComplete] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (show && !localStorage.getItem(STORAGE_KEY)) {
      const timer = setTimeout(() => setDelayComplete(true), 800);
      return () => clearTimeout(timer);
    }
  }, [show]);

  const visible = !!show && delayComplete && !dismissed;

  // Position tooltip and ring via refs (no setState in effect)
  useEffect(() => {
    if (!visible) return;

    function position() {
      const currentStep = TOUR_STEPS[step];
      const el = document.querySelector(currentStep.target);
      if (!el) return;

      const rect = el.getBoundingClientRect();

      // Position tooltip
      if (tooltipRef.current) {
        const tt = tooltipRef.current;
        tt.style.position = "fixed";
        if (currentStep.position === "top") {
          tt.style.bottom = `${window.innerHeight - rect.top + 12}px`;
          tt.style.left = `${rect.left + rect.width / 2}px`;
          tt.style.transform = "translateX(-50%)";
          tt.style.top = "";
          tt.style.right = "";
        }
      }

      // Position highlight ring
      if (ringRef.current) {
        const ring = ringRef.current;
        ring.style.position = "fixed";
        ring.style.top = `${rect.top - 4}px`;
        ring.style.left = `${rect.left - 4}px`;
        ring.style.width = `${rect.width + 8}px`;
        ring.style.height = `${rect.height + 8}px`;
        ring.style.borderRadius = "12px";
      }
    }

    position();
    window.addEventListener("resize", position);
    return () => window.removeEventListener("resize", position);
  }, [visible, step]);

  function handleNext() {
    if (step < TOUR_STEPS.length - 1) {
      setStep(step + 1);
    } else {
      completeTour();
    }
  }

  function completeTour() {
    localStorage.setItem(STORAGE_KEY, "true");
    setDismissed(true);
  }

  if (!visible) return null;

  const currentStep = TOUR_STEPS[step];
  const isLast = step === TOUR_STEPS.length - 1;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[100] bg-black/50 transition-opacity"
        onClick={completeTour}
      />

      {/* Highlight ring */}
      <div
        ref={ringRef}
        className="fixed z-[101] ring-2 ring-primary ring-offset-2 ring-offset-background pointer-events-none"
      />

      {/* Tooltip */}
      <div
        ref={tooltipRef}
        className={cn(
          "fixed z-[102] w-72 p-4 rounded-xl bg-background border border-border shadow-lg",
          "animate-in fade-in slide-in-from-bottom-2 duration-300"
        )}
      >
        <p className="font-semibold text-sm">{currentStep.title}</p>
        <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
          {currentStep.description}
        </p>
        <div className="flex items-center justify-between mt-4">
          <div className="flex gap-1">
            {TOUR_STEPS.map((_, i) => (
              <div
                key={i}
                className={cn(
                  "w-1.5 h-1.5 rounded-full transition-colors",
                  i === step ? "bg-primary" : "bg-muted-foreground/30"
                )}
              />
            ))}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" className="text-xs h-7" onClick={completeTour}>
              Skip
            </Button>
            <Button size="sm" className="text-xs h-7" onClick={handleNext}>
              {isLast ? "Got it!" : "Next"}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
