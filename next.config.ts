/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Remove invalid 'appDir' key
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:3001/api/:path*',
      },
    ];
  },
  // Silence turbopack root warning by setting the root directory
  turbopack: {
    root: __dirname,
  },
};

module.exports = nextConfig;