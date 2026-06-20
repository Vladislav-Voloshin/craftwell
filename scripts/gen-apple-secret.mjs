// Generate the "Sign in with Apple" client secret (an ES256 JWT) that Supabase
// asks for in Auth → Providers → Apple → "Secret Key (for OAuth)".
//
// Apple requires this secret to be a short-lived JWT signed with the .p8 key you
// created in the Apple Developer portal. It expires after at most 180 days, so
// re-run this when it lapses.
//
//   node scripts/gen-apple-secret.mjs <p8-path> <teamId> <keyId> <serviceId>
//
// e.g. node scripts/gen-apple-secret.mjs ./AuthKey_ABC123.p8 TEAM123456 ABC123 com.craftwell.signin
import { readFileSync } from "node:fs";
import crypto from "node:crypto";

const [, , p8Path, teamId, keyId, serviceId] = process.argv;
if (!p8Path || !teamId || !keyId || !serviceId) {
  console.error(
    "Usage: node scripts/gen-apple-secret.mjs <p8-path> <teamId> <keyId> <serviceId>"
  );
  process.exit(1);
}

const privateKey = readFileSync(p8Path, "utf8");
const now = Math.floor(Date.now() / 1000);
const exp = now + 180 * 24 * 60 * 60; // 180 days = Apple's maximum

const b64url = (input) => Buffer.from(input).toString("base64url");

const header = b64url(JSON.stringify({ alg: "ES256", kid: keyId }));
const payload = b64url(
  JSON.stringify({
    iss: teamId,
    iat: now,
    exp,
    aud: "https://appleid.apple.com",
    sub: serviceId, // the Services ID, e.g. com.craftwell.signin
  })
);
const signingInput = `${header}.${payload}`;

// ES256 signatures must be in JOSE (r||s) form, not DER — `ieee-p1363` gives that.
const signature = crypto
  .createSign("SHA256")
  .update(signingInput)
  .sign({ key: privateKey, dsaEncoding: "ieee-p1363" })
  .toString("base64url");

process.stdout.write(`${signingInput}.${signature}\n`);
console.error(
  `\n✓ Apple client secret generated (valid until ${new Date(
    exp * 1000
  ).toISOString()}). Paste the line above into Supabase → Apple → Secret Key.`
);
