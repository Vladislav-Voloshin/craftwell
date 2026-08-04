import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Craftwell iOS shell (Capacitor).
 *
 * The app is server-rendered Next.js and cannot be static-exported, so the
 * native shell loads the hosted web app over HTTPS and layers native plugins
 * (push, Sign in with Apple, IAP) on top. `webDir` is a required fallback
 * bundle (the offline shell in /public); `server.url` is the primary load.
 *
 * For dev builds, point `server.url` at the dev preview URL instead.
 */
const config: CapacitorConfig = {
  appId: "com.craftwell.app",
  appName: "Craftwell",
  webDir: "public",
  server: {
    url: "https://craftwell.vercel.app",
    cleartext: false,
  },
  ios: {
    contentInset: "always",
  },
};

export default config;
