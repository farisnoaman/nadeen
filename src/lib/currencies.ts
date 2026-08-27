export type CurrencyCode =
  | 'SAR'
  | 'AED'
  | 'QAR'
  | 'KWD'
  | 'BHD'
  | 'OMR'
  | 'YER_NEW'
  | 'YER_OLD'
  | 'USD';

export interface CurrencyMeta {
  labelEn: string;
  labelAr: string;
  /** Valid ISO 4217 code accepted by Intl.NumberFormat. YER_NEW/YER_OLD share 'YER'. */
  intlCode: string;
  symbol: string;
}

export const CURRENCY_META: Record<CurrencyCode, CurrencyMeta> = {
  SAR: { labelEn: 'Saudi Riyal', labelAr: 'ريال سعودي', intlCode: 'SAR', symbol: '﷼' },
  AED: { labelEn: 'UAE Dirham', labelAr: 'درهم إماراتي', intlCode: 'AED', symbol: 'د.إ' },
  QAR: { labelEn: 'Qatari Riyal', labelAr: 'ريال قطري', intlCode: 'QAR', symbol: 'ر.ق' },
  KWD: { labelEn: 'Kuwaiti Dinar', labelAr: 'دينار كويتي', intlCode: 'KWD', symbol: 'د.ك' },
  BHD: { labelEn: 'Bahraini Dinar', labelAr: 'دينار بحريني', intlCode: 'BHD', symbol: 'د.ب' },
  OMR: { labelEn: 'Omani Rial', labelAr: 'ريال عماني', intlCode: 'OMR', symbol: 'ر.ع.' },
  YER_NEW: { labelEn: 'Yemeni Rial (New)', labelAr: 'ريال يمني (جديد)', intlCode: 'YER', symbol: '﷼' },
  YER_OLD: { labelEn: 'Yemeni Rial (Old)', labelAr: 'ريال يمني (قديم)', intlCode: 'YER', symbol: '﷼' },
  USD: { labelEn: 'US Dollar', labelAr: 'دولار أمريكي', intlCode: 'USD', symbol: '$' },
};

export const SUPPORTED_CURRENCIES = Object.keys(CURRENCY_META) as CurrencyCode[];

export type CompanyCurrency = {
  baseCurrency: string;
  supportedCurrencies: string[];
  exchangeRates: Record<string, number>;
};

/**
 * The currency to actually display: the renter's selected one when the company
 * supports it, otherwise the company's base currency.
 */
export function effectiveCurrency(selected: string, company?: CompanyCurrency): string {
  if (!company) return selected;
  return company.supportedCurrencies.includes(selected) ? selected : company.baseCurrency;
}

/** Convert a base-currency amount to the effective display currency and format it. */
export function formatVehicleMoney(baseAmount: number, company: CompanyCurrency | undefined, selected: string, locale: 'en' | 'ar' = 'en'): string {
  const cur = effectiveCurrency(selected, company);
  const value = convert(baseAmount, cur, company?.exchangeRates ?? {}, company?.baseCurrency ?? cur);
  return formatMoney(value, cur, locale);
}

/**
 * Convert an amount expressed in the company `base` currency into `target`.
 * `rates[target]` is the number of `target` units per 1 `base` unit.
 */
export function convert(amountBase: number, target: string, rates: Record<string, number>, base: string): number {
  if (target === base) return amountBase;
  return amountBase * (rates[target] ?? 1);
}

export function formatMoney(value: number, currency: string, locale: 'en' | 'ar' = 'en'): string {
  const meta = CURRENCY_META[currency as CurrencyCode];
  const intlCode = meta?.intlCode ?? currency;
  return new Intl.NumberFormat(locale === 'ar' ? 'ar' : 'en-US', {
    style: 'currency',
    currency: intlCode,
  }).format(value);
}
