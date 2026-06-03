// Must be the first import in main.ts — initializes Sentry before anything else loads.
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV ?? 'development',
  // Only active when SENTRY_DSN is provided — no-op in local dev without it
  enabled: !!process.env.SENTRY_DSN,
});
