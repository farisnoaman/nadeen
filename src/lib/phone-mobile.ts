export type GulfMobileRule = { length: number; starts: string[]; name: string };

// Mobile-number rules per GCC + Yemen market. `length` is the national number
// length (digits only, without the country/dial code). `starts` are the valid
// leading digits for mobile (cellular) ranges; landline prefixes are excluded.
export const GULF_MOBILE: Record<string, GulfMobileRule> = {
  '966': { length: 9, starts: ['5'], name: 'Saudi Arabia' }, // SA: 05X → 5 + 8
  '971': { length: 9, starts: ['5'], name: 'UAE' }, // AE: 05X → 5 + 8
  '974': { length: 8, starts: ['3', '4', '5', '6', '7'], name: 'Qatar' }, // QA: 3/4/5/6/7 + 7
  '965': { length: 8, starts: ['5', '6', '9'], name: 'Kuwait' }, // KW: 5/6/9 + 7
  '973': { length: 8, starts: ['3'], name: 'Bahrain' }, // BH: 33/34/35/36/38/39 + 6
  '968': { length: 8, starts: ['9'], name: 'Oman' }, // OM: 9X + 7
  '967': { length: 9, starts: ['7'], name: 'Yemen' }, // YE: 7X + 8
};

// Validates a national (local, without dial code) number against the selected
// market's mobile rules. Falls back to generic international length checks for
// non-Gulf dial codes so the helper stays safe to use on the client.
export function isValidGulfMobile(dialCode: string, national: string): boolean {
  const digits = national.replace(/\D/g, '');
  const rule = GULF_MOBILE[dialCode];
  if (!rule) return digits.length >= 8 && digits.length <= 15;
  if (digits.length !== rule.length) return false;
  if (!rule.starts.includes(digits[0])) return false;
  return true;
}

export function normalizeGulfNational(dialCode: string, raw: string): string {
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith(dialCode)) digits = digits.slice(dialCode.length);
  if (digits.startsWith('0')) digits = digits.slice(1);
  return digits;
}
