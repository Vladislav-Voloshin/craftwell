// @vitest-environment jsdom

/**
 * Component tests for ProtocolDetail.
 *
 * Sub-components and useProtocolCompletions are mocked so tests
 * focus on the conditional-rendering logic of ProtocolDetail itself.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// ── Mock hooks and sub-components ────────────────────────────────

const mockToggleToolCompletion = vi.fn();
const mockRefetch = vi.fn();

let mockCompletionsState = {
  completedToolIds: new Set<string>(),
  togglingToolId: null as string | null,
  streakData: null as null | { current_streak: number; longest_streak: number; total_days: number },
  toggleToolCompletion: mockToggleToolCompletion,
  refetch: mockRefetch,
};

vi.mock("./use-protocol-completions", () => ({
  useProtocolCompletions: vi.fn(() => mockCompletionsState),
}));

vi.mock("./protocol-header", () => ({
  ProtocolHeader: ({
    title,
    isActive,
    isLoggedIn,
    loading,
    onToggleProtocol,
  }: {
    title: string;
    isActive: boolean;
    isLoggedIn: boolean;
    loading: boolean;
    onToggleProtocol: () => void;
  }) => (
    <div data-testid="protocol-header" data-active={isActive} data-logged-in={isLoggedIn}>
      <h1>{title}</h1>
      <button
        data-testid="toggle-protocol-btn"
        onClick={onToggleProtocol}
        disabled={loading}
        aria-label={isActive ? "deactivate" : "activate"}
      >
        {isActive ? "Deactivate" : "Activate"}
      </button>
    </div>
  ),
}));

vi.mock("./protocol-progress", () => ({
  ProtocolProgress: ({
    completedCount,
    totalTools,
  }: {
    completedCount: number;
    totalTools: number;
  }) => (
    <div data-testid="protocol-progress" data-completed={completedCount} data-total={totalTools} />
  ),
}));

vi.mock("./protocol-checklist", () => ({
  ProtocolChecklist: ({ tools, isActive }: { tools: unknown[]; isActive: boolean }) => (
    <div data-testid="protocol-checklist" data-active={isActive} data-tools={tools.length} />
  ),
}));

vi.mock("./protocol-chat-cta", () => ({
  ProtocolChatCta: ({ protocolId }: { protocolId: string }) => (
    <div data-testid="protocol-chat-cta" data-protocol-id={protocolId} />
  ),
}));

vi.mock("./protocol-notes", () => ({
  ProtocolNotes: ({ protocolId }: { protocolId: string }) => (
    <div data-testid="protocol-notes" data-protocol-id={protocolId} />
  ),
}));

vi.mock("./favorite-button", () => ({
  FavoriteButton: ({
    protocolId,
    initialFavorited,
    isLoggedIn,
  }: {
    protocolId: string;
    initialFavorited: boolean;
    isLoggedIn: boolean;
  }) => (
    <button
      data-testid="favorite-button"
      data-protocol-id={protocolId}
      data-favorited={initialFavorited}
      data-logged-in={isLoggedIn}
    />
  ),
}));

vi.mock("@/components/ui/separator", () => ({
  Separator: () => <hr data-testid="separator" />,
}));

import { ProtocolDetail } from "./protocol-detail";
import type { Protocol, ProtocolTool } from "@/lib/types/database";

// ── Helpers ───────────────────────────────────────────────────────

const mockProtocol: Protocol = {
  id: "proto-1",
  title: "Morning Sunlight Protocol",
  description: "Get sunlight in the morning",
  category: "sleep",
  difficulty: "beginner",
  time_commitment: "10 min",
  slug: "morning-sunlight",
  created_at: "2026-01-01",
  updated_at: "2026-01-01",
  is_published: true,
  source_references: null,
  benefits: null,
  cover_image_url: null,
};

const mockTools: ProtocolTool[] = [
  {
    id: "tool-1",
    protocol_id: "proto-1",
    title: "Go outside",
    description: "Stand outside for 10 min",
    instructions: "Go outdoors shortly after waking.",
    effectiveness_rank: 1,
    timing: "Morning",
    duration: "10 minutes",
    frequency: "Daily",
    notes: null,
    created_at: "2026-01-01",
  },
  {
    id: "tool-2",
    protocol_id: "proto-1",
    title: "Avoid sunglasses",
    description: "Let light reach your eyes",
    instructions: "Avoid sunglasses when safe to do so.",
    effectiveness_rank: 2,
    timing: "Morning",
    duration: "10 minutes",
    frequency: "Daily",
    notes: null,
    created_at: "2026-01-01",
  },
];

// Stub global fetch so toggleProtocol doesn't fail
global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });

// ── Tests ─────────────────────────────────────────────────────────

describe("ProtocolDetail — basic rendering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCompletionsState = {
      completedToolIds: new Set(),
      togglingToolId: null,
      streakData: null,
      toggleToolCompletion: mockToggleToolCompletion,
      refetch: mockRefetch,
    };
  });

  it("renders protocol title via ProtocolHeader", () => {
    render(<ProtocolDetail protocol={mockProtocol} tools={mockTools} />);
    expect(screen.getByText("Morning Sunlight Protocol")).toBeTruthy();
  });

  it("renders FavoriteButton with protocol id", () => {
    render(
      <ProtocolDetail protocol={mockProtocol} tools={mockTools} isFavorited={true} isLoggedIn />
    );
    const btn = screen.getByTestId("favorite-button");
    expect(btn.getAttribute("data-protocol-id")).toBe("proto-1");
    expect(btn.getAttribute("data-favorited")).toBe("true");
  });

  it("renders ProtocolChecklist with tools", () => {
    render(<ProtocolDetail protocol={mockProtocol} tools={mockTools} />);
    const checklist = screen.getByTestId("protocol-checklist");
    expect(checklist.getAttribute("data-tools")).toBe("2");
  });

  it("deduplicates tool titles and keeps the highest-ranked version", () => {
    const duplicateTools = [
      { ...mockTools[0], id: "tool-duplicate", title: "  GO   OUTSIDE  ", effectiveness_rank: 3 },
      ...mockTools,
    ];

    render(<ProtocolDetail protocol={mockProtocol} tools={duplicateTools} />);

    const checklist = screen.getByTestId("protocol-checklist");
    expect(checklist.getAttribute("data-tools")).toBe("2");
  });

  it("renders ProtocolChatCta", () => {
    render(<ProtocolDetail protocol={mockProtocol} tools={mockTools} />);
    expect(screen.getByTestId("protocol-chat-cta")).toBeTruthy();
  });

  it("renders separator", () => {
    render(<ProtocolDetail protocol={mockProtocol} tools={mockTools} />);
    expect(screen.getByTestId("separator")).toBeTruthy();
  });
});

describe("ProtocolDetail — logged-in conditional rendering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCompletionsState = {
      completedToolIds: new Set(),
      togglingToolId: null,
      streakData: null,
      toggleToolCompletion: mockToggleToolCompletion,
      refetch: mockRefetch,
    };
  });

  it("shows ProtocolNotes when isLoggedIn=true", () => {
    render(<ProtocolDetail protocol={mockProtocol} tools={mockTools} isLoggedIn />);
    expect(screen.getByTestId("protocol-notes")).toBeTruthy();
  });

  it("hides ProtocolNotes when isLoggedIn=false", () => {
    render(<ProtocolDetail protocol={mockProtocol} tools={mockTools} isLoggedIn={false} />);
    expect(screen.queryByTestId("protocol-notes")).toBeNull();
  });

  it("hides ProtocolProgress when not active", () => {
    render(
      <ProtocolDetail
        protocol={mockProtocol}
        tools={mockTools}
        isLoggedIn
        isActive={false}
      />
    );
    expect(screen.queryByTestId("protocol-progress")).toBeNull();
  });

  it("hides ProtocolProgress when not logged in", () => {
    render(
      <ProtocolDetail
        protocol={mockProtocol}
        tools={mockTools}
        isLoggedIn={false}
        isActive
      />
    );
    expect(screen.queryByTestId("protocol-progress")).toBeNull();
  });

  it("shows ProtocolProgress when isLoggedIn and isActive with tools", () => {
    mockCompletionsState = {
      ...mockCompletionsState,
      completedToolIds: new Set(["tool-1"]),
    };
    render(
      <ProtocolDetail
        protocol={mockProtocol}
        tools={mockTools}
        isLoggedIn
        isActive
      />
    );
    const progress = screen.getByTestId("protocol-progress");
    expect(progress).toBeTruthy();
    expect(progress.getAttribute("data-completed")).toBe("1");
    expect(progress.getAttribute("data-total")).toBe("2");
  });

  it("hides ProtocolProgress when tools list is empty (even if isLoggedIn+isActive)", () => {
    render(
      <ProtocolDetail
        protocol={mockProtocol}
        tools={[]}
        isLoggedIn
        isActive
      />
    );
    expect(screen.queryByTestId("protocol-progress")).toBeNull();
  });
});

describe("ProtocolDetail — toggle protocol action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCompletionsState = {
      completedToolIds: new Set(),
      togglingToolId: null,
      streakData: null,
      toggleToolCompletion: mockToggleToolCompletion,
      refetch: mockRefetch,
    };
    vi.mocked(global.fetch).mockResolvedValue({ ok: true, json: async () => ({}) } as Response);
  });

  it("toggles isActive state from false to true on successful fetch", async () => {
    render(
      <ProtocolDetail protocol={mockProtocol} tools={mockTools} isLoggedIn isActive={false} />
    );
    const header = screen.getByTestId("protocol-header");
    expect(header.getAttribute("data-active")).toBe("false");

    fireEvent.click(screen.getByTestId("toggle-protocol-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("protocol-header").getAttribute("data-active")).toBe("true");
    });

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/protocols/user",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ protocol_id: "proto-1", action: "activate" }),
      })
    );
  });

  it("toggles isActive from true to false on deactivate", async () => {
    render(
      <ProtocolDetail protocol={mockProtocol} tools={mockTools} isLoggedIn isActive />
    );
    fireEvent.click(screen.getByTestId("toggle-protocol-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("protocol-header").getAttribute("data-active")).toBe("false");
    });
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/protocols/user",
      expect.objectContaining({
        body: JSON.stringify({ protocol_id: "proto-1", action: "deactivate" }),
      })
    );
  });

  it("does not change active state when fetch returns not ok", async () => {
    vi.mocked(global.fetch).mockResolvedValue({ ok: false } as Response);
    render(
      <ProtocolDetail protocol={mockProtocol} tools={mockTools} isLoggedIn isActive={false} />
    );
    fireEvent.click(screen.getByTestId("toggle-protocol-btn"));
    await waitFor(() => {
      // State should remain false
      expect(screen.getByTestId("protocol-header").getAttribute("data-active")).toBe("false");
    });
  });

  it("calls refetch when activating (not when deactivating)", async () => {
    render(
      <ProtocolDetail protocol={mockProtocol} tools={mockTools} isLoggedIn isActive={false} />
    );
    fireEvent.click(screen.getByTestId("toggle-protocol-btn"));
    await waitFor(() => {
      expect(mockRefetch).toHaveBeenCalledTimes(1);
    });
  });

  it("does not call refetch when deactivating", async () => {
    render(
      <ProtocolDetail protocol={mockProtocol} tools={mockTools} isLoggedIn isActive />
    );
    fireEvent.click(screen.getByTestId("toggle-protocol-btn"));
    await waitFor(() => {
      expect(mockRefetch).not.toHaveBeenCalled();
    });
  });
});
