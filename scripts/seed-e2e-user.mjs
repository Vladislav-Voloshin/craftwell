// Seed (idempotently) the dedicated E2E test account used by the Playwright
// suite. Reads Supabase creds from .env.local and uses the service-role admin
// API so the user is created already-confirmed. Safe to run repeatedly.
//
//   node scripts/seed-e2e-user.mjs
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

const EMAIL = "e2e-test@craftwell.app";
const PASSWORD = "TestPass123!";

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: list, error: listErr } = await supabase.auth.admin.listUsers({ perPage: 200 });
if (listErr) {
  console.error("listUsers failed:", listErr.message);
  process.exit(1);
}

const existing = list.users.find((u) => u.email === EMAIL);
if (existing) {
  console.log("E2E user already exists:", existing.id);
  process.exit(0);
}

const { data, error } = await supabase.auth.admin.createUser({
  email: EMAIL,
  password: PASSWORD,
  email_confirm: true,
});
if (error) {
  console.error("createUser failed:", error.message);
  process.exit(1);
}
console.log("E2E user created:", data.user.id);
