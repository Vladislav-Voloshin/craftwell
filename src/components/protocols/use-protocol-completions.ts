"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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
  const mutationVersion = useRef(0);

  const fetchCompletions = useCallback(async () => {
    if (!isLoggedIn || !isActive) return;
    const versionAtRequestStart = mutationVersion.current;
    try {
      const tz = new Date().getTimezoneOffset();
      const res = await fetch(`/api/protocols/completions?protocol_id=${protocolId}&tz_offset=${tz}`);
      if (res.ok) {
        const data = await res.json();
        // A slower initial GET must not overwrite a newer successful toggle.
        if (mutationVersion.current === versionAtRequestStart) {
          setCompletedToolIds(new Set(data.completed_tool_ids));
        }
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
    mutationVersion.current += 1;
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
        const data = (await res.json()) as {
          status: "completed" | "uncompleted";
        };
        // Invalidate reads that may have started while this mutation was in flight.
        mutationVersion.current += 1;
        setCompletedToolIds((prev) => {
          const next = new Set(prev);
          if (data.status === "completed") {
            next.add(toolId);
          } else {
            next.delete(toolId);
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
