/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [{
      source: '/api/:path*',
      destination: (process.env.API_URL || 'http://localhost:4002') + '/api/:path*',
    }];
  },
};

module.exports = nextConfig;
