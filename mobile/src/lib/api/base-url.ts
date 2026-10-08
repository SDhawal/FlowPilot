import { Platform } from "react-native";

const DEFAULT_PORT = 5165;
const ANDROID_EMULATOR_URL = `http://10.0.2.2:${DEFAULT_PORT}`;
const LOCALHOST_URL = `http://localhost:${DEFAULT_PORT}`;

type ResolveOptions = {
  envUrl: string | undefined;
  platform: typeof Platform.OS;
};

/**
 * Picks the API base URL. An explicit EXPO_PUBLIC_API_URL wins on every platform; otherwise the
 * Android emulator needs its host alias and web/iOS use localhost.
 */
export function resolveApiBaseUrl({ envUrl, platform }: ResolveOptions): string {
  const trimmed = envUrl?.trim();
  if (trimmed) return trimmed.replace(/\/+$/, "");
  return platform === "android" ? ANDROID_EMULATOR_URL : LOCALHOST_URL;
}

// Must be referenced literally: Expo inlines EXPO_PUBLIC_* at bundle time.
export const apiBaseUrl = resolveApiBaseUrl({
  envUrl: process.env.EXPO_PUBLIC_API_URL,
  platform: Platform.OS,
});
