/* global describe, it, expect, __dirname */
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const script = path.resolve(__dirname, "..", "require-env.mjs");

function run(args, env) {
  // Start from an empty environment so the host's own variables can't leak into the result.
  const cleanEnv = {};
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined) cleanEnv[key] = value;
  }
  return spawnSync(process.execPath, [script, ...args], {
    env: cleanEnv,
    encoding: "utf8",
  });
}

describe("require-env.mjs", () => {
  it("exits 0 when every required variable is set", () => {
    const result = run(["A_URL", "B_URL"], { A_URL: "https://x", B_URL: "y" });

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
  });

  it("exits 0 when no variable names are required", () => {
    expect(run([], {}).status).toBe(0);
  });

  it("exits 1 and names the variable when it is missing", () => {
    const result = run(["EXPO_PUBLIC_API_URL"], {});

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("EXPO_PUBLIC_API_URL must be set for production builds.");
  });

  it.each(["", "   "])("treats %j as missing", (value) => {
    const result = run(["EXPO_PUBLIC_API_URL"], { EXPO_PUBLIC_API_URL: value });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("EXPO_PUBLIC_API_URL");
  });

  it("reports every missing variable, not just the first", () => {
    const result = run(["ONE", "TWO", "THREE"], { TWO: "set" });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("ONE");
    expect(result.stderr).toContain("THREE");
    expect(result.stderr).not.toContain("TWO");
  });
});
