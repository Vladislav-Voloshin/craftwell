"use client";

import { useMemo, useState } from "react";
import { Separator } from "@/components/ui/separator";
import { ProtocolHeader } from "./protocol-header";
import { ProtocolProgress } from "./protocol-progress";
import { ProtocolChecklist } from "./protocol-checklist";
import { ProtocolChatCta } from "./protocol-chat-cta";
import { ProtocolNotes } from "./protocol-notes";
import { FavoriteButton } from "./favorite-button";
import { useProtocolCompletions } from "./use-protocol-completions";
import type { Protocol, ProtocolTool } from "@/lib/types/database";

export function ProtocolDetail({
  protocol,
  tools,
  isActive: initialActive = false,
  isFavorited: initialFavorited = false,
  isLoggedIn = false,
}: {
  protocol: Protocol;
  tools: ProtocolTool[];
  isActive?: boolean;
  isFavorited?: boolean;
  isLoggedIn?: boolean;
}) {
  const [isActive, setIsActive] = useState(initialActive);
  const [loading, setLoading] = useState(false);

  const { completedToolIds, togglingToolId, streakData, toggleToolCompletion, refetch } =
    useProtocolCompletions(protocol.id, isLoggedIn, isActive);

  const uniqueTools = useMemo(() => {
    const byTitle = new Map<string, { tool: ProtocolTool; index: number }>();

    tools.forEach((tool, index) => {
      const normalizedTitle = tool.title.trim().toLocaleLowerCase().replace(/\s+/g, " ");
      const key = normalizedTitle || tool.id;
      const existing = byTitle.get(key);

      if (!existing || tool.effectiveness_rank < existing.tool.effectiveness_rank) {
        byTitle.set(key, { tool, index });
      }
    });

    return [...byTitle.values()]
      .sort(
        (a, b) =>
          a.tool.effectiveness_rank - b.tool.effectiveness_rank || a.index - b.index
      )
      .map(({ tool }) => tool);
  }, [tools]);

  async function toggleProtocol() {
    setLoading(true);
    try {
      const res = await fetch("/api/protocols/user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          protocol_id: protocol.id,
          action: isActive ? "deactivate" : "activate",
        }),
      });
      if (res.ok) {
        const newActive = !isActive;
        setIsActive(newActive);
        if (newActive) refetch();
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <ProtocolHeader
            title={protocol.title}
            description={protocol.description}
            difficulty={protocol.difficulty}
            timeCommitment={protocol.time_commitment}
            streakData={streakData}
            isLoggedIn={isLoggedIn}
            isActive={isActive}
            loading={loading}
            onToggleProtocol={toggleProtocol}
          />
        </div>
        <FavoriteButton
          protocolId={protocol.id}
          initialFavorited={initialFavorited}
          isLoggedIn={isLoggedIn}
          size="md"
        />
      </div>

      <Separator />

      {isLoggedIn && isActive && uniqueTools.length > 0 && (
        <ProtocolProgress completedCount={completedToolIds.size} totalTools={uniqueTools.length} streakData={streakData} />
      )}

      <ProtocolChecklist
        tools={uniqueTools}
        isLoggedIn={isLoggedIn}
        isActive={isActive}
        completedToolIds={completedToolIds}
        togglingToolId={togglingToolId}
        onToggle={toggleToolCompletion}
      />

      {isLoggedIn && <ProtocolNotes protocolId={protocol.id} />}

      <ProtocolChatCta protocolId={protocol.id} />
    </div>
  );
}
