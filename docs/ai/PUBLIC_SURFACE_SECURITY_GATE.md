# Public Surface Security Gate

Purpose: preserve repeatable evidence that SabahLot's intended anonymous public surface is narrow and fail-closed before any broad public-launch decision.

## Scope

The automated script is `scripts/security/public-surface-negative.mjs`. It is read-only by construction and may use only a Supabase publishable key or legacy `anon` JWT. It refuses `sb_secret_*` keys and legacy JWTs whose role is not `anon`.

For each target (`sabahlot-dev` and `sabahlot-production`) the manual Release Gate security job verifies:

1. anonymous direct read of `public.activity_logs` returns no rows or is denied;
2. anonymous direct read of `public.listing_partners` returns no rows or is denied;
3. one pre-attested eligible listing returns exactly one contact-reveal row and no fields beyond `phone`, `email`, `display_name`, `company_name`;
4. an invalid UUID returns zero contact rows;
5. one pre-attested inactive listing returns zero contact rows;
6. one pre-attested expired listing returns zero contact rows;
7. one pre-attested listing whose partner lacks public-contact consent returns zero contact rows.

No INSERT, UPDATE, DELETE, PATCH, migration, service-role key, production authority change, or database mutation is part of this gate.

## Why fixture pre-attestation is mandatory

A random or previously deleted UUID would also return an empty RPC result. That is not evidence that the inactive / expired / no-consent predicates are enforced.

Before dispatching the security gate, a privileged **read-only** database inspection must confirm that every fixture UUID currently exists and has the exact expected state. Record the attestation timestamp and configure it with the fixture values. The automation rejects an attestation older than 24 hours.

Required per target:

- eligible fixture: listing exists, `status = 'active'`, `updated_at > now() - interval '90 days'`, partner `status = 'approved'`, `public_contact_consent = true`;
- inactive fixture: listing exists and `status <> 'active'`;
- expired fixture: listing exists, otherwise public-eligible, but `updated_at <= now() - interval '90 days'`;
- no-consent fixture: listing exists and is otherwise fresh/active, but the partner is unapproved or `public_contact_consent <> true`.

A fixture should satisfy only its intended negative predicate where practical, so the evidence isolates the control being tested.

## GitHub Actions configuration

The normal pull-request Release Gate continues to use placeholder Supabase values for build and browser QA and does not contact live databases.

The live security job runs only on `workflow_dispatch`, after the normal `release-gate` job succeeds, and executes against both dev and production. It expects these GitHub Actions secrets:

### Dev

- `SABAHLOT_DEV_SUPABASE_URL`
- `SABAHLOT_DEV_PUBLISHABLE_KEY`
- `SABAHLOT_DEV_SECURITY_ELIGIBLE_LISTING_ID`
- `SABAHLOT_DEV_SECURITY_INACTIVE_LISTING_ID`
- `SABAHLOT_DEV_SECURITY_EXPIRED_LISTING_ID`
- `SABAHLOT_DEV_SECURITY_NO_CONSENT_LISTING_ID`
- `SABAHLOT_DEV_SECURITY_FIXTURE_ATTESTED_AT`

### Production

- `SABAHLOT_PROD_SUPABASE_URL`
- `SABAHLOT_PROD_PUBLISHABLE_KEY`
- `SABAHLOT_PROD_SECURITY_ELIGIBLE_LISTING_ID`
- `SABAHLOT_PROD_SECURITY_INACTIVE_LISTING_ID`
- `SABAHLOT_PROD_SECURITY_EXPIRED_LISTING_ID`
- `SABAHLOT_PROD_SECURITY_NO_CONSENT_LISTING_ID`
- `SABAHLOT_PROD_SECURITY_FIXTURE_ATTESTED_AT`

Missing values, unsupported key types, malformed fixture UUIDs, stale attestation, unexpected HTTP responses, exposed private rows, or a negative RPC returning contact data all fail the job.

## Evidence standard

A green workflow is evidence only for the exact commit, exact configured targets, and attested fixtures used in that run. It does not itself authorize broad public launch or open `sabahlot-production` write authority. Those remain separate owner-controlled gates.
