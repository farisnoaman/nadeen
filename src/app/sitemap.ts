import type { MetadataRoute } from 'next';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { vehicles } from '@/db/schema';

export const dynamic = 'force-dynamic';

const site = (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/$/, '');

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${site}/`, lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { url: `${site}/browse`, lastModified: now, changeFrequency: 'daily', priority: 0.9 },
    { url: `${site}/support`, lastModified: now, changeFrequency: 'monthly', priority: 0.4 },
    { url: `${site}/privacy`, lastModified: now, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${site}/terms`, lastModified: now, changeFrequency: 'yearly', priority: 0.2 },
  ];
  try {
    const db = await getDb();
    const rows = await db.select({ id: vehicles.id, createdAt: vehicles.createdAt }).from(vehicles).where(eq(vehicles.status, 'available'));
    const vehicleRoutes: MetadataRoute.Sitemap = rows.map((row: any) => ({
      url: `${site}/browse/${row.id}`,
      lastModified: row.createdAt ?? now,
      changeFrequency: 'daily' as const,
      priority: 0.8,
    }));
    return [...staticRoutes, ...vehicleRoutes];
  } catch {
    return staticRoutes;
  }
}
