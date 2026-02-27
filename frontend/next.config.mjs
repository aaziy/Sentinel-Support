/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow the backend URL to be set via env at build time
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000",
  },
  // No trailing slash — keeps Vercel routing clean
  trailingSlash: false,
};

export default nextConfig;
