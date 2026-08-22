export type RightsMode = "metadata_only" | "short_excerpt" | "licensed" | "user_provided";

export type EvidenceDocumentType =
  | "podcast_episode"
  | "video"
  | "show_notes"
  | "transcript_reference"
  | "newsletter"
  | "study"
  | "book"
  | "publication"
  | "lab_update"
  | "media";

export type PersonRole = "host" | "guest" | "author" | "researcher" | "subject" | "speaker";

export type PersonMatchStatus = "verified" | "extracted" | "candidate" | "rejected";

export interface EvidenceDocumentInput {
  identityKey: string;
  sourceKey: string;
  externalId: string;
  documentType: EvidenceDocumentType;
  canonicalUrl: string;
  title: string;
  sourceExcerpt?: string;
  derivedSummary?: string;
  publishedAt?: string;
  authors?: string[];
  guests?: string[];
  topics?: string[];
  pmid?: string;
  doi?: string;
  language?: string;
  rightsMode: RightsMode;
  contentFingerprint?: string;
  metadata?: Record<string, unknown>;
}

export interface PersonMentionInput {
  documentSourceKey: string;
  documentExternalId: string;
  displayName: string;
  normalizedName: string;
  credentials: string[];
  affiliations: string[];
  role: PersonRole;
  matchStatus: PersonMatchStatus;
  confidence: number;
  evidence?: string;
  primaryUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface PersonSourceInput {
  normalizedName: string;
  sourceKind: "lab" | "institution" | "publication_profile" | "media" | "book" | "social" | "other";
  url: string;
  title?: string;
  verified?: boolean;
  metadata?: Record<string, unknown>;
}

export interface EvidenceClaimInput {
  documentIdentityKey: string;
  claimHash: string;
  claimText: string;
  claimType: "finding" | "protocol" | "safety" | "limitation" | "context";
  evidenceLevel?:
    | "systematic_review"
    | "meta_analysis"
    | "randomized_trial"
    | "controlled_trial"
    | "observational"
    | "preclinical"
    | "expert_opinion"
    | "unknown";
  structuredData?: Record<string, unknown>;
  extractionMethod?: string;
  extractionModel?: string;
}

export interface EvidenceRelationInput {
  sourceDocumentIdentityKey: string;
  targetDocumentIdentityKey: string;
  sourceKey: string;
  relationType: "cites" | "transcript_for" | "media_of" | "mentions" | "updates";
  metadata?: Record<string, unknown>;
}

export interface GuestResearchCandidate {
  displayName: string;
  normalizedName: string;
  credentials: string[];
  affiliations: string[];
  primaryUrl?: string;
}

export interface EvidenceBatch {
  sourceKey: string;
  cursor: string;
  documents: EvidenceDocumentInput[];
  people: PersonMentionInput[];
  personSources?: PersonSourceInput[];
  claims?: EvidenceClaimInput[];
  relations?: EvidenceRelationInput[];
  synchronizePersonRoles?: Partial<Record<PersonRole, string[]>>;
  errors?: string[];
  metadata?: Record<string, unknown>;
}

export interface PersistResult {
  discovered: number;
  inserted: number;
  updated: number;
  skipped: number;
  errors: number;
}

export type IngestionTrigger = "cron" | "manual" | "backfill" | "test";
export type IngestionRunStatus = "running" | "succeeded" | "partial" | "failed";

export interface SourceRunResult extends PersistResult {
  sourceKey: string;
  status: Exclude<IngestionRunStatus, "running">;
  runId?: string;
  cursor?: string;
  error?: string;
}

export interface WeeklyIngestionResult {
  ok: boolean;
  status: "succeeded" | "partial" | "failed";
  startedAt: string;
  completedAt: string;
  sources: SourceRunResult[];
}

export interface EvidenceStore {
  startRun(input: {
    sourceKey: string;
    trigger: IngestionTrigger;
    requestId?: string;
    cursorStart?: string;
  }): Promise<string>;
  persistBatch(batch: EvidenceBatch): Promise<PersistResult>;
  listGuestResearchCandidates(limit: number): Promise<GuestResearchCandidate[]>;
  markGuestResearchChecked(normalizedNames: string[], checkedAt: string): Promise<void>;
  finishRun(input: {
    runId: string;
    sourceKey: string;
    status: Exclude<IngestionRunStatus, "running">;
    cursorEnd?: string;
    result: PersistResult;
    error?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void>;
}
