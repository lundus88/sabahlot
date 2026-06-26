import {
  SABAHLOT_FIELD_DEFINITIONS,
  type SabahLotFieldDefinition,
} from "./sabahlot-field-definitions";

export interface SabahLotInputRegistry {
  registryId: string;
  version: string;
  privateByDefault: boolean;
  fields: SabahLotFieldDefinition[];
}

export const SABAHLOT_INPUT_REGISTRY: SabahLotInputRegistry = {
  registryId: "sabahlot-alpha-input-registry",
  version: "2026-06-26-alpha",
  privateByDefault: true,
  fields: SABAHLOT_FIELD_DEFINITIONS,
};

export function getSabahLotFieldDefinition(
  fieldKey: string,
): SabahLotFieldDefinition | undefined {
  return SABAHLOT_INPUT_REGISTRY.fields.find(
    (field) => field.fieldKey === fieldKey,
  );
}

export function getRequiredSabahLotFields(): SabahLotFieldDefinition[] {
  return SABAHLOT_INPUT_REGISTRY.fields.filter(
    (field) => field.required,
  );
}
