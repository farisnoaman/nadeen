import type { Metadata } from 'next';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { vehicles } from '@/db/schema';

export const dynamic = 'force-dynamic';

const site = (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/$/, '');

async function loadVehicle(id: string) {
  try {
    const db = await getDb();
    const [row] = await db.select().from(vehicles).where(eq(vehicles.id, Number(id))).limit(1);
    return row ?? null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const vehicle = await loadVehicle(id);
  const name = vehicle ? `${vehicle.make} ${vehicle.model} ${vehicle.year}` : 'Vehicle for rent';
  const description = vehicle
    ? `Rent the ${vehicle.make} ${vehicle.model} ${vehicle.year} — ${vehicle.seats} seats, ${vehicle.fuel}, ${vehicle.gearbox}. From ${Math.round(Number(vehicle.dailyRate))}/day with live availability and protected booking on FleetFlow.`
    : 'Rent this vehicle on FleetFlow with live availability and protected booking.';
  const image = vehicle?.image?.startsWith('http') ? vehicle.image : `${site}${vehicle?.image || '/cars/audi.jpg'}`;
  return {
    title: `${name} — rent in ${vehicle?.location || 'your city'}`,
    description,
    alternates: {
      canonical: `/browse/${id}`,
      languages: { ar: `/browse/${id}`, en: `/browse/${id}` },
    },
    openGraph: {
      title: `Rent the ${name} on FleetFlow`,
      description,
      images: [image],
      type: 'website',
    },
  };
}

export default async function VehicleSegmentLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const vehicle = await loadVehicle(id);
  let jsonLd: Record<string, unknown> | null = null;
  if (vehicle) {
    jsonLd = {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: `${vehicle.make} ${vehicle.model} ${vehicle.year}`,
      image: [vehicle.image?.startsWith('http') ? vehicle.image : `${site}${vehicle.image}`],
      description: `${vehicle.seats}-seat ${vehicle.fuel} ${vehicle.bodyType}, ${vehicle.gearbox} transmission.`,
      brand: { '@type': 'Brand', name: vehicle.companyName || 'FleetFlow' },
      offers: {
        '@type': 'Offer',
        price: Number(vehicle.dailyRate),
        priceCurrency: vehicle.companyCurrency || 'USD',
        availability: vehicle.status === 'available' ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
        url: `${site}/browse/${id}`,
      },
    };
  }
  return (
    <>
      {jsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />}
      {children}
    </>
  );
}
