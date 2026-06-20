// Generate the Apple "client secret" JWT that Supabase needs for the
// Sign in with Apple provider (the "Secret Key (for OAuth)" field).
//
// Apple client secrets are ES256-signed JWTs and expire in <= 6 months, so
// re-run this to refresh:
//
//   node scripts/gen-apple-client-secret.mjs <path-to-.p8> <teamId> <keyId> <servicesId>
//
// e.g.
//   node scripts/gen-apple-client-secret.mjs ~/Downloads/AuthKey_XXXX.p8 \
//     DBLBYD8J78 RA9K86RPAJ com.craftwell.signin
import crypto from "node:crypto";
import { readFileSync } from "node:fs";

const [p8Path, teamId, keyId, servicesId] = process.argv.slice(2);
if (!p8Path || !teamId || !keyId || !servicesId) {
  console.error(
    "Usage: node scripts/gen-apple-client-secret.mjs <.p8 path> <teamId> <keyId> <servicesId>"
  );
  process.exit(1);
}

const key = readFileSync(p8Path, "utf8");
const now = Math.floor(Date.now() / 1000);

const header = { alg: "ES256", kid: keyId, typ: "JWT" };
const payload = {
  iss: teamId,
  iat: now,
  exp: now + 60 * 60 * 24 * 180, // 180 days (Apple max is ~6 months)
  aud: "https://appleid.apple.com",
  sub: servicesId,
};

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const signingInput = `${b64(header)}.${b64(payload)}`;
const signature = crypto
  .sign("sha256", Buffer.from(signingInput), { key, dsaEncoding: "ieee-p1363" })
  .toString("base64url");

const jwt = `${signingInput}.${signature}`;
console.log(jwt);
console.error(
  `\n(expires ${new Date(payload.exp * 1000).toISOString().slice(0, 10)} — re-run to refresh)`
);
