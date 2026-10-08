// Stop hook: before Claude finishes, run fast checks for the areas that changed.
// Exit code 2 = Claude must keep working; stderr explains what failed.
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const input = JSON.parse(readFileSync(0, "utf8") || "{}");
if (input.stop_hook_active) process.exit(0); // already retried once; avoid infinite loops

const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const sh = { cwd: root, encoding: "utf8", shell: process.platform === "win32", timeout: 240_000 };

const status = spawnSync("git", ["status", "--porcelain"], sh);
if (status.status !== 0) process.exit(0); // not a git repo yet
const changed = status.stdout
  .split("\n")
  .filter(Boolean)
  .map((l) => l.slice(3).replaceAll("\\", "/"));

const backendChanged = changed.some((f) => f.startsWith("backend/"));
const mobileChanged = changed.some((f) => f.startsWith("mobile/"));

const checks = [];
if (backendChanged && existsSync(path.join(root, "backend", "FlowPilot.sln"))) {
  checks.push([
    "Backend unit tests",
    "dotnet",
    ["test", "backend/FlowPilot.sln", "--filter", "Category!=Integration", "--nologo", "-v", "q"],
  ]);
}
if (mobileChanged && existsSync(path.join(root, "mobile", "node_modules"))) {
  checks.push(["Mobile typecheck", "npm", ["--prefix", "mobile", "run", "typecheck", "--silent"]]);
  checks.push(["Mobile tests", "npm", ["--prefix", "mobile", "test", "--silent", "--", "--ci"]]);
}

const failures = [];
for (const [name, cmd, args] of checks) {
  const r = spawnSync(cmd, args, sh);
  if (r.status !== 0) {
    const out = `${r.stdout ?? ""}\n${r.stderr ?? ""}`.trim().split("\n").slice(-40).join("\n");
    failures.push(`### ${name} failed\n${out}`);
  }
}

if (failures.length) {
  console.error(
    `Checks failed — fix these before finishing (or explain why they are expected to fail):\n\n${failures.join("\n\n")}`,
  );
  process.exit(2);
}
process.exit(0);
