import posthog from "posthog-js";

const key = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
let enabled = false;

export function initAnalytics(): void {
  if (!key) return;
  posthog.init(key, {
    api_host: (import.meta.env.VITE_POSTHOG_HOST as string | undefined) ?? "https://eu.i.posthog.com",
    autocapture: false,
    capture_pageview: false,
    persistence: "localStorage",
  });
  enabled = true;
}

export function track(event: string, props?: Record<string, unknown>): void {
  if (enabled) posthog.capture(event, props);
}
