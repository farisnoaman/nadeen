import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: { optimizePackageImports: ['lucide-react', 'recharts'] },
  images: { unoptimized: true },
};

export default nextConfig;
