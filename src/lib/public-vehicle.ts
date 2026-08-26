const privateVehicleFields = new Set([
  'companyId', 'licensePlate', 'vin', 'odometer', 'fuelLevel',
  'insuranceProvider', 'insurancePolicyNumber', 'insurancePolicyExpiry', 'insuranceDeductible',
  'createdAt',
]);

/** Removes fleet-operational identifiers and telemetry from guest marketplace responses. */
export function toPublicVehicle<T extends Record<string, any>>(vehicle: T) {
  const result = Object.fromEntries(Object.entries(vehicle).filter(([key]) => !privateVehicleFields.has(key)));
  if (Array.isArray(result.protectionPackages)) result.protectionPackages = result.protectionPackages.map((pkg:any) => ({
    id:pkg.id, name:pkg.name, tier:pkg.tier, description:pkg.description,
    dailyPrice:pkg.dailyPrice, deductible:pkg.deductible, coverage:pkg.coverage,
  }));
  return result;
}

export function toPublicPromotion(promotion: Record<string, any>) {
  const { companyId, appliesTo, enabled, redemptions, createdAt, ...publicPromotion } = promotion;
  return publicPromotion;
}
