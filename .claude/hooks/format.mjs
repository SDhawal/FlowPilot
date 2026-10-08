// PostToolUse hook: auto-format the file Claude just edited. Never blocks (always exits 0).
//   backend *.cs                        -> dotnet format whitespace
//   mobile code (ts/tsx/js/jsx/json/css) -> prettier (mobile/.prettierrc) + eslint --fix
//   everything else (md/json/yaml/css/mjs) -> prettier (root .prettierrc.json)
// Generated files are skipped via the root .prettierignore; files outside the repo are never touched.
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const input = JSON.parse(readFileSync(0, "utf8") || "{}");
const filePath = input?.tool_input?.file_path;
if (!filePath || !existsSync(filePath)) process.exit(0);

const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const rel = path.relative(root, filePath).replaceAll("\\", "/");
if (rel.startsWith("..") || path.isAbsolute(rel)) process.exit(0); // outside the repo (e.g. ~/.claude)

const run = (cmd, args, cwd = root) =>
  spawnSync(cmd, args, {
    cwd,
    stdio: "ignore",
    shell: process.platform === "win32",
    timeout: 60_000,
  });

const sln = path.join(root, "backend", "FlowPilot.sln");
const mobile = path.join(root, "mobile");
const hasPrettier = existsSync(path.join(mobile, "node_modules")); // prettier is installed in mobile/
const rootIgnore = path.join(root, ".prettierignore");

if (rel.endsWith(".cs") && existsSync(sln)) {
  // whitespace-only formatting is fast and needs no build; EF migrations are generated, leave them alone
  if (!/\/Migrations\//.test(rel)) run("dotnet", ["format", "whitespace", sln, "--include", rel]);
} else if (/^mobile\/.+\.(ts|tsx|js|jsx|json|css)$/.test(rel) && hasPrettier) {
  // cwd = mobile/, so mobile/.prettierignore and mobile/.prettierrc apply
  const inMobile = path.relative(mobile, filePath);
  run("npx", ["--no-install", "prettier", "--write", inMobile], mobile);
  if (/\.(ts|tsx|js|jsx)$/.test(rel))
    run("npx", ["--no-install", "eslint", "--fix", inMobile], mobile);
} else if (/\.(md|json|ya?ml|css|mjs)$/.test(rel) && hasPrettier) {
  // config resolves from the file's location (root .prettierrc.json); generated files skipped by the root ignore
  run(
    "npx",
    ["--no-install", "prettier", "--write", "--ignore-path", rootIgnore, filePath],
    mobile,
  );
}
process.exit(0);
