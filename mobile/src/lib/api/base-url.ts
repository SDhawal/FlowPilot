import { Platform } from "react-native";

const DEFAULT_PORT = 5165;
const ANDROID_EMULATOR_URL = `http://10.0.2.2:${DEFAULT_PORT}`;
const LOCALHOST_URL = `http://localhost:${DEFAULT_PORT}`;

type ResolveOptions = {
  envUrl: string | undefined;
  platform: typeof Platform.OS;
  isDev: boolean;
};

/**
 * Picks the API base URL. An explicit EXPO_PUBLIC_API_URL wins on every platform; otherwise, in
 * development, the Android emulator needs its host alias and web/iOS use localhost.
 * Production builds without the variable throw: a silent localhost fallback would ship a site
 * that calls the visitor's own machine, and the static web export would hide the mistake.
 */
export function resolveApiBaseUrl({ envUrl, platform, isDev }: ResolveOptions): string {
  const trimmed = envUrl?.trim();
  if (trimmed) return trimmed.replace(/\/+$/, "");
  if (!isDev) throw new Error("EXPO_PUBLIC_API_URL must be set for production builds");
  return platform === "android" ? ANDROID_EMULATOR_URL : LOCALHOST_URL;
}

// Must be referenced literally: Expo inlines EXPO_PUBLIC_* at bundle time.
export const apiBaseUrl = resolveApiBaseUrl({
  envUrl: process.env.EXPO_PUBLIC_API_URL,
  platform: Platform.OS,
  isDev: __DEV__,
});
