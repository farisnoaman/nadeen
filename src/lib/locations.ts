import type { PickupLocationOption } from '@/db/schema';

const clean = (value: unknown, maximum = 100) => String(value || '').trim().replace(/\s+/g, ' ').slice(0, maximum);

export function normalizePickupLocations(value: unknown, fallback = ''): PickupLocationOption[] {
  const source = Array.isArray(value) ? value : [];
  const locations: PickupLocationOption[] = [];
  const seen = new Set<string>();
  for (const entry of source.slice(0, 20)) {
    const city = clean((entry as any)?.city, 80);
    const site = clean((entry as any)?.site, 120);
    if (city.length < 2 || site.length < 2) continue;
    const key = `${city}\u0000${site}`.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    locations.push({ city, site });
  }
  const legacy = clean(fallback, 120);
  if (!locations.length && legacy.length >= 2) locations.push({ city: legacy, site: legacy });
  return locations;
}

export function findPickupLocation(value: unknown, city: unknown, site: unknown, fallback = '') {
  const locations = normalizePickupLocations(value, fallback);
  const requestedCity = clean(city, 80).toLocaleLowerCase();
  const requestedSite = clean(site, 120).toLocaleLowerCase();
  return locations.find(location => location.city.toLocaleLowerCase() === requestedCity
    && location.site.toLocaleLowerCase() === requestedSite) || null;
}

export function locationLabel(location: PickupLocationOption) {
  return location.city.toLocaleLowerCase() === location.site.toLocaleLowerCase()
    ? location.site
    : `${location.site} · ${location.city}`;
}
