import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The luzIA packages are consumed from source inside this monorepo.
  transpilePackages: ['@luzia/core', '@luzia/react', '@luzia/widget'],
  // Don't generate an AGENTS.md file in the example.
  agentRules: false,
};

export default nextConfig;
