/// <reference types="jest" />

import { resolveApiBaseUrl } from "../base-url";

describe("resolveApiBaseUrl in development", () => {
  const isDev = true;

  it("uses the env url and trims trailing slashes", () => {
    expect(resolveApiBaseUrl({ envUrl: "https://api.example.com/", platform: "web", isDev })).toBe(
      "https://api.example.com",
    );
    expect(
      resolveApiBaseUrl({ envUrl: "https://api.example.com///", platform: "web", isDev }),
    ).toBe("https://api.example.com");
  });

  it("uses the env url as-is when there is nothing to trim", () => {
    expect(resolveApiBaseUrl({ envUrl: "http://192.168.1.20:5165", platform: "ios", isDev })).toBe(
      "http://192.168.1.20:5165",
    );
  });

  it.each([undefined, "", "   "])("falls back to the platform default when env is %j", (envUrl) => {
    expect(resolveApiBaseUrl({ envUrl, platform: "web", isDev })).toBe("http://localhost:5165");
  });

  it("uses the emulator host alias on android", () => {
    expect(resolveApiBaseUrl({ envUrl: undefined, platform: "android", isDev })).toBe(
      "http://10.0.2.2:5165",
    );
  });

  it("uses localhost on web", () => {
    expect(resolveApiBaseUrl({ envUrl: undefined, platform: "web", isDev })).toBe(
      "http://localhost:5165",
    );
  });

  it("uses localhost on ios", () => {
    expect(resolveApiBaseUrl({ envUrl: undefined, platform: "ios", isDev })).toBe(
      "http://localhost:5165",
    );
  });

  it("lets the env url win over the platform default", () => {
    expect(
      resolveApiBaseUrl({ envUrl: "https://api.example.com", platform: "android", isDev }),
    ).toBe("https://api.example.com");
  });
});

describe("resolveApiBaseUrl in production builds", () => {
  const isDev = false;

  it("uses the env url and trims trailing slashes", () => {
    expect(
      resolveApiBaseUrl({ envUrl: "https://flowpilot-api.onrender.com/", platform: "web", isDev }),
    ).toBe("https://flowpilot-api.onrender.com");
  });

  it.each([undefined, "", "   "])(
    "throws a message naming the variable when env is %j",
    (envUrl) => {
      expect(() => resolveApiBaseUrl({ envUrl, platform: "web", isDev })).toThrow(
        "EXPO_PUBLIC_API_URL",
      );
    },
  );

  it("does not fall back to the emulator alias on android", () => {
    expect(() => resolveApiBaseUrl({ envUrl: undefined, platform: "android", isDev })).toThrow(
      "EXPO_PUBLIC_API_URL",
    );
  });
});
