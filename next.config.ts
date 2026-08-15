import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  deploymentId: 'fleetflow-fluid-typography-v22',
  allowedDevOrigins: [
    '*.e2b.app',
    '3002-iii2d427jwqzjqf8pk22r.e2b.app',
    '3002-i46icc6rmy50vm5lhsd8b.e2b.app',
    '3000-iwlilsl5r4ix6c55fcfbb.e2b.app',
    '3001-iwlilsl5r4ix6c55fcfbb.e2b.app',
    '3002-iwlilsl5r4ix6c55fcfbb.e2b.app',
    '3002-ipp47ols7biu0hb2ckavk.e2b.app',
  ],
  experimental: { optimizePackageImports: ['lucide-react', 'recharts'] },
  images: { unoptimized: true },
  async headers() {
    if (process.env.NODE_ENV === 'production') return [];
    return [{ source: '/:path*', headers: [{ key:'Cache-Control', value:'no-store, max-age=0, must-revalidate' }] }];
  },
};

export default nextConfig;
