"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { toggleItem } from "@/lib/utils";
import clientLogger from "@/lib/client-logger";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StepHealthGoals } from "@/components/onboarding/step-health-goals";
import { StepSleepStress } from "@/components/onboarding/step-sleep-stress";
import { StepExerciseSupplements } from "@/components/onboarding/step-exercise-supplements";
import { StepFocusAreas } from "@/components/onboarding/step-focus-areas";

const TOTAL_STEPS = 4;

export default function OnboardingPage() {
  const router = useRouter();
  const supabase = createClient();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedGoals, setSelectedGoals] = useState<string[]>([]);
  const [sleepQuality, setSleepQuality] = useState(5);
  const [exerciseFrequency, setExerciseFrequency] = useState("");
  const [stressLevel, setStressLevel] = useState(5);
  const [supplementExperience, setSupplementExperience] = useState("");
  const [selectedFocusAreas, setSelectedFocusAreas] = useState<string[]>([]);


  async function handleComplete() {
    setLoading(true);
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setError("Please sign in to continue."); setLoading(false); return; }

      const { error: surveyError } = await supabase.from("survey_responses").upsert({
        user_id: user.id,
        health_goals: selectedGoals,
        sleep_quality: sleepQuality,
        exercise_frequency: exerciseFrequency,
        stress_level: stressLevel,
        supplement_experience: supplementExperience,
        focus_areas: selectedFocusAreas,
      }, { onConflict: "user_id" });

      if (surveyError) {
        clientLogger.error("Survey save error:", surveyError);
        setError("Failed to save your preferences. Please try again.");
        setLoading(false);
        return;
      }

      const { error: userError } = await supabase.from("users").upsert({
        id: user.id,
        email: user.email || null,
        onboarding_completed: true,
      }, { onConflict: "id" });

      if (userError) {
        clientLogger.error("User update error:", userError);
        setError("Failed to complete setup. Please try again.");
        setLoading(false);
        return;
      }

      router.push("/protocols?tour=1");
    } catch (err) {
      clientLogger.error("Onboarding error:", err);
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  const steps = [
    <StepHealthGoals
      key="goals"
      selectedGoals={selectedGoals}
      onToggle={(goal) => setSelectedGoals(toggleItem(selectedGoals, goal))}
    />,
    <StepSleepStress
      key="sleep"
      sleepQuality={sleepQuality}
      stressLevel={stressLevel}
      onSleepChange={setSleepQuality}
      onStressChange={setStressLevel}
    />,
    <StepExerciseSupplements
      key="exercise"
      exerciseFrequency={exerciseFrequency}
      supplementExperience={supplementExperience}
      onExerciseChange={setExerciseFrequency}
      onSupplementChange={setSupplementExperience}
    />,
    <StepFocusAreas
      key="focus"
      selectedAreas={selectedFocusAreas}
      onToggle={(area) => setSelectedFocusAreas(toggleItem(selectedFocusAreas, area))}
    />,
  ];

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-8">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center gap-2 mb-2">
            {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
              <div
                key={i}
                className={`h-1 flex-1 rounded-full transition-colors ${
                  i <= step ? "bg-primary" : "bg-muted"
                }`}
              />
            ))}
          </div>
          <CardTitle>
            Step {step + 1} of {TOTAL_STEPS}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {steps[step]}
          {error && (
            <p className="text-sm text-destructive text-center">{error}</p>
          )}
          <div className="flex gap-3">
            {step > 0 && (
              <Button variant="outline" onClick={() => setStep((s) => s - 1)} className="flex-1">
                Back
              </Button>
            )}
            {step < TOTAL_STEPS - 1 ? (
              <Button onClick={() => setStep((s) => s + 1)} className="flex-1">
                Next
              </Button>
            ) : (
              <Button onClick={handleComplete} disabled={loading} className="flex-1">
                {loading ? "Saving..." : "Start Exploring"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
