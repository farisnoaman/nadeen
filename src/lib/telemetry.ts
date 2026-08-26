type ConditionLog = {
  id:number;
  vehicleId:number;
  eventType:string;
  odometer:number;
  fuelAddedLiters:number|null;
  fuelCost:number|null;
  createdAt:Date|string;
};

type VehicleProfile = { odometer:number; fuel?:string; bodyType?:string; category?:string };

export function canonicalOdometer(vehicleOdometer:unknown, logs:ConditionLog[] = []) {
  return Math.max(Number(vehicleOdometer || 0), ...logs.map(log => Number(log.odometer || 0)));
}

export function annotateRefueling(logs:ConditionLog[]) {
  const previousByVehicle = new Map<number,ConditionLog>();
  const annotation = new Map<number,{distanceSincePreviousFuel:number;costPerKm:number;litersPer100Km:number}>();
  const refuels = logs.filter(log => log.eventType === 'refuel')
    .slice().sort((left,right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());
  for (const log of refuels) {
    const previous = previousByVehicle.get(log.vehicleId);
    if (previous) {
      const distance = Math.max(0, Number(log.odometer) - Number(previous.odometer));
      if (distance > 0) annotation.set(log.id, {
        distanceSincePreviousFuel:distance,
        costPerKm:Math.round(Number(log.fuelCost || 0) / distance * 1000) / 1000,
        litersPer100Km:Math.round(Number(log.fuelAddedLiters || 0) / distance * 100 * 100) / 100,
      });
    }
    if (!previous || Number(log.odometer) >= Number(previous.odometer)) previousByVehicle.set(log.vehicleId, log);
  }
  return annotation;
}

export function fuelEfficiencyAnalytics(vehicle:VehicleProfile, logs:ConditionLog[]) {
  const refuels = logs.filter(log => log.eventType === 'refuel')
    .slice().sort((left,right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());
  const annotations = annotateRefueling(refuels);
  const measured = refuels.map(log => ({ log, interval:annotations.get(log.id) })).filter(entry => entry.interval);
  const totalDistance = measured.reduce((sum,entry) => sum + entry.interval!.distanceSincePreviousFuel, 0);
  const totalLiters = measured.reduce((sum,entry) => sum + Number(entry.log.fuelAddedLiters || 0), 0);
  const totalCost = measured.reduce((sum,entry) => sum + Number(entry.log.fuelCost || 0), 0);
  const litersPer100Km = totalDistance > 0 ? Math.round(totalLiters / totalDistance * 100 * 100) / 100 : 0;
  const costPerKm = totalDistance > 0 ? Math.round(totalCost / totalDistance * 1000) / 1000 : 0;
  const fuel = String(vehicle.fuel || '').toLowerCase();
  const largeBody = /suv|pickup|van/i.test(`${vehicle.bodyType || ''} ${vehicle.category || ''}`);
  const target = fuel.includes('hybrid') ? (largeBody ? 10 : 8)
    : fuel.includes('diesel') ? (largeBody ? 13 : 10)
      : fuel.includes('electric') ? 0
        : largeBody ? 16 : 12;
  let status:'insufficient_data'|'good'|'watch'|'withdrawal_review' = 'insufficient_data';
  if (measured.length >= 2 && totalDistance >= 200) {
    if (fuel.includes('electric')) status = costPerKm <= .6 ? 'good' : costPerKm <= 1 ? 'watch' : 'withdrawal_review';
    else status = litersPer100Km <= target * 1.15 ? 'good' : litersPer100Km <= target * 1.5 ? 'watch' : 'withdrawal_review';
  }
  return {
    lastRecordedOdometer:canonicalOdometer(vehicle.odometer, logs),
    refuelEvents:refuels.length,
    measuredIntervals:measured.length,
    totalDistance,
    totalLiters:Math.round(totalLiters * 100) / 100,
    totalCost:Math.round(totalCost * 100) / 100,
    litersPer100Km,
    costPerKm,
    targetLitersPer100Km:target,
    status,
    intervals:Object.fromEntries([...annotations.entries()].map(([id,value]) => [String(id),value])),
  };
}
