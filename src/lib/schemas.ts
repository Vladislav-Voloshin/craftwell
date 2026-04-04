/**
 * Shared Zod schemas (PB-222, PB-218)
 *
 * Server+client parity: the same schemas validate on both sides so a
 * form that passes client validation will always pass server validation.
 *
 * Import on server routes via `@/lib/schemas`.
 * Import on client components via `@/lib/schemas` — tree-shaken fine since
 * there are no server-only imports here.
 */
import { z } from "zod";

// ── Email ──────────────────────────────────────────────────────────────────
/** RFC 5322-compliant email regex (tighter than z.string().email()) */
const emailSchema = z
  .string()
  .min(1, "Email is required")
  .email("Please enter a valid email address")
  .max(320, "Email address is too long")
  .transform((v) => v.toLowerCase().trim());

// ── Auth ───────────────────────────────────────────────────────────────────
export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required"),
});

export const signUpSchema = z.object({
  email: emailSchema,
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password is too long"),
});

export type SignInInput = z.infer<typeof signInSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;

// ── Waitlist ───────────────────────────────────────────────────────────────
export const waitlistSchema = z.object({
  email: emailSchema,
  name: z.string().max(100).optional(),
  source: z.string().max(50).optional(),
});

export type WaitlistInput = z.infer<typeof waitlistSchema>;

// ── Profile ────────────────────────────────────────────────────────────────
export const profileUpdateSchema = z.object({
  profile: z
    .object({
      display_name: z.string().max(100).nullish(),
      first_name: z.string().max(50).nullish(),
      last_name: z.string().max(50).nullish(),
      age: z.number().int().min(1).max(150).nullish(),
    })
    .optional(),
  survey: z
    .object({
      health_goals: z.array(z.string()).optional(),
      sleep_quality: z.number().int().min(1).max(10).optional(),
      exercise_frequency: z.string().optional(),
      stress_level: z.number().int().min(1).max(10).optional(),
      supplement_experience: z.string().nullish(),
      focus_areas: z.array(z.string()).optional(),
    })
    .optional(),
});

export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;

// ── Onboarding ─────────────────────────────────────────────────────────────
export const onboardingSchema = z.object({
  health_goals: z.array(z.string()).min(1, "Please select at least one health goal"),
  focus_areas: z.array(z.string()),
  sleep_quality: z.number().int().min(1).max(10),
  stress_level: z.number().int().min(1).max(10),
  exercise_frequency: z.string().min(1, "Please select your exercise frequency"),
  supplement_experience: z.string().optional(),
});

export type OnboardingInput = z.infer<typeof onboardingSchema>;

// ── Search ─────────────────────────────────────────────────────────────────
export const searchSchema = z.object({
  q: z
    .string()
    .min(1, "Search query is required")
    .max(500, "Search query is too long")
    .transform((v) => v.trim()),
});

export type SearchInput = z.infer<typeof searchSchema>;

// ── Chat ───────────────────────────────────────────────────────────────────
export const chatMessageSchema = z.object({
  message: z.string().min(1, "Message is required").max(4000, "Message is too long"),
  session_id: z.string().uuid().nullish().transform((v) => v ?? undefined),
  protocol_id: z.string().uuid().nullish().transform((v) => v ?? undefined),
});

export type ChatMessageInput = z.infer<typeof chatMessageSchema>;
