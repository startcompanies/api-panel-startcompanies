import { COUNTRY_NAMES } from './country-names.constants';
import { US_STATES_CANONICAL } from './us-states.constants';

/** Valores exactos de picklist Estructura_Societaria en Zoho (envío desde BD → API). */
export const ZOHO_LLC_ESTRUCTURA_SINGLE = 'LLC de un solo miembro (Single Member LLC)';
export const ZOHO_LLC_ESTRUCTURA_MULTI = 'LLC de múltiples miembros (Multi-Member LLC)';

const countryLowerToCanonical = new Map<string, string>();
for (const c of COUNTRY_NAMES) {
  countryLowerToCanonical.set(c.toLowerCase(), c);
}

const abbrToStateName = new Map<string, string>();
const stateNameLowerToCanonical = new Map<string, string>();
for (const s of US_STATES_CANONICAL) {
  abbrToStateName.set(s.abbreviation.toUpperCase(), s.value);
  stateNameLowerToCanonical.set(s.value.toLowerCase(), s.value);
}

/**
 * Devuelve el nombre de país en inglés canónico si coincide con la lista (ignorando mayúsculas);
 * si no, devuelve el texto recortado (datos legacy o texto libre).
 */
export function normalizeCountryForZoho(input: string | null | undefined): string {
  const trimmed = (input ?? '').trim();
  if (!trimmed) return '';
  const canonical = countryLowerToCanonical.get(trimmed.toLowerCase());
  return canonical ?? trimmed;
}

/**
 * Normaliza lista de países (array o string separado por comas) a nombres canónicos en inglés.
 */
export function normalizeCountriesArrayForZoho(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((x) => normalizeCountryForZoho(String(x)))
      .filter((c) => c.length > 0);
  }
  if (value && typeof value === 'string' && value.trim()) {
    return value
      .split(',')
      .map((c) => normalizeCountryForZoho(c.trim()))
      .filter((c) => c.length > 0);
  }
  return [];
}

/**
 * Convierte abreviatura de 2 letras o nombre de estado a nombre completo en inglés.
 * Si no coincide con un estado de EE. UU., devuelve el valor original (p. ej. provincia extranjera).
 */
export function normalizeUsStateForZoho(input: string | null | undefined): string {
  const trimmed = (input ?? '').trim();
  if (!trimmed) return '';
  if (/^[A-Za-z]{2}$/.test(trimmed)) {
    const byAbbr = abbrToStateName.get(trimmed.toUpperCase());
    if (byAbbr) return byAbbr;
  }
  const byName = stateNameLowerToCanonical.get(trimmed.toLowerCase());
  if (byName) return byName;
  return trimmed;
}
