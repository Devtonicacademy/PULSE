/** @type {import('next').NextConfig} */

// The app was built with Vite, so deployments (Railway) and local .env files still use VITE_* names.
// Both spellings work: NEXT_PUBLIC_* wins, VITE_* is the fallback. Next inlines the result at build time.
const CLIENT_ENV = [
  'FIREBASE_API_KEY',
  'FIREBASE_AUTH_DOMAIN',
  'FIREBASE_PROJECT_ID',
  'FIREBASE_STORAGE_BUCKET',
  'FIREBASE_MESSAGING_SENDER_ID',
  'FIREBASE_APP_ID',
  'FIREBASE_MEASUREMENT_ID',
  'USE_FIREBASE_EMULATOR'
];

const env = {};
for (const name of CLIENT_ENV) {
  const value = process.env[`NEXT_PUBLIC_${name}`] ?? process.env[`VITE_${name}`];
  if (value !== undefined) env[`NEXT_PUBLIC_${name}`] = value;
}

const nextConfig = {
  reactStrictMode: true,
  env,
  poweredByHeader: false,
  // Type errors are caught by `npm run typecheck`; the build still fails on them
  typescript: { ignoreBuildErrors: false }
};

export default nextConfig;
