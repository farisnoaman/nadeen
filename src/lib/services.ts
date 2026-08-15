import { eq } from 'drizzle-orm';
import { premiumServices } from '@/db/schema';

export const DEFAULT_PREMIUM_SERVICES = [
  { key: 'driver', name: 'Professional driver', description: 'Licensed private driver for local or long-distance travel.', dailyPrice: 95 },
  { key: 'luggage', name: 'Loading & offloading help', description: 'A trained assistant to load and offload luggage safely.', dailyPrice: 35 },
  { key: 'child-seat', name: 'Child safety seat', description: 'Clean, inspected child seat installed before pickup.', dailyPrice: 15 },
  { key: 'wifi', name: 'In-car Wi-Fi', description: 'Unlimited high-speed mobile Wi-Fi for the whole trip.', dailyPrice: 12 },
];

export async function ensureServiceCatalog(db: any, companyId: number) {
  let rows = await db.select().from(premiumServices).where(eq(premiumServices.companyId, companyId));
  if (!rows.length) {
    try {
      rows = await db.insert(premiumServices).values(DEFAULT_PREMIUM_SERVICES.map(service => ({
        ...service, companyId, active: true,
      }))).returning();
    } catch {
      rows = await db.select().from(premiumServices).where(eq(premiumServices.companyId, companyId));
    }
  }
  return rows;
}
