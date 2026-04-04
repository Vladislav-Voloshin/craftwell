"use client";

import { useState, useEffect, useCallback } from "react";
import type { StreaksResponse as StreakData } from "@/lib/types/database";
import clientLogger from "@/lib/client-logger";

export function useProtocolCompletions(
  protocolId: string,
  isLoggedIn: boolean,
  isActive: boolean
) {
  const [completedToolIds, setCompletedToolIds] = useState<Set<string>>(new Set());
  const [togglingToolId, setTogglingToolId] = useState<string | null>(null);
  const [streakData, setStreakData] = useState<StreakData | null>(null);

  const fetchCompletions = useCallback(async () => {
    if (!isLoggedIn || !isActive) return;
    try {
      const tz = new Date().getTimezoneOffset();
      const res = await fetch(`/api/protocols/completions?protocol_id=${protocolId}&tz_offset=${tz}`);
      if (res.ok) {
        const data = await res.json();
        setCompletedToolIds(new Set(data.completed_tool_ids));
      }
    } catch (err) {
      clientLogger.warn("[Completions] Failed to fetch:", err);
    }
  }, [isLoggedIn, isActive, protocolId]);

  const fetchStreaks = useCallback(async () => {
    if (!isLoggedIn || !isActive) return;
    try {
      const tz = new Date().getTimezoneOffset();
      const res = await fetch(`/api/protocols/completions?protocol_id=${protocolId}&type=streaks&tz_offset=${tz}`);
      if (res.ok) {
        const data = await res.json();
        setStreakData(data);
      }
    } catch (err) {
      clientLogger.warn("[Streaks] Failed to fetch:", err);
    }
  }, [isLoggedIn, isActive, protocolId]);

  useEffect(() => {
    fetchCompletions();
    fetchStreaks();
  }, [fetchCompletions, fetchStreaks]);

  async function toggleToolCompletion(toolId: string) {
    setTogglingToolId(toolId);
    try {
      const res = await fetch("/api/protocols/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          protocol_id: protocolId,
          tool_id: toolId,
          tz_offset: new Date().getTimezoneOffset(),
        }),
      });
      if (res.ok) {
        setCompletedToolIds((prev) => {
          const next = new Set(prev);
          if (next.has(toolId)) {
            next.delete(toolId);
          } else {
            next.add(toolId);
          }
          return next;
        });
        fetchStreaks();
      }
    } finally {
      setTogglingToolId(null);
    }
  }

  return {
    completedToolIds,
    togglingToolId,
    streakData,
    toggleToolCompletion,
    refetch: () => { fetchCompletions(); fetchStreaks(); },
  };
}
