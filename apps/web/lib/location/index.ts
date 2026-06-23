// Shared Bangladesh location data (blueprint "apps/web shared cores" →
// lib/location/index.ts). Re-exports `bangladesh-location-data` and provides a
// Division → District → Thana(upazila) cascade helper.
//
// Consumers:
//   * Wave-1 admin manual order entry (P3.4 address cascade)
//   * Wave-2 storefront checkout (P1.3 address cascade) — same helper
//
// DESIGN P1.3 / P3.4: render BANGLA option text + Bangla labels; persist the
// canonical Bangla `title` to customer_address.division/district/thana (the
// courier reads Bangla addresses). English titles are available for
// type-to-filter transliteration matching.
//
// The package splits its named exports by file: bangla names live in the
// `/bangla` subpath, english names in `/english`. The shared index.d.ts declares
// every name for both subpaths, so the imports below typecheck.
import {
  divisions_bn,
  districts_bn,
  upazilas_bn,
} from "bangladesh-location-data/bangla";
import {
  divisions_en,
  districts_en,
  upazilas_en,
} from "bangladesh-location-data/english";

export interface LocationItem {
  /** Numeric id used to key the child maps. */
  value: number;
  /** Display name (Bangla via the *_bn exports). */
  title: string;
}

export {
  divisions_bn,
  districts_bn,
  upazilas_bn,
  divisions_en,
  districts_en,
  upazilas_en,
};

/** One level of the cascade: a Bangla option plus its English title (for filter). */
export interface CascadeOption {
  value: number;
  /** Bangla title — what gets stored and shown. */
  bn: string;
  /** English title — used only for type-to-filter transliteration matching. */
  en: string;
}

/**
 * Merge the parallel _bn / _en lists into CascadeOption[] by index. The package
 * keeps both languages in lockstep order, so index alignment is safe and avoids
 * an O(n) lookup per item.
 */
function zip(bn: LocationItem[], en: LocationItem[]): CascadeOption[] {
  return bn.map((b, i) => ({
    value: b.value,
    bn: b.title,
    en: en[i]?.title ?? b.title,
  }));
}

/** All 8 divisions, Bangla + English. */
export function getDivisions(): CascadeOption[] {
  return zip(divisions_bn, divisions_en);
}

/** Districts under a division id; [] for an unknown/unset division. */
export function getDistricts(divisionValue: number | null): CascadeOption[] {
  if (divisionValue == null) return [];
  const key = String(divisionValue);
  return zip(districts_bn[key] ?? [], districts_en[key] ?? []);
}

/** Thanas/upazilas under a district id; [] for an unknown/unset district. */
export function getThanas(districtValue: number | null): CascadeOption[] {
  if (districtValue == null) return [];
  const key = String(districtValue);
  return zip(upazilas_bn[key] ?? [], upazilas_en[key] ?? []);
}

export interface CascadeState {
  divisionValue: number | null;
  districtValue: number | null;
}

/**
 * The full cascade for a given selection — divisions are always present;
 * districts appear once a division is chosen; thanas once a district is chosen.
 * A single call powers both the checkout and manual-order address pickers.
 */
export function getCascade(state: CascadeState): {
  divisions: CascadeOption[];
  districts: CascadeOption[];
  thanas: CascadeOption[];
} {
  return {
    divisions: getDivisions(),
    districts: getDistricts(state.divisionValue),
    thanas: getThanas(state.districtValue),
  };
}

/** A flat, serializable snapshot of the whole tree — handed to client pickers. */
export interface LocationTree {
  divisions: CascadeOption[];
  /** keyed by division value → its districts */
  districtsByDivision: Record<number, CascadeOption[]>;
  /** keyed by district value → its thanas */
  thanasByDistrict: Record<number, CascadeOption[]>;
}

/**
 * Build the full Bangla location tree once on the server and pass it to a client
 * picker as a prop — avoids shipping the ~2MB package to the bundle and keeps the
 * cascade entirely client-interactive (bottom-sheet selects, DESIGN P1.3).
 */
export function buildLocationTree(): LocationTree {
  const divisions = getDivisions();
  const districtsByDivision: Record<number, CascadeOption[]> = {};
  const thanasByDistrict: Record<number, CascadeOption[]> = {};

  for (const division of divisions) {
    const districts = getDistricts(division.value);
    districtsByDivision[division.value] = districts;
    for (const district of districts) {
      thanasByDistrict[district.value] = getThanas(district.value);
    }
  }

  return { divisions, districtsByDivision, thanasByDistrict };
}
