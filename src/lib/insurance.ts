export type ProtectionTier = 'basic' | 'pro' | 'premium' | 'full';

export type ProtectionPackage = {
  tier: ProtectionTier;
  name: string;
  dailyPrice: number;
  deductible: number;
  active: boolean;
  coverage: string[];
};

export const PROTECTION_TIERS: ProtectionTier[] = ['basic', 'pro', 'premium', 'full'];
export const PROTECTION_COVERAGE_CODES = ['TPL', 'CDW', 'LDW', 'SCDW', 'TP', 'PAI', 'RSA', 'GLASS_TYRES'] as const;

const DEFAULT_COVERAGE: Record<ProtectionTier, string[]> = {
  basic: ['TPL'],
  pro: ['TPL', 'CDW'],
  premium: ['TPL', 'CDW', 'TP', 'PAI', 'RSA'],
  full: ['TPL', 'LDW', 'SCDW', 'TP', 'PAI', 'RSA', 'GLASS_TYRES'],
};

const DEFAULT_PRICE: Record<ProtectionTier, number> = {
  basic: 0,
  pro: 35,
  premium: 60,
  full: 95,
};

const DEFAULT_DEDUCTIBLE: Record<ProtectionTier, number> = {
  basic: 5000,
  pro: 3000,
  premium: 1500,
  full: 0,
};

export function protectionCoverage(tier: ProtectionTier, value?: unknown): string[] {
  const requested = Array.isArray(value)
    ? value.map(code => String(code).toUpperCase()).filter(code => PROTECTION_COVERAGE_CODES.includes(code as any))
    : [];
  const coverage = requested.length ? requested : DEFAULT_COVERAGE[tier];
  return ['TPL', ...coverage.filter(code => code !== 'TPL')];
}

export function defaultProtectionPackages(vehicleDeductible?: number | null): ProtectionPackage[] {
  return PROTECTION_TIERS.map(tier => ({
    tier,
    name: tier[0].toUpperCase() + tier.slice(1),
    dailyPrice: DEFAULT_PRICE[tier],
    deductible: tier === 'basic' && Number.isFinite(Number(vehicleDeductible))
      ? Math.max(0, Number(vehicleDeductible))
      : DEFAULT_DEDUCTIBLE[tier],
    active: true,
    coverage: [...DEFAULT_COVERAGE[tier]],
  }));
}

export function normalizeProtectionPackages(value: unknown, vehicleDeductible?: number | null): ProtectionPackage[] {
  const defaults = defaultProtectionPackages(vehicleDeductible);
  const input = Array.isArray(value) ? value : [];
  return defaults.map(fallback => {
    const raw = input.find((entry: any) => entry?.tier === fallback.tier) as Partial<ProtectionPackage> | undefined;
    const dailyPrice = Number(raw?.dailyPrice);
    const deductible = Number(raw?.deductible);
    return {
      tier: fallback.tier,
      name: String(raw?.name || fallback.name).slice(0, 40),
      dailyPrice: Number.isFinite(dailyPrice) ? Math.max(0, dailyPrice) : fallback.dailyPrice,
      deductible: Number.isFinite(deductible) ? Math.max(0, deductible) : fallback.deductible,
      active: fallback.tier === 'basic' ? true : raw?.active !== false,
      // Coverage definitions are fixed so a price edit cannot silently change what a tier promises.
      coverage: [...DEFAULT_COVERAGE[fallback.tier]],
    };
  });
}

export function protectionPackage(value: unknown, tier: unknown, vehicleDeductible?: number | null) {
  const packages = normalizeProtectionPackages(value, vehicleDeductible);
  const selected = packages.find(item => item.tier === tier && item.active);
  return selected || packages[0];
}

export const KSA_RENTAL_INSURANCE_NOTICE =
  'Mandatory third-party liability remains tied to the vehicle policy. Damage waivers are contractual rental protections, not replacement insurance. Coverage requires the official accident report and remains subject to the disclosed policy, deductible, authorized-driver rules, and exclusions.';
