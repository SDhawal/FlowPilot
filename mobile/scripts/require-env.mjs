// Fails a production build when a required environment variable is missing or blank.
// `expo export` swallows errors thrown while statically rendering routes, so the runtime check in
// src/lib/api/base-url.ts can't stop a misconfigured build on its own. This runs before it.
// Usage: node scripts/require-env.mjs NAME [NAME...]

const missing = process.argv.slice(2).filter((name) => !process.env[name]?.trim());

if (missing.length > 0) {
  for (const name of missing) {
    console.error(`${name} must be set for production builds.`);
  }
  process.exit(1);
}
