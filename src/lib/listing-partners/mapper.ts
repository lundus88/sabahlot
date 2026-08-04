// Sprint listing-partner-backend / property-listings-backend: DB row <->
// domain object mapping for this module's two tables.

import type {
  ListingPartner,
  ListingPartnerRow,
  PropertyListing,
  PropertyListingRow,
} from "./types";

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

export function mapPropertyListingRow(row: PropertyListingRow): PropertyListing {
  return {
    id: row.id,
    partnerId: row.partner_id,
    title: row.title,
    description: row.description,
    listingType: row.listing_type,
    price: row.price,
    district: row.district,
    village: row.village,
    region: row.region,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
