"use client";

import { HEALTH_GOALS, FOCUS_AREAS } from "@/lib/survey-constants";

interface StepGoalsFocusProps {
  selectedGoals: string[];
  selectedFocusAreas: string[];
  onToggleGoal: (goal: string) => void;
  onToggleFocusArea: (area: string) => void;
}

export function StepGoalsFocus({
  selectedGoals,
  selectedFocusAreas,
  onToggleGoal,
  onToggleFocusArea,
}: StepGoalsFocusProps) {
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h2 className="text-xl font-semibold">What are your health goals?</h2>
        <p className="text-muted-foreground text-sm">Select all that apply</p>
        <div className="grid grid-cols-2 gap-2">
          {HEALTH_GOALS.map((goal) => (
            <button
              key={goal}
              onClick={() => onToggleGoal(goal)}
              className={`p-3 rounded-lg border text-sm text-left transition-colors ${
                selectedGoals.includes(goal)
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border hover:border-foreground/30"
              }`}
            >
              {goal}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="text-xl font-semibold">What topics interest you?</h2>
        <p className="text-muted-foreground text-sm">We&apos;ll prioritize protocols in these areas</p>
        <div className="grid grid-cols-2 gap-2">
          {FOCUS_AREAS.map((area) => (
            <button
              key={area}
              onClick={() => onToggleFocusArea(area)}
              className={`p-3 rounded-lg border text-sm text-left transition-colors ${
                selectedFocusAreas.includes(area)
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border hover:border-foreground/30"
              }`}
            >
              {area}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
