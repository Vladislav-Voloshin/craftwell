"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useChatSessions } from "./use-chat-sessions";
import type { Message, ChatSession } from "./types";
import clientLogger from "@/lib/client-logger";

interface UseChatStreamOptions {
  userId: string;
  initialSessions: ChatSession[];
  initialProtocolId?: string;
}

export function useChatStream({ initialSessions, initialProtocolId }: UseChatStreamOptions) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [protocolId, setProtocolId] = useState<string | undefined>(initialProtocolId);
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const {
    sessions,
    setSessions,
    activeSession,
    setActiveSession,
    loadingSession,
    loadSession: loadSessionBase,
    startNewChat: startNewChatBase,
    renameSession,
    deleteSession: deleteSessionBase,
  } = useChatSessions({ initialSessions });

  // Abort any in-flight stream on unmount (navigation away)
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    });
  }, []);

  const loadSession = useCallback(
    async (sessionId: string) => {
      const data = await loadSessionBase(sessionId, () => {
        abortRef.current?.abort();
      });
      if (data) {
        setMessages(
          data.messages.map((m: Message & { id: string }) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            sources: m.sources,
            created_at: m.created_at,
          }))
        );
      }
    },
    [loadSessionBase]
  );

  const startNewChat = useCallback(() => {
    startNewChatBase(() => {
      abortRef.current?.abort();
    });
    setMessages([]);
    setProtocolId(undefined);
  }, [startNewChatBase]);

  const deleteSession = useCallback(
    async (sessionId: string) => {
      const ok = await deleteSessionBase(sessionId);
      if (ok && activeSession === sessionId) {
        abortRef.current?.abort();
        setMessages([]);
        setLoading(false);
        setStreamingId(null);
      }
      return ok;
    },
    [deleteSessionBase, activeSession]
  );

  const sendMessage = useCallback(async () => {
    if (!input.trim() || loading) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: input.trim(),
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    const assistantId = crypto.randomUUID();
    setStreamingId(assistantId);

    setMessages((prev) => [
      ...prev,
      { id: assistantId, role: "assistant", content: "", created_at: new Date().toISOString() },
    ]);

    try {
      // Abort any previous in-flight stream before starting a new one
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessage.content,
          session_id: activeSession,
          protocol_id: !activeSession ? protocolId : undefined,
        }),
        signal: controller.signal,
      });

      // Clear protocol context after first message creates the session
      if (protocolId && !activeSession) {
        setProtocolId(undefined);
      }

      if (!res.ok || !res.body) throw new Error("Stream failed");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6);
          try {
            const event = JSON.parse(json);

            if (event.type === "meta") {
              if (event.session_id && !activeSession) {
                setActiveSession(event.session_id);
                setSessions((prev) => [
                  {
                    id: event.session_id,
                    title: userMessage.content.slice(0, 50),
                    protocol_id: null,
                    created_at: new Date().toISOString(),
                  },
                  ...prev,
                ]);
              }
              if (event.sources) {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId ? { ...m, sources: event.sources } : m
                  )
                );
              }
            } else if (event.type === "text") {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, content: m.content + event.text } : m
                )
              );
              scrollToBottom();
            } else if (event.type === "error") {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, content: "Sorry, something went wrong. Please try again.", sources: undefined }
                    : m
                )
              );
            }
          } catch {
            // Skip malformed SSE JSON chunks (expected during streaming)
          }
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      clientLogger.error("[Chat] Stream error:", err);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: "Sorry, something went wrong. Please try again.", sources: undefined }
            : m
        )
      );
    } finally {
      abortRef.current = null;
      setLoading(false);
      setStreamingId(null);
    }
  }, [input, loading, activeSession, protocolId, scrollToBottom, setActiveSession, setSessions]);

  return {
    messages,
    input,
    setInput,
    loading,
    activeSession,
    protocolId,
    streamingId,
    sessions,
    loadingSession,
    scrollRef,
    scrollToBottom,
    loadSession,
    startNewChat,
    sendMessage,
    renameSession,
    deleteSession,
  };
}
