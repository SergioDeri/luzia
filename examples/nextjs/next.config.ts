import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The luzIA packages are consumed from source inside this monorepo.
  transpilePackages: ['@luzia/core'],
};

export default nextConfig;
