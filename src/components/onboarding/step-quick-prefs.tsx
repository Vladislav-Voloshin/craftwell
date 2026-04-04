"use client";

import { EXERCISE_OPTIONS, SUPPLEMENT_OPTIONS } from "@/lib/survey-constants";

interface StepQuickPrefsProps {
  sleepQuality: number;
  stressLevel: number;
  exerciseFrequency: string;
  supplementExperience: string;
  onSleepChange: (value: number) => void;
  onStressChange: (value: number) => void;
  onExerciseChange: (value: string) => void;
  onSupplementChange: (value: string) => void;
}

export function StepQuickPrefs({
  sleepQuality,
  stressLevel,
  exerciseFrequency,
  supplementExperience,
  onSleepChange,
  onStressChange,
  onExerciseChange,
  onSupplementChange,
}: StepQuickPrefsProps) {
  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Quick preferences</h2>
        <p className="text-muted-foreground text-sm">Help us fine-tune your recommendations</p>

        <div className="space-y-3">
          <p className="text-sm font-medium">Sleep quality</p>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground w-8">Poor</span>
            <input
              type="range"
              min="1"
              max="10"
              value={sleepQuality}
              onChange={(e) => onSleepChange(Number(e.target.value))}
              className="flex-1"
            />
            <span className="text-sm text-muted-foreground w-12">Excellent</span>
            <span className="font-mono font-bold text-lg w-8 text-center">{sleepQuality}</span>
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-sm font-medium">Stress level</p>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground w-8">Low</span>
            <input
              type="range"
              min="1"
              max="10"
              value={stressLevel}
              onChange={(e) => onStressChange(Number(e.target.value))}
              className="flex-1"
            />
            <span className="text-sm text-muted-foreground w-12">High</span>
            <span className="font-mono font-bold text-lg w-8 text-center">{stressLevel}</span>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-sm font-medium">How often do you exercise?</p>
        <div className="grid grid-cols-2 gap-2">
          {EXERCISE_OPTIONS.map((opt) => (
            <button
              key={opt}
              onClick={() => onExerciseChange(opt)}
              className={`p-3 rounded-lg border text-sm transition-colors ${
                exerciseFrequency === opt
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border hover:border-foreground/30"
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-sm font-medium">Supplement experience</p>
        <div className="grid grid-cols-1 gap-2">
          {SUPPLEMENT_OPTIONS.map((opt) => (
            <button
              key={opt}
              onClick={() => onSupplementChange(opt)}
              className={`p-3 rounded-lg border text-sm text-left transition-colors ${
                supplementExperience === opt
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border hover:border-foreground/30"
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
