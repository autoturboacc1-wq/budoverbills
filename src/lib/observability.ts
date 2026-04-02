interface SentryModule {
  init: (options: { dsn: string; environment: string; tracesSampleRate: number }) => void;
  captureException: (error: unknown, context?: { extra?: Record<string, unknown> }) => void;
}

const sentryDsn = import.meta.env.VITE_SENTRY_DSN;
let sentryModulePromise: Promise<SentryModule | null> | null = null;

function loadSentry(): Promise<SentryModule | null> {
  if (!sentryDsn) {
    return Promise.resolve(null);
  }

  if (!sentryModulePromise) {
    sentryModulePromise = import('@sentry/react').catch(() => null);
  }

  return sentryModulePromise;
}

export function initObservability(): void {
  if (!sentryDsn) {
    return;
  }

  void loadSentry().then((Sentry) => {
    if (!Sentry) {
      return;
    }

    Sentry.init({
      dsn: sentryDsn,
      environment: import.meta.env.MODE,
      tracesSampleRate: 0.1,
    });
  });
}

export function captureException(error: unknown, extra?: Record<string, unknown>): void {
  if (!sentryDsn) {
    return;
  }

  void loadSentry().then((Sentry) => {
    if (!Sentry) {
      return;
    }

    Sentry.captureException(error, {
      extra,
    });
  });
}
