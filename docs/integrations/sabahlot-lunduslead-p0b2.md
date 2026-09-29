# SabahLot → LundusLead Professional Help Handoff P0-B2

Status: branch implementation only. No Production activation is authorized by this document.

## Purpose

SabahLot remains the public land-context and guidance surface. LundusLead remains the lead system of record.

The handoff flow is:

SabahLot guidance → Get Professional Help → explicit consent → Turnstile → LundusLead public intake → LundusLead Lead.

No CRM, quotation pipeline, payment workflow, or lead database is added to SabahLot.

## Privacy-minimized payload

The handoff may send only:
- name;
- email;
- optional phone / WhatsApp;
- selected help category;
- short user-written message;
- land case type;
- district;
- village;
- estimated area;
- issue tags;
- document-type presence;
- submission UUID;
- explicit contact consent;
- Turnstile token.

The handoff does not send:
- uploaded document files;
- identity numbers;
- full title/geran contents;
- exact polygon coordinates;
- GPS tracks;
- raw evidence files.

## Fail-closed client configuration

The client surface remains inactive unless both public build-time values are configured:

- `NEXT_PUBLIC_LUNDUSLEAD_INTAKE_URL`
- `NEXT_PUBLIC_LUNDUSLEAD_TURNSTILE_SITE_KEY`

Optional:
- `NEXT_PUBLIC_LUNDUSLEAD_TURNSTILE_ACTION` (defaults to `lead_submit`)

No secret key belongs in SabahLot. The Turnstile secret and Supabase service-role remain server-side in LundusLead.

## Server-side trust boundary

LundusLead derives the source application from the exact request Origin. SabahLot also sends `source_app=sabahlot`, but this is only a consistency assertion and is rejected if it disagrees with the server-derived origin profile.

A SabahLot request must include `consent_to_contact=true`.

## Activation boundary

This branch does not:
- modify SabahLot Production write gates;
- apply Supabase migrations;
- update Vercel/Cloudflare environment values;
- enable LundusLead public intake;
- change WAF/rate-limit configuration;
- deploy Production.

Those remain separate owner-gated operations after CI, preview verification, and an end-to-end Golden Lead test.
