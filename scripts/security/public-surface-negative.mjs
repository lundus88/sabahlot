#!/usr/bin/env node

/**
 * Public-surface negative security regression for SabahLot.
 *
 * Read-only by design. This script performs only GET/POST requests that read
 * data or call the read-only get_active_listing_contact RPC. It never sends
 * INSERT/UPDATE/DELETE/PATCH requests and it never uses service-role keys.
 *
 * Required environment variables:
 *   SABAHLOT_SECURITY_TARGET_NAME
 *   SABAHLOT_SECURITY_SUPABASE_URL
 *   SABAHLOT_SECURITY_PUBLISHABLE_KEY
 *   SABAHLOT_SECURITY_ELIGIBLE_LISTING_ID
 *   SABAHLOT_SECURITY_INACTIVE_LISTING_ID
 *   SABAHLOT_SECURITY_EXPIRED_LISTING_ID
 *   SABAHLOT_SECURITY_NO_CONSENT_LISTING_ID
 *   SABAHLOT_SECURITY_FIXTURE_ATTESTED_AT
 */

const required = [
  "SABAHLOT_SECURITY_TARGET_NAME",
  "SABAHLOT_SECURITY_SUPABASE_URL",
  "SABAHLOT_SECURITY_PUBLISHABLE_KEY",
  "SABAHLOT_SECURITY_ELIGIBLE_LISTING_ID",
  "SABAHLOT_SECURITY_INACTIVE_LISTING_ID",
  "SABAHLOT_SECURITY_EXPIRED_LISTING_ID",
  "SABAHLOT_SECURITY_NO_CONSENT_LISTING_ID",
  "SABAHLOT_SECURITY_FIXTURE_ATTESTED_AT",
];

for (const name of required) {
  if (!process.env[name]?.trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
}

const targetName = process.env.SABAHLOT_SECURITY_TARGET_NAME.trim();
const baseUrl = process.env.SABAHLOT_SECURITY_SUPABASE_URL.trim().replace(/\/$/, "");
const apiKey = process.env.SABAHLOT_SECURITY_PUBLISHABLE_KEY.trim();
const eligibleListingId = process.env.SABAHLOT_SECURITY_ELIGIBLE_LISTING_ID.trim();
const inactiveListingId = process.env.SABAHLOT_SECURITY_INACTIVE_LISTING_ID.trim();
const expiredListingId = process.env.SABAHLOT_SECURITY_EXPIRED_LISTING_ID.trim();
const noConsentListingId = process.env.SABAHLOT_SECURITY_NO_CONSENT_LISTING_ID.trim();
const attestedAtRaw = process.env.SABAHLOT_SECURITY_FIXTURE_ATTESTED_AT.trim();

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertUuid(value, label) {
  assert(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value),
    `${label} must be a UUID`,
  );
}

function decodeJwtPayload(token) {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

function assertPublicKeyOnly(key) {
  assert(!key.startsWith("sb_secret_"), "Refusing to run with a secret/service key");
  if (key.startsWith("sb_publishable_")) return;
  const payload = decodeJwtPayload(key);
  assert(payload, "Unsupported API key format; expected publishable key or legacy anon JWT");
  assert(payload.role === "anon", `Refusing JWT role ${String(payload.role)}; anon only`);
}

assertPublicKeyOnly(apiKey);
assert(/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(baseUrl), "Supabase URL must be an https://*.supabase.co origin");

for (const [value, label] of [
  [eligibleListingId, "eligible listing fixture"],
  [inactiveListingId, "inactive listing fixture"],
  [expiredListingId, "expired listing fixture"],
  [noConsentListingId, "no-consent listing fixture"],
]) {
  assertUuid(value, label);
}

const attestedAt = new Date(attestedAtRaw);
assert(!Number.isNaN(attestedAt.getTime()), "SABAHLOT_SECURITY_FIXTURE_ATTESTED_AT must be an ISO timestamp");
const now = Date.now();
const ageMs = now - attestedAt.getTime();
assert(ageMs >= -5 * 60 * 1000, "Fixture attestation timestamp is unexpectedly in the future");
assert(ageMs <= 24 * 60 * 60 * 1000, "Fixture attestation is older than 24 hours; re-attest fixtures before running");

const commonHeaders = {
  apikey: apiKey,
  Authorization: `Bearer ${apiKey}`,
  Accept: "application/json",
};

async function request(path, init = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        ...commonHeaders,
        ...(init.headers || {}),
      },
      signal: controller.signal,
    });
    const text = await response.text();
    let json = null;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        // Keep body private and fail at the assertion layer.
      }
    }
    return { status: response.status, ok: response.ok, json };
  } finally {
    clearTimeout(timeout);
  }
}

async function expectPrivateTableHidden(table) {
  const result = await request(`/rest/v1/${table}?select=id&limit=1`);
  if (result.status === 401 || result.status === 403) return;
  assert(result.status === 200, `${table}: expected 200/401/403, received ${result.status}`);
  assert(Array.isArray(result.json), `${table}: expected JSON array`);
  assert(result.json.length === 0, `${table}: anonymous caller unexpectedly received rows`);
}

async function callContactRpc(listingId) {
  const result = await request("/rest/v1/rpc/get_active_listing_contact", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ listing_id: listingId }),
  });
  assert(result.status === 200, `contact RPC returned HTTP ${result.status}`);
  assert(Array.isArray(result.json), "contact RPC did not return a JSON array");
  return result.json;
}

async function expectRpcHidden(listingId, label) {
  const rows = await callContactRpc(listingId);
  assert(rows.length === 0, `${label}: contact RPC unexpectedly returned data`);
}

async function expectEligibleRpcVisible(listingId) {
  const rows = await callContactRpc(listingId);
  assert(rows.length === 1, "eligible fixture: expected exactly one public contact row");
  const allowed = new Set(["phone", "email", "display_name", "company_name"]);
  for (const key of Object.keys(rows[0] || {})) {
    assert(allowed.has(key), `eligible fixture: unexpected RPC field ${key}`);
  }
}

async function main() {
  console.log(`[security] target=${targetName}`);
  console.log("[security] fixture attestation is fresh (<=24h)");

  await expectPrivateTableHidden("activity_logs");
  console.log("[security] PASS activity_logs anonymous direct read blocked/empty");

  await expectPrivateTableHidden("listing_partners");
  console.log("[security] PASS listing_partners anonymous direct read blocked/empty");

  await expectEligibleRpcVisible(eligibleListingId);
  console.log("[security] PASS eligible listing contact reveal baseline");

  await expectRpcHidden("00000000-0000-0000-0000-000000000000", "invalid UUID");
  console.log("[security] PASS invalid listing RPC returns empty");

  await expectRpcHidden(inactiveListingId, "inactive fixture");
  console.log("[security] PASS inactive listing RPC returns empty");

  await expectRpcHidden(expiredListingId, "expired fixture");
  console.log("[security] PASS expired listing RPC returns empty");

  await expectRpcHidden(noConsentListingId, "no-consent fixture");
  console.log("[security] PASS no-consent listing RPC returns empty");

  console.log(`[security] PASS ${targetName} public-surface negative regression`);
}

main().catch((error) => {
  console.error(`[security] FAIL ${targetName}: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
