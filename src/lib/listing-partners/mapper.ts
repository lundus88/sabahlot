// Sprint listing-partner-backend: DB row <-> domain object mapping.

import type { ListingPartner, ListingPartnerRow } from "./types";

export function mapListingPartnerRow(row: ListingPartnerRow): ListingPartner {
  return {
    id: row.id,
    companyName: row.company_name,
    displayName: row.display_name,
    phone: row.phone,
    email: row.email,
    renNumber: row.ren_number,
    bio: row.bio,
    status: row.status,
    approvedBy: row.approved_by,
    approvedAt: row.approved_at,
    publicContactConsent: row.public_contact_consent,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
