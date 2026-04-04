"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import clientLogger from "@/lib/client-logger";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from "@/components/ui/dialog";
import { ProfileEditor } from "./profile-editor";
import { Achievements } from "./achievements";
import { ExportButton } from "@/components/protocols/export-button";
import type { SurveyResponse } from "@/lib/types/database";

interface UserProtocol {
  id: string;
  is_active: boolean;
  started_at: string;
  protocols: { id: string; title: string; slug: string; category: string; description: string };
}

export interface ProfileData {
  email: string;
  display_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  age?: number | null;
  phone?: string | null;
  created_at: string;
}

export type SurveyData = Pick<
  SurveyResponse,
  "health_goals" | "sleep_quality" | "exercise_frequency" | "stress_level" | "supplement_experience" | "focus_areas"
>;

interface ProfileViewProps {
  profile: ProfileData | null;
  survey: SurveyData | null;
  activeProtocols: UserProtocol[];
}

export function ProfileView({
  profile: initialProfile,
  survey: initialSurvey,
  activeProtocols,
}: ProfileViewProps) {
  const router = useRouter();
  const supabase = createClient();
  const [profile, setProfile] = useState(initialProfile);
  const [survey, setSurvey] = useState(initialSurvey);
  const [editing, setEditing] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [streaks, setStreaks] = useState<{ protocol_title: string; streak: number; longest_streak: number; total_days: number }[]>([]);

  const fetchStreaks = useCallback(async () => {
    if (activeProtocols.length === 0) return;
    const results = await Promise.all(
      activeProtocols.map(async (up) => {
        try {
          const tz = new Date().getTimezoneOffset();
          const res = await fetch(`/api/protocols/completions?protocol_id=${up.protocols.id}&type=streaks&tz_offset=${tz}`);
          if (res.ok) {
            const data = await res.json();
            return { protocol_title: up.protocols.title, ...data };
          }
        } catch (err) {
          clientLogger.warn("[Profile] Failed to fetch streaks:", err);
        }
        return { protocol_title: up.protocols.title, streak: 0, longest_streak: 0, total_days: 0 };
      })
    );
    setStreaks(results);
  }, [activeProtocols]);

  useEffect(() => { fetchStreaks(); }, [fetchStreaks]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/");
  }

  async function handleDeleteAccount() {
    setDeleting(true);
    setDeleteError("");
    try {
      const res = await fetch("/api/profile", { method: "DELETE" });
      if (res.ok) {
        await supabase.auth.signOut();
        window.location.href = "/auth";
      } else {
        const data = await res.json();
        setDeleteError(data.error || "Failed to delete account");
      }
    } catch {
      setDeleteError("Something went wrong. Please try again.");
    } finally {
      setDeleting(false);
    }
  }

  function handleSave(updatedProfile: ProfileData, updatedSurvey: SurveyData) {
    setProfile(updatedProfile);
    setSurvey(updatedSurvey);
    setEditing(false);
  }

  const totalCompletionDays = streaks.reduce((sum, s) => sum + s.total_days, 0);
  const bestStreak = Math.max(0, ...streaks.map((s) => s.longest_streak));

  const displayName = profile?.display_name
    || [profile?.first_name, profile?.last_name].filter(Boolean).join(" ")
    || null;

  if (editing) {
    return (
      <ProfileEditor
        profile={profile}
        survey={survey}
        onSave={handleSave}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-semibold text-sm shrink-0">
            {displayName
              ? displayName.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
              : profile?.email?.[0]?.toUpperCase() ?? "?"}
          </div>
          <div>
            <h1 className="text-2xl font-bold">{displayName ?? "Profile"}</h1>
            {displayName && (
              <p className="text-sm text-muted-foreground">{profile?.email}</p>
            )}
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
          Edit Profile
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {displayName && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Name</span>
              <span>{displayName}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted-foreground">Email</span>
            <span>{profile?.email}</span>
          </div>
          {profile?.age && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Age</span>
              <span>{profile.age}</span>
            </div>
          )}
          {profile?.phone && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Phone</span>
              <span>{profile.phone}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted-foreground">Member since</span>
            <span>
              {profile?.created_at
                ? new Date(profile.created_at).toLocaleDateString()
                : "—"}
            </span>
          </div>
        </CardContent>
      </Card>

      {survey && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Health Profile</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setEditing(true)} className="text-xs">
                Edit
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <span className="text-sm text-muted-foreground">Goals</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {survey.health_goals.map((g) => (
                  <Badge key={g} variant="secondary">{g}</Badge>
                ))}
              </div>
            </div>
            <Separator />
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-muted-foreground">Sleep Quality</span>
                <p className="font-medium">{survey.sleep_quality}/10</p>
              </div>
              <div>
                <span className="text-muted-foreground">Stress Level</span>
                <p className="font-medium">{survey.stress_level}/10</p>
              </div>
              <div>
                <span className="text-muted-foreground">Exercise</span>
                <p className="font-medium">{survey.exercise_frequency}</p>
              </div>
              {survey.supplement_experience && (
                <div>
                  <span className="text-muted-foreground">Supplements</span>
                  <p className="font-medium">{survey.supplement_experience}</p>
                </div>
              )}
            </div>
            <Separator />
            <div>
              <span className="text-sm text-muted-foreground">Focus Areas</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {survey.focus_areas.map((a) => (
                  <Badge key={a} variant="outline">{a}</Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">My Protocol Stack</CardTitle>
        </CardHeader>
        <CardContent>
          {activeProtocols.length === 0 ? (
            <div className="text-center py-4">
              <p className="text-sm text-muted-foreground">
                No active protocols yet. Browse protocols and add them to your daily stack.
              </p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => router.push("/protocols")}>
                Browse Protocols
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {activeProtocols.map((up) => (
                <div
                  key={up.id}
                  className="flex items-center gap-3 p-3 rounded-lg border border-border/40 hover:border-border transition-colors cursor-pointer"
                  onClick={() => router.push(`/protocols/${up.protocols.slug}`)}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{up.protocols.title}</p>
                    <p className="text-xs text-muted-foreground truncate">{up.protocols.description}</p>
                  </div>
                  <Badge variant="secondary" className="shrink-0">{up.protocols.category}</Badge>
                </div>
              ))}
              <p className="text-xs text-muted-foreground text-center pt-2">
                Added {activeProtocols.length} protocol{activeProtocols.length !== 1 ? "s" : ""} to your stack
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {activeProtocols.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Streaks & Stats</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="p-3 rounded-lg bg-muted">
                <p className="text-2xl font-bold">{activeProtocols.length}</p>
                <p className="text-xs text-muted-foreground">Active Protocols</p>
              </div>
              <div className="p-3 rounded-lg bg-muted">
                <p className="text-2xl font-bold">{totalCompletionDays}</p>
                <p className="text-xs text-muted-foreground">Total Days</p>
              </div>
              <div className="p-3 rounded-lg bg-muted">
                <p className="text-2xl font-bold">{bestStreak}</p>
                <p className="text-xs text-muted-foreground">Best Streak</p>
              </div>
            </div>
            {streaks.length > 0 && (
              <div className="space-y-2">
                <Separator />
                {streaks.map((s, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="truncate flex-1 min-w-0 pr-2">{s.protocol_title}</span>
                    <div className="flex items-center gap-3 shrink-0">
                      {s.streak > 0 && (
                        <Badge variant="secondary" className="bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 text-xs">
                          {s.streak}d streak
                        </Badge>
                      )}
                      <span className="text-xs text-muted-foreground">{s.total_days}d total</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Achievements />

      <div className="flex gap-2">
        <ExportButton />
        <Button variant="outline" onClick={handleSignOut} className="flex-1">
          Sign Out
        </Button>
      </div>

      <Separator />

      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="text-base text-destructive">Danger Zone</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Permanently delete your account and all associated data including chat history,
            protocol progress, and health profile. This action cannot be undone.
          </p>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => { setDeleteDialogOpen(true); setDeleteConfirm(""); setDeleteError(""); }}
          >
            Delete Account
          </Button>
        </CardContent>
      </Card>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete your account?</DialogTitle>
            <DialogDescription>
              This will permanently delete all your data: chat sessions, protocol progress,
              health survey, and profile. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-sm">
              Type <strong>DELETE</strong> to confirm:
            </p>
            <Input
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              placeholder="Type DELETE to confirm"
              className="font-mono"
            />
            {deleteError && (
              <p className="text-sm text-destructive">{deleteError}</p>
            )}
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              Cancel
            </DialogClose>
            <Button
              variant="destructive"
              disabled={deleteConfirm !== "DELETE" || deleting}
              onClick={handleDeleteAccount}
            >
              {deleting ? "Deleting..." : "Permanently Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
