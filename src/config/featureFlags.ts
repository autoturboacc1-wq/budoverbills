// Centralized feature flags.
//
// These gate features that are partially implemented or pending external
// dependencies (VAPID keys, payment provider integration). When a flag is
// `false` the corresponding UI must be hidden — never show buttons that lead
// to a "not enabled" toast.
//
// Defaults are `false` so that staging/preview environments don't accidentally
// expose half-built flows. Set `VITE_*_ENABLED=true` in production env once
// the underlying integration is ready.

function readBooleanEnv(key: string): boolean {
  const raw = (import.meta.env as Record<string, string | undefined>)[key];
  return raw === "true" || raw === "1";
}

export const featureFlags = {
  // Web Push (VAPID) dispatch from edge function. When false, the
  // `PushNotificationToggle` is hidden and the chat send path does not
  // invoke `send-chat-push-notification`. In-app (DB) notifications still
  // work regardless.
  pushNotificationsEnabled: readBooleanEnv("VITE_PUSH_NOTIFICATIONS_ENABLED"),

  // Real payment gateway (Stripe/Omise/etc.) for purchasing agreement
  // credits. When false, the Subscription page hides the coffee purchase
  // UI and shows a "coming soon" notice. Free quota still works.
  paymentGatewayEnabled: readBooleanEnv("VITE_PAYMENT_GATEWAY_ENABLED"),
} as const;
