/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  readonly VITE_SENTRY_DSN?: string;
  readonly VITE_PUSH_NOTIFICATIONS_ENABLED?: string;
  readonly VITE_PAYMENT_GATEWAY_ENABLED?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
