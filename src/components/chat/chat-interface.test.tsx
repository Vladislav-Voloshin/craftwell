// @vitest-environment jsdom

/**
 * Component tests for ChatInterface.
 *
 * All sub-components and the useChatStream hook are mocked so that
 * we're testing only the conditional-rendering logic of ChatInterface
 * itself without touching DOM-heavy Radix primitives.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// ── Mock heavy sub-components and hooks ──────────────────────────

const mockStartNewChat = vi.fn();
const mockLoadSession = vi.fn();
const mockSetInput = vi.fn();
const mockSendMessage = vi.fn();
const mockScrollToBottom = vi.fn();
const mockRenameSession = vi.fn();
const mockDeleteSession = vi.fn();

// Default useChatStream return — can be overridden per-test
let mockChatStreamState = {
  messages: [] as { id: string; role: string; content: string }[],
  input: "",
  setInput: mockSetInput,
  loading: false,
  activeSession: null as string | null,
  protocolId: null as string | null,
  streamingId: null as string | null,
  sessions: [] as { id: string; title: string }[],
  loadingSession: null as string | null,
  scrollRef: { current: null },
  scrollToBottom: mockScrollToBottom,
  loadSession: mockLoadSession,
  startNewChat: mockStartNewChat,
  sendMessage: mockSendMessage,
  renameSession: mockRenameSession,
  deleteSession: mockDeleteSession,
};

vi.mock("./use-chat-stream", () => ({
  useChatStream: vi.fn(() => mockChatStreamState),
}));

vi.mock("./chat-sidebar", () => ({
  ChatSidebar: ({
    sidebarOpen,
    onNewChat,
    onClose,
  }: {
    sidebarOpen: boolean;
    onNewChat: () => void;
    onClose: () => void;
  }) => (
    <div data-testid="chat-sidebar" data-open={sidebarOpen}>
      <button data-testid="new-chat-btn" onClick={onNewChat}>New Chat</button>
      <button data-testid="close-sidebar-btn" onClick={onClose}>Close</button>
    </div>
  ),
}));

vi.mock("./chat-message-list", () => ({
  ChatMessageList: ({ messages }: { messages: unknown[] }) => (
    <div data-testid="message-list" data-count={messages.length} />
  ),
}));

vi.mock("./chat-suggestions", () => ({
  ChatSuggestions: ({ onSelect }: { onSelect: (v: string) => void }) => (
    <div data-testid="chat-suggestions">
      <button data-testid="suggestion-btn" onClick={() => onSelect("suggested prompt")}>
        Suggestion
      </button>
    </div>
  ),
}));

vi.mock("./chat-input", () => ({
  ChatInput: ({
    input,
    loading,
    onInputChange,
    onSend,
  }: {
    input: string;
    loading: boolean;
    onInputChange: (v: string) => void;
    onSend: () => void;
  }) => (
    <div data-testid="chat-input" data-loading={loading}>
      <input
        data-testid="message-input"
        value={input}
        onChange={(e) => onInputChange(e.target.value)}
      />
      <button data-testid="send-btn" onClick={onSend}>Send</button>
    </div>
  ),
}));

vi.mock("./protocol-context-banner", () => ({
  ProtocolContextBanner: ({
    protocol,
    onDismiss,
  }: {
    protocol: { title: string };
    onDismiss: () => void;
  }) => (
    <div data-testid="protocol-banner" data-title={protocol.title}>
      <button data-testid="dismiss-btn" onClick={onDismiss}>Dismiss</button>
    </div>
  ),
}));

const MockScrollArea = React.forwardRef<
  HTMLDivElement,
  { children: React.ReactNode; className?: string }
>(({ children, className }, ref) => (
  <div data-testid="scroll-area" className={className} ref={ref}>
    {children}
  </div>
));
MockScrollArea.displayName = "MockScrollArea";

vi.mock("@/components/ui/scroll-area", () => ({
  ScrollArea: MockScrollArea,
}));

vi.mock("lucide-react", () => ({
  Menu: () => <svg data-testid="menu-icon" />,
}));

import { ChatInterface } from "./chat-interface";

// ── Helpers ───────────────────────────────────────────────────────

const defaultProps = {
  userId: "user-123",
  sessions: [],
  userFocusAreas: [],
  userHealthGoals: [],
};

// ── Tests ─────────────────────────────────────────────────────────

describe("ChatInterface — empty state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockChatStreamState = {
      ...mockChatStreamState,
      messages: [],
      protocolId: null,
      activeSession: null,
    };
  });

  it("renders ChatSuggestions when messages array is empty", () => {
    render(<ChatInterface {...defaultProps} />);
    expect(screen.getByTestId("chat-suggestions")).toBeTruthy();
    expect(screen.queryByTestId("message-list")).toBeNull();
  });

  it("renders ChatInput", () => {
    render(<ChatInterface {...defaultProps} />);
    expect(screen.getByTestId("chat-input")).toBeTruthy();
  });

  it("renders ChatSidebar", () => {
    render(<ChatInterface {...defaultProps} />);
    expect(screen.getByTestId("chat-sidebar")).toBeTruthy();
  });
});

describe("ChatInterface — with messages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockChatStreamState = {
      ...mockChatStreamState,
      messages: [
        { id: "m1", role: "user", content: "Hello" },
        { id: "m2", role: "assistant", content: "Hi there" },
      ],
      protocolId: null,
    };
  });

  it("renders ChatMessageList when messages exist", () => {
    render(<ChatInterface {...defaultProps} />);
    expect(screen.getByTestId("message-list")).toBeTruthy();
    expect(screen.queryByTestId("chat-suggestions")).toBeNull();
  });
});

describe("ChatInterface — protocol context banner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockChatStreamState = {
      ...mockChatStreamState,
      messages: [],
      protocolId: "proto-123",
    };
  });

  it("shows banner when protocolId is set and initialProtocolContext provided", () => {
    render(
      <ChatInterface
        {...defaultProps}
        initialProtocolId="proto-123"
        initialProtocolContext={{ title: "Sleep Protocol", slug: "sleep", category: "sleep" }}
      />
    );
    expect(screen.getByTestId("protocol-banner")).toBeTruthy();
    expect(screen.getByTestId("protocol-banner").getAttribute("data-title")).toBe(
      "Sleep Protocol"
    );
  });

  it("hides banner when no initialProtocolContext provided", () => {
    render(<ChatInterface {...defaultProps} initialProtocolId="proto-123" />);
    expect(screen.queryByTestId("protocol-banner")).toBeNull();
  });

  it("hides banner when protocolId is null", () => {
    mockChatStreamState = { ...mockChatStreamState, protocolId: null };
    render(
      <ChatInterface
        {...defaultProps}
        initialProtocolContext={{ title: "Sleep Protocol", slug: "sleep", category: "sleep" }}
      />
    );
    expect(screen.queryByTestId("protocol-banner")).toBeNull();
  });

  it("dismisses banner on dismiss click", () => {
    render(
      <ChatInterface
        {...defaultProps}
        initialProtocolId="proto-123"
        initialProtocolContext={{ title: "Sleep Protocol", slug: "sleep", category: "sleep" }}
      />
    );
    // Banner is visible
    expect(screen.getByTestId("protocol-banner")).toBeTruthy();
    // Click dismiss
    fireEvent.click(screen.getByTestId("dismiss-btn"));
    // Banner should now be gone
    expect(screen.queryByTestId("protocol-banner")).toBeNull();
  });
});

describe("ChatInterface — sidebar interaction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockChatStreamState = {
      ...mockChatStreamState,
      messages: [],
      protocolId: null,
      sessions: [{ id: "s1", title: "Old chat" }],
      activeSession: "s1",
    };
  });

  it("toggles sidebar open state via mobile menu button", () => {
    render(<ChatInterface {...defaultProps} sessions={[{ id: "s1", title: "Old chat", protocol_id: null, created_at: "", updated_at: "" }]} />);
    const sidebar = screen.getByTestId("chat-sidebar");
    expect(sidebar.getAttribute("data-open")).toBe("false");
    // Find menu toggle by its icon child
    const menuIcon = screen.getByTestId("menu-icon");
    const menuBtn = menuIcon.closest("button") as HTMLElement;
    fireEvent.click(menuBtn);
    expect(sidebar.getAttribute("data-open")).toBe("true");
  });

  it("closes sidebar when onClose is triggered", () => {
    render(<ChatInterface {...defaultProps} />);
    // Open sidebar via menu icon
    const menuIcon = screen.getByTestId("menu-icon");
    fireEvent.click(menuIcon.closest("button") as HTMLElement);
    expect(screen.getByTestId("chat-sidebar").getAttribute("data-open")).toBe("true");
    // Close it
    fireEvent.click(screen.getByTestId("close-sidebar-btn"));
    expect(screen.getByTestId("chat-sidebar").getAttribute("data-open")).toBe("false");
  });

  it("calls startNewChat and closes sidebar on New Chat click", () => {
    render(<ChatInterface {...defaultProps} />);
    // Open sidebar first
    const menuIcon = screen.getByTestId("menu-icon");
    fireEvent.click(menuIcon.closest("button") as HTMLElement);
    fireEvent.click(screen.getByTestId("new-chat-btn"));
    expect(mockStartNewChat).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("chat-sidebar").getAttribute("data-open")).toBe("false");
  });
});

describe("ChatInterface — input interactions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockChatStreamState = { ...mockChatStreamState, messages: [], protocolId: null };
  });

  it("suggestion click calls setInput with suggested text", () => {
    render(<ChatInterface {...defaultProps} />);
    fireEvent.click(screen.getByTestId("suggestion-btn"));
    expect(mockSetInput).toHaveBeenCalledWith("suggested prompt");
  });

  it("send button calls sendMessage", () => {
    render(<ChatInterface {...defaultProps} />);
    fireEvent.click(screen.getByTestId("send-btn"));
    expect(mockSendMessage).toHaveBeenCalledTimes(1);
  });
});
