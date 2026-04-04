"use client";

import { useState, useCallback } from "react";
import type { ChatSession, Message } from "./types";

interface UseChatSessionsOptions {
  initialSessions: ChatSession[];
}

interface UseChatSessionsReturn {
  sessions: ChatSession[];
  setSessions: React.Dispatch<React.SetStateAction<ChatSession[]>>;
  activeSession: string | null;
  setActiveSession: React.Dispatch<React.SetStateAction<string | null>>;
  loadingSession: boolean;
  loadSession: (sessionId: string, onBeforeLoad?: () => void) => Promise<{ messages: (Message & { id: string })[] } | null>;
  startNewChat: (onBeforeStart?: () => void) => void;
  renameSession: (sessionId: string, title: string) => Promise<boolean>;
  deleteSession: (sessionId: string) => Promise<boolean>;
}

export function useChatSessions({
  initialSessions,
}: UseChatSessionsOptions): UseChatSessionsReturn {
  const [sessions, setSessions] = useState<ChatSession[]>(initialSessions);
  const [activeSession, setActiveSession] = useState<string | null>(null);
  const [loadingSession, setLoadingSession] = useState(false);

  const loadSession = useCallback(
    async (sessionId: string, onBeforeLoad?: () => void) => {
      onBeforeLoad?.();
      setLoadingSession(true);
      try {
        const res = await fetch(`/api/chat/sessions?session_id=${sessionId}`);
        if (res.ok) {
          const data = await res.json();
          setActiveSession(sessionId);
          return data;
        }
        return null;
      } finally {
        setLoadingSession(false);
      }
    },
    []
  );

  const startNewChat = useCallback((onBeforeStart?: () => void) => {
    onBeforeStart?.();
    setActiveSession(null);
  }, []);

  const renameSession = useCallback(
    async (sessionId: string, title: string) => {
      const res = await fetch("/api/chat/sessions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, title }),
      });
      if (res.ok) {
        setSessions((prev) =>
          prev.map((s) => (s.id === sessionId ? { ...s, title } : s))
        );
        return true;
      }
      return false;
    },
    []
  );

  const deleteSession = useCallback(
    async (sessionId: string) => {
      const res = await fetch(`/api/chat/sessions?id=${sessionId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setSessions((prev) => prev.filter((s) => s.id !== sessionId));
        return true;
      }
      return false;
    },
    []
  );

  return {
    sessions,
    setSessions,
    activeSession,
    setActiveSession,
    loadingSession,
    loadSession,
    startNewChat,
    renameSession,
    deleteSession,
  };
}
