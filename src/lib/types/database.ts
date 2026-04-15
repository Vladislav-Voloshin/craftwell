/**
 * TypeScript interfaces for all Supabase database tables.
 * Keep in sync with the actual DB schema.
 */

// ============================================================
// Core Domain
// ============================================================

export interface Protocol {
  id: string;
  title: string;
  slug: string;
  category: ProtocolCategory;
  description: string;
  effectiveness_rank: number;
  difficulty: ProtocolDifficulty;
  time_commitment: string;
  source_episodes: string[];
  source_type: string;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export type ProtocolCategory =
  | "sleep"
  | "exercise"
  | "nutrition"
  | "supplements"
  | "stress"
  | "focus"
  | "hormones"
  | "cold-heat"
  | "light-exposure"
  | "breathing"
  | "mental-health"
  | "motivation"
  | "brain-performance"
  | "longevity";

export type ProtocolDifficulty = "easy" | "moderate" | "advanced";

export interface ProtocolTool {
  id: string;
  protocol_id: string;
  title: string;
  description: string;
  instructions: string;
  effectiveness_rank: number;
  timing: string;
  duration: string;
  frequency: string;
  notes: string | null;
  created_at: string;
}

// ============================================================
// User Data
// ============================================================

export interface User {
  id: string;
  email: string;
  phone: string | null;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  age: number | null;
  avatar_url: string | null;
  onboarding_completed: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserProtocol {
  id: string;
  user_id: string;
  protocol_id: string;
  started_at: string;
  is_active: boolean;
}

export interface ProtocolFavorite {
  id: string;
  user_id: string;
  protocol_id: string;
  created_at: string;
}

export interface UserProtocolWithDetails extends UserProtocol {
  protocols: Pick<
    Protocol,
    "id" | "title" | "slug" | "category" | "description" | "difficulty" | "time_commitment"
  >;
}

export interface ProtocolCompletion {
  id: string;
  user_id: string;
  protocol_id: string;
  tool_id: string;
  completed_date: string; // YYYY-MM-DD
}

export interface SurveyResponse {
  id: string;
  user_id: string;
  health_goals: string[];
  sleep_quality: number;
  exercise_frequency: string;
  stress_level: number;
  supplement_experience: string | null;
  focus_areas: string[];
  created_at: string;
}

// ============================================================
// Chat
// ============================================================

export interface ChatSession {
  id: string;
  user_id: string;
  title: string;
  protocol_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  session_id: string;
  role: "user" | "assistant";
  content: string;
  sources: ChatSource[];
  created_at: string;
}

export interface ChatSource {
  type: string;
  title: string;
  chunk_id: string;
}

// ============================================================
// Content / Ingestion
// ============================================================

export interface ContentChunk {
  id: string;
  source_type: string;
  source_id: string;
  source_title: string;
  chunk_index: number;
  content: string;
  embedding_id: string | null;
  created_at: string;
}

export interface ProtocolCategoryRecord {
  id: string;
  name: string;
  slug: string;
  icon: string;
  description: string;
}

// ============================================================
// Subscriptions
// ============================================================

export type PlanType = "monthly" | "annual" | "lifetime";
export type SubscriptionStatus =
  | "active"
  | "canceled"
  | "past_due"
  | "trialing"
  | "incomplete"
  | "incomplete_expired"
  | "paused";

export interface Subscription {
  id: string;
  user_id: string;
  stripe_customer_id: string;
  /** NULL for lifetime one-time purchases. */
  stripe_subscription_id: string | null;
  stripe_price_id: string;
  plan_type: PlanType;
  status: SubscriptionStatus;
  /** NULL for lifetime purchases. */
  current_period_start: string | null;
  /** NULL for lifetime purchases. */
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  canceled_at: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================
// API Response Types
// ============================================================

export interface ApiError {
  error: string;
}

export interface CompletionsResponse {
  completed_tool_ids: string[];
  date: string;
}

export interface StreaksResponse {
  streak: number;
  longest_streak: number;
  total_days: number;
}

export interface UserProtocolsResponse {
  protocols: UserProtocolWithDetails[];
}

export interface ChatSessionsResponse {
  sessions: Pick<ChatSession, "id" | "title" | "protocol_id" | "created_at" | "updated_at">[];
}

export interface ChatMessagesResponse {
  messages: Pick<ChatMessage, "id" | "role" | "content" | "sources" | "created_at">[];
}

export interface SearchResponse {
  protocols: Pick<
    Protocol,
    "id" | "title" | "slug" | "category" | "description" | "effectiveness_rank" | "difficulty"
  >[];
  knowledge: SemanticSearchResult[];
}

export interface SemanticSearchResult {
  score: number | undefined;
  source_type: string | undefined;
  source_title: string | undefined;
  content: string | undefined;
}

// ============================================================
// Chat Streaming Types
// ============================================================

export type ChatStreamEvent =
  | { type: "meta"; session_id: string; sources: ChatSource[] }
  | { type: "text"; text: string }
  | { type: "error"; error: string }
  | { type: "done" };
