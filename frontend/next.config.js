const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.googleusercontent.com' },
      { protocol: 'https', hostname: 'avatars.githubusercontent.com' },
    ],
  },
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ||
      "https://igspopoejhsxvwvxyhbh.supabase.co/functions/v1/api",
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ||
      "https://igspopoejhsxvwvxyhbh.supabase.co",
    NEXT_PUBLIC_BACKEND_URL: process.env.NEXT_PUBLIC_BACKEND_URL || "",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlnc3BvcG9lamhzeHZ3dnh5aGJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE0ODQzNTksImV4cCI6MjA4NzA2MDM1OX0.a0P9MHW7fXD2LfjHq-fSs_pLsefUpNAivDn7qbM91v8",
  },
  async rewrites() {
    const backendOrigin = process.env.BACKEND_ORIGIN || 'http://65.108.90.178:3001';
    return [
      {
        source: '/v1/:path*',
        destination: `${backendOrigin}/v1/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
