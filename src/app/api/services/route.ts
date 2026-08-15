import { and, asc, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { premiumServices, vehicles } from '@/db/schema';
import { requireUser } from '@/lib/auth';
import { fail, ok } from '@/lib/http';
import { ensureServiceCatalog } from '@/lib/services';

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const db = await getDb();
    let companyId = user.companyId;
    if (user.role === 'renter') {
      const vehicleId = Number(new URL(request.url).searchParams.get('vehicleId'));
      const [vehicle] = await db.select({ companyId: vehicles.companyId }).from(vehicles)
        .where(eq(vehicles.id, vehicleId)).limit(1);
      if (!vehicle) return ok({ error: 'Vehicle not found' }, 404);
      companyId = vehicle.companyId;
    }
    const catalog = await ensureServiceCatalog(db, companyId!);
    const services = catalog.filter((service: any) => user.role === 'company' || service.active)
      .sort((a: any, b: any) => a.id - b.id);
    return ok({ services });
  } catch (error) { return fail(error); }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser('company');
    const body = await request.json();
    if (!body.name || !body.key || Number(body.dailyPrice) < 0) throw new Error('Complete the service details.');
    const db = await getDb();
    const [service] = await db.insert(premiumServices).values({
      companyId: user.companyId!, key: String(body.key).toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      name: body.name, description: body.description || '', dailyPrice: Number(body.dailyPrice), active: body.active !== false,
    }).returning();
    return ok({ service }, 201);
  } catch (error) { return fail(error); }
}
