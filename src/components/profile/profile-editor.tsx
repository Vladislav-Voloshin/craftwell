"use client";

import { useState } from "react";
import clientLogger from "@/lib/client-logger";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { ProfileData, SurveyData } from "./profile-view";
import { toggleItem } from "@/lib/utils";
import { HEALTH_GOALS, EXERCISE_OPTIONS, SUPPLEMENT_OPTIONS, FOCUS_AREAS } from "@/lib/survey-constants";

interface ProfileEditorProps {
  profile: ProfileData | null;
  survey: SurveyData | null;
  onSave: (profile: ProfileData, survey: SurveyData) => void;
  onCancel: () => void;
}

export function ProfileEditor({ profile, survey, onSave, onCancel }: ProfileEditorProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Profile fields
  const [displayName, setDisplayName] = useState(profile?.display_name || "");
  const [firstName, setFirstName] = useState(profile?.first_name || "");
  const [lastName, setLastName] = useState(profile?.last_name || "");
  const [age, setAge] = useState<number | "">(profile?.age ?? "");

  // Survey fields
  const [healthGoals, setHealthGoals] = useState<string[]>(survey?.health_goals || []);
  const [sleepQuality, setSleepQuality] = useState(survey?.sleep_quality || 5);
  const [exerciseFrequency, setExerciseFrequency] = useState(survey?.exercise_frequency || "");
  const [stressLevel, setStressLevel] = useState(survey?.stress_level || 5);
  const [supplementExperience, setSupplementExperience] = useState(survey?.supplement_experience || "");
  const [focusAreas, setFocusAreas] = useState<string[]>(survey?.focus_areas || []);


  async function handleSave() {
    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile: {
            display_name: displayName || null,
            first_name: firstName || null,
            last_name: lastName || null,
            age: age === "" ? null : Number(age),
          },
          survey: {
            health_goals: healthGoals,
            sleep_quality: sleepQuality,
            exercise_frequency: exerciseFrequency,
            stress_level: stressLevel,
            supplement_experience: supplementExperience,
            focus_areas: focusAreas,
          },
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to save");
        setSaving(false);
        return;
      }

      setSuccess(true);
      setTimeout(() => {
        onSave(
          {
            ...profile!,
            display_name: displayName || null,
            first_name: firstName || null,
            last_name: lastName || null,
            age: age === "" ? null : Number(age),
          },
          {
            health_goals: healthGoals,
            sleep_quality: sleepQuality,
            exercise_frequency: exerciseFrequency,
            stress_level: stressLevel,
            supplement_experience: supplementExperience,
            focus_areas: focusAreas,
          }
        );
      }, 600);
    } catch (err) {
      setError("Network error. Please try again.");
      clientLogger.error("[ProfileEditor] Save failed:", err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Edit Profile</h1>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>

      {/* Account Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm text-muted-foreground block mb-1">Display Name</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your name"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm text-muted-foreground block mb-1">First Name</label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="First name"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div>
              <label className="text-sm text-muted-foreground block mb-1">Last Name</label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Last name"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>
          <div>
            <label className="text-sm text-muted-foreground block mb-1">Age</label>
            <input
              type="number"
              value={age}
              onChange={(e) => setAge(e.target.value === "" ? "" : Number(e.target.value))}
              placeholder="Your age"
              min={1}
              max={150}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Email</span>
            <span>{profile?.email}</span>
          </div>
        </CardContent>
      </Card>

      {/* Health Goals */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Health Goals</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2">
            {HEALTH_GOALS.map((goal) => (
              <button
                key={goal}
                onClick={() => setHealthGoals(toggleItem(healthGoals, goal))}
                className={`p-3 rounded-lg border text-sm text-left transition-colors ${
                  healthGoals.includes(goal)
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border hover:border-foreground/30"
                }`}
              >
                {goal}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Sleep & Stress */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sleep & Stress</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">Sleep Quality</label>
            <div className="flex items-center gap-4">
              <span className="text-xs text-muted-foreground">Poor</span>
              <input
                type="range"
                min="1"
                max="10"
                value={sleepQuality}
                onChange={(e) => setSleepQuality(Number(e.target.value))}
                className="flex-1"
              />
              <span className="text-xs text-muted-foreground">Excellent</span>
              <span className="font-mono font-bold text-lg w-8 text-center">{sleepQuality}</span>
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">Stress Level</label>
            <div className="flex items-center gap-4">
              <span className="text-xs text-muted-foreground">Low</span>
              <input
                type="range"
                min="1"
                max="10"
                value={stressLevel}
                onChange={(e) => setStressLevel(Number(e.target.value))}
                className="flex-1"
              />
              <span className="text-xs text-muted-foreground">High</span>
              <span className="font-mono font-bold text-lg w-8 text-center">{stressLevel}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Exercise & Supplements */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Exercise & Supplements</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">Exercise Frequency</label>
            <div className="grid grid-cols-2 gap-2">
              {EXERCISE_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  onClick={() => setExerciseFrequency(opt)}
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
          <Separator />
          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">Supplement Experience</label>
            <div className="grid grid-cols-1 gap-2">
              {SUPPLEMENT_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  onClick={() => setSupplementExperience(opt)}
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
        </CardContent>
      </Card>

      {/* Focus Areas */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Focus Areas</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2">
            {FOCUS_AREAS.map((area) => (
              <button
                key={area}
                onClick={() => setFocusAreas(toggleItem(focusAreas, area))}
                className={`p-3 rounded-lg border text-sm text-left transition-colors ${
                  focusAreas.includes(area)
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border hover:border-foreground/30"
                }`}
              >
                {area}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Save / Cancel */}
      {error && (
        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 text-sm">
          Profile saved successfully!
        </div>
      )}
      <div className="flex gap-3">
        <Button variant="outline" onClick={onCancel} className="flex-1">
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={saving} className="flex-1">
          {saving ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </div>
  );
}
