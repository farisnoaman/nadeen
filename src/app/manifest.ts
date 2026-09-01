import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'FleetFlow — Move freely',
    short_name: 'FleetFlow',
    description: 'Flexible car rental marketplace and fleet management platform.',
    start_url: '/',
    display: 'standalone',
    background_color: '#f5f6f2',
    theme_color: '#356657',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    ],
  };
}
