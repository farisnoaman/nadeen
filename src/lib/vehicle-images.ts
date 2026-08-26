const MAX_VEHICLE_IMAGES = 4;

export function normalizeVehicleImages(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(item => toImageUrl(String(item).trim())).filter(item => {
    try {
      const url = new URL(item);
      return ['http:', 'https:'].includes(url.protocol);
    } catch {
      return false;
    }
  }))].slice(0, MAX_VEHICLE_IMAGES);
}

function toImageUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.hostname === 'drive.google.com') {
      const fileId = url.pathname.match(/\/file\/d\/([^/]+)/)?.[1] || url.searchParams.get('id');
      if (fileId) return `https://drive.google.com/uc?export=view&id=${fileId}`;
    }
  } catch {
    return value;
  }
  return value;
}

export { MAX_VEHICLE_IMAGES };
