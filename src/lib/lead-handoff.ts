export type ProfessionalHelpLandCaseType =
  | "land_application"
  | "inheritance_land"
  | "family_customary_land"
  | "titled_land"
  | "unsure"
  | "";

export interface ProfessionalHelpContext {
  landCaseType: ProfessionalHelpLandCaseType;
  district: string;
  village: string;
  estimatedAreaM2: number | null;
  issueTags: readonly string[];
  documentTypes: readonly string[];
}

export interface ProfessionalHelpInput {
  submissionId: string;
  name: string;
  email: string;
  phone: string;
  service: string;
  message: string;
  consentToContact: boolean;
  turnstileToken: string;
  context: ProfessionalHelpContext;
}

export interface LeadHandoffConfig {
  endpoint: string | null;
  turnstileSiteKey: string | null;
  turnstileAction: string;
}

export interface LeadHandoffResult {
  ok: boolean;
  code:
    | "accepted"
    | "not_configured"
    | "invalid_input"
    | "request_failed"
    | "server_rejected";
  duplicate?: boolean;
}

const MAX_ISSUES = 10;
const MAX_DOCUMENT_TYPES = 10;

function clean(value: string, max: number): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function cleanArray(values: readonly string[], maxItems: number): string[] {
  return values
    .map((value) => clean(value, 80))
    .filter((value, index, items) => Boolean(value) && items.indexOf(value) === index)
    .slice(0, maxItems);
}

function exactHttpsUrl(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:") return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export function getLeadHandoffConfig(): LeadHandoffConfig {
  return {
    endpoint: exactHttpsUrl(process.env.NEXT_PUBLIC_LUNDUSLEAD_INTAKE_URL),
    turnstileSiteKey:
      process.env.NEXT_PUBLIC_LUNDUSLEAD_TURNSTILE_SITE_KEY?.trim() || null,
    turnstileAction:
      process.env.NEXT_PUBLIC_LUNDUSLEAD_TURNSTILE_ACTION?.trim() ||
      "lead_submit",
  };
}

export function buildProfessionalHelpPayload(input: ProfessionalHelpInput) {
  const area =
    typeof input.context.estimatedAreaM2 === "number" &&
    Number.isFinite(input.context.estimatedAreaM2) &&
    input.context.estimatedAreaM2 > 0
      ? Math.round(input.context.estimatedAreaM2 * 100) / 100
      : null;

  return {
    submission_id: clean(input.submissionId, 64),
    name: clean(input.name, 140),
    email: clean(input.email, 254).toLowerCase(),
    phone: clean(input.phone, 32),
    service: clean(input.service, 180),
    location: clean(
      [input.context.village, input.context.district]
        .map((value) => clean(value, 120))
        .filter(Boolean)
        .join(", "),
      180,
    ),
    message: clean(input.message, 3500),
    source_app: "sabahlot",
    consent_to_contact: input.consentToContact === true,
    turnstile_token: clean(input.turnstileToken, 4096),
    land_context: {
      land_case_type: input.context.landCaseType || null,
      district: clean(input.context.district, 120) || null,
      village: clean(input.context.village, 120) || null,
      estimated_area_m2: area,
      issue_tags: cleanArray(input.context.issueTags, MAX_ISSUES),
      document_types: cleanArray(
        input.context.documentTypes,
        MAX_DOCUMENT_TYPES,
      ),
    },
    website: "",
  };
}

export function isProfessionalHelpInputReady(
  input: ProfessionalHelpInput,
): boolean {
  return Boolean(
    input.submissionId &&
      input.name.trim() &&
      input.email.trim() &&
      input.service.trim() &&
      input.message.trim() &&
      input.consentToContact &&
      input.turnstileToken,
  );
}

export async function submitProfessionalHelp(
  input: ProfessionalHelpInput,
): Promise<LeadHandoffResult> {
  const config = getLeadHandoffConfig();

  if (!config.endpoint || !config.turnstileSiteKey) {
    return { ok: false, code: "not_configured" };
  }

  if (!isProfessionalHelpInputReady(input)) {
    return { ok: false, code: "invalid_input" };
  }

  try {
    const response = await fetch(config.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildProfessionalHelpPayload(input)),
      redirect: "error",
    });

    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }

    if (!response.ok) {
      return { ok: false, code: "server_rejected" };
    }

    const accepted =
      typeof body === "object" &&
      body !== null &&
      "accepted" in body &&
      (body as { accepted?: unknown }).accepted === true;

    if (!accepted) {
      return { ok: false, code: "server_rejected" };
    }

    const duplicate =
      "duplicate" in (body as object) &&
      (body as { duplicate?: unknown }).duplicate === true;

    return { ok: true, code: "accepted", duplicate };
  } catch {
    return { ok: false, code: "request_failed" };
  }
}
