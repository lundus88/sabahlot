import {
  buildProfessionalHelpPayload,
  isProfessionalHelpInputReady,
  type ProfessionalHelpInput,
} from "./lead-handoff";

const input: ProfessionalHelpInput = {
  submissionId: "00000000-0000-4000-8000-000000000001",
  name: "Ali Example",
  email: "ALI@EXAMPLE.COM",
  phone: "+60123456789",
  service: "Boundary / survey",
  message: "Please contact me about this land matter.",
  consentToContact: true,
  turnstileToken: "test-token",
  context: {
    landCaseType: "titled_land",
    district: "Penampang",
    village: "Kg. Example",
    estimatedAreaM2: 1234.567,
    issueTags: ["boundary_dispute", "boundary_dispute", "encroachment"],
    documentTypes: ["title_deed", "plan_or_sketch"],
  },
};

const payload = buildProfessionalHelpPayload(input);

if (payload.source_app !== "sabahlot") throw new Error("source mismatch");
if (payload.consent_to_contact !== true) throw new Error("consent mismatch");
if (payload.email !== "ali@example.com") throw new Error("email normalization failed");
if (payload.location !== "Kg. Example, Penampang") throw new Error("location mapping failed");
if (payload.land_context.estimated_area_m2 !== 1234.57) throw new Error("area rounding failed");
if (payload.land_context.issue_tags.length !== 2) throw new Error("issue dedupe failed");
if (!isProfessionalHelpInputReady(input)) throw new Error("complete input should be ready");
if (isProfessionalHelpInputReady({ ...input, consentToContact: false })) throw new Error("consent must be required");
if (isProfessionalHelpInputReady({ ...input, turnstileToken: "" })) throw new Error("turnstile must be required");

console.log("lead-handoff QA: PASS");
