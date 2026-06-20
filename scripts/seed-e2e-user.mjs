// Seed (idempotently) the dedicated E2E test accounts used by the Playwright
// suite. Reads Supabase creds from .env.local and uses the service-role admin
// API so each user is created already-confirmed. Safe to run repeatedly.
//
//   node scripts/seed-e2e-user.mjs
//
// Why multiple accounts?
// The Playwright `full` project runs several workers in parallel. Supabase
// rotates refresh tokens, so if every worker shares ONE account, concurrent
// token refreshes invalidate each other's session and authenticated pages
// redirect to /auth (flaky failures). Giving each worker its OWN account
// (e2e-test+w{N}@craftwell.app) eliminates that cross-worker session race.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const PASSWORD = "TestPass123!";

// The base shared account (kept for back-compat / serial smoke runs) plus one
// dedicated account per parallel Playwright worker slot. Keep WORKER_COUNT in
// sync with the max `workers` configured in playwright.config.ts.
const WORKER_COUNT = 6;
const EMAILS = [
  "e2e-test@craftwell.app",
  ...Array.from({ length: WORKER_COUNT }, (_, i) => `e2e-test+w${i}@craftwell.app`),
];

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Fetch all existing users once (paginated) so we can dedupe before creating.
const existingEmails = new Set();
for (let page = 1; ; page++) {
  const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
  if (error) {
    console.error("listUsers failed:", error.message);
    process.exit(1);
  }
  for (const u of data.users) existingEmails.add(u.email);
  if (data.users.length < 200) break;
}

let created = 0;
let skipped = 0;
for (const email of EMAILS) {
  if (existingEmails.has(email)) {
    console.log("E2E user already exists:", email);
    skipped++;
    continue;
  }
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error) {
    console.error(`createUser failed for ${email}:`, error.message);
    process.exit(1);
  }
  console.log("E2E user created:", email, data.user.id);
  created++;
}

console.log(`\nDone. Created ${created}, already existed ${skipped}, total ${EMAILS.length}.`);
