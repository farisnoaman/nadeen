export type RateType = 'hour' | 'day' | 'week' | 'month';
export const rateField: Record<RateType, 'hourlyRate'|'dailyRate'|'weeklyRate'|'monthlyRate'> = {
  hour:'hourlyRate', day:'dailyRate', week:'weeklyRate', month:'monthlyRate',
};
export function endDate(start: Date, type: RateType, quantity: number) {
  const value = new Date(start);
  if (type === 'hour') value.setHours(value.getHours() + quantity);
  if (type === 'day') value.setDate(value.getDate() + quantity);
  if (type === 'week') value.setDate(value.getDate() + quantity * 7);
  if (type === 'month') value.setMonth(value.getMonth() + quantity);
  return value;
}
export function promotionState(p: { enabled:boolean; startsAt:Date|string; endsAt:Date|string }) {
  const now=Date.now(), start=new Date(p.startsAt).getTime(), end=new Date(p.endsAt).getTime();
  if (!p.enabled) return 'paused'; if (start > now) return 'scheduled'; if (end < now) return 'expired'; return 'live';
}
export function discountFor(base:number, promo:{type:'percentage'|'fixed';value:number}) {
  return Math.min(base, promo.type==='percentage' ? base * promo.value / 100 : promo.value);
}
