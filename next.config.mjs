/** @type {import('next').NextConfig} */
const nextConfig = {
  /* config options here */
  images: {
    domains: ["images.unsplash.com"],
  },
  // The floating "N" badge (bottom-left, dev mode only) is Next.js's own
  // dev-tools indicator, not anything in this codebase -- it never shows
  // in a production build, but turning it off here also stops it from
  // covering the footer text while developing locally.
  devIndicators: false,
  // Native page-transition animation (template.jsx + the ::view-transition-*
  // rules in globals.css) — needs react/react-dom >= 19.3.0, which exports
  // the `ViewTransition` component this depends on.
  experimental: {
    viewTransition: true,
  },
};

export default nextConfig;
