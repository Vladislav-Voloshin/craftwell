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

export type EvidenceRightsMode = "metadata_only" | "short_excerpt" | "licensed" | "user_provided";

export interface IngestionSource {
  source_key: string;
  display_name: string;
  source_kind: string;
  base_url: string;
  rights_mode: EvidenceRightsMode;
  enabled: boolean;
  rights_notes: string;
  last_cursor: string | null;
  last_success_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface EvidenceDocument {
  id: string;
  identity_key: string;
  document_type: string;
  canonical_url: string;
  title: string;
  source_excerpt: string | null;
  derived_summary: string | null;
  published_at: string | null;
  authors: string[];
  guests: string[];
  topics: string[];
  pmid: string | null;
  doi: string | null;
  language: string;
  rights_mode: EvidenceRightsMode;
  content_fingerprint: string | null;
  metadata: Record<string, unknown>;
  first_seen_at: string;
  last_seen_at: string;
  updated_at: string;
}

export interface DocumentSource {
  document_id: string;
  source_key: string;
  external_id: string;
  canonical_url: string;
  metadata: Record<string, unknown>;
  first_seen_at: string;
  last_seen_at: string;
}

export interface EvidencePerson {
  id: string;
  normalized_name: string;
  display_name: string;
  credentials: string[];
  affiliations: string[];
  primary_url: string | null;
  metadata: Record<string, unknown>;
  last_research_check_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface IngestionRun {
  id: string;
  source_key: string | null;
  trigger_type: "cron" | "manual" | "backfill" | "test";
  status: "running" | "succeeded" | "partial" | "failed";
  request_id: string | null;
  cursor_start: string | null;
  cursor_end: string | null;
  discovered_count: number;
  inserted_count: number;
  updated_count: number;
  skipped_count: number;
  error_count: number;
  error_summary: string | null;
  metadata: Record<string, unknown>;
  started_at: string;
  completed_at: string | null;
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

/** Payment provider that issued an entitlement. Stripe today; Apple/Google after IAP lands. */
export type EntitlementProvider = "stripe" | "apple" | "google";

export interface Subscription {
  id: string;
  user_id: string;
  /** Which provider issued this entitlement. Defaults to 'stripe'. */
  provider: EntitlementProvider;
  /** Stripe customer id — NULL for Apple/Google IAP rows. */
  stripe_customer_id: string | null;
  /** NULL for lifetime one-time purchases and non-Stripe providers. */
  stripe_subscription_id: string | null;
  /** Stripe price id — NULL for Apple/Google IAP rows. */
  stripe_price_id: string | null;
  /** Apple product id / Google SKU — NULL for Stripe rows. */
  provider_product_id: string | null;
  /** Apple original_transaction_id / Google purchaseToken — NULL for Stripe rows. */
  provider_transaction_id: string | null;
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
