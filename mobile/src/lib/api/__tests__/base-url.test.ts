/// <reference types="jest" />

import { resolveApiBaseUrl } from "../base-url";

describe("resolveApiBaseUrl", () => {
  it("uses the env url and trims trailing slashes", () => {
    expect(resolveApiBaseUrl({ envUrl: "https://api.example.com/", platform: "web" })).toBe(
      "https://api.example.com",
    );
    expect(resolveApiBaseUrl({ envUrl: "https://api.example.com///", platform: "web" })).toBe(
      "https://api.example.com",
    );
  });

  it("uses the env url as-is when there is nothing to trim", () => {
    expect(resolveApiBaseUrl({ envUrl: "http://192.168.1.20:5165", platform: "ios" })).toBe(
      "http://192.168.1.20:5165",
    );
  });

  it.each([undefined, "", "   "])("falls back to the platform default when env is %j", (envUrl) => {
    expect(resolveApiBaseUrl({ envUrl, platform: "web" })).toBe("http://localhost:5165");
  });

  it("uses the emulator host alias on android", () => {
    expect(resolveApiBaseUrl({ envUrl: undefined, platform: "android" })).toBe(
      "http://10.0.2.2:5165",
    );
  });

  it("uses localhost on web", () => {
    expect(resolveApiBaseUrl({ envUrl: undefined, platform: "web" })).toBe("http://localhost:5165");
  });

  it("uses localhost on ios", () => {
    expect(resolveApiBaseUrl({ envUrl: undefined, platform: "ios" })).toBe("http://localhost:5165");
  });

  it("lets the env url win over the platform default", () => {
    expect(resolveApiBaseUrl({ envUrl: "https://api.example.com", platform: "android" })).toBe(
      "https://api.example.com",
    );
  });
});
