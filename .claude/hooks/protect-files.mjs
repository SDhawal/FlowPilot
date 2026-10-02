// PreToolUse hook: block edits to secrets, production config and existing EF migrations.
// Exit code 2 = block the tool call; stderr is shown to Claude as the reason.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const input = JSON.parse(readFileSync(0, "utf8") || "{}");
const filePath = input?.tool_input?.file_path ?? input?.tool_input?.notebook_path;
if (!filePath) process.exit(0);

const p = filePath.replaceAll("\\", "/");
const base = path.basename(p);

const rules = [
  {
    test: () => /^\.env(\..+)?$/.test(base) && base !== ".env.example",
    why: "Secrets file. Edit .env.example with placeholders instead and tell the human which real values to set.",
  },
  {
    test: () => /appsettings\.Production\.json$/i.test(base),
    why: "Production config is managed via environment variables on the host, not in the repo.",
  },
  {
    test: () => /\/Migrations\/[^/]+\.cs$/.test(p) && existsSync(filePath),
    why: "Existing EF Core migrations are immutable. Create a new migration with `dotnet ef migrations add` instead.",
  },
  {
    test: () => /\/src\/lib\/api\/schema\.d\.ts$/.test(p),
    why: "Generated API client. Change the backend contract and run /gen-client instead.",
  },
];

for (const r of rules) {
  if (r.test()) {
    console.error(`Blocked edit to ${p}: ${r.why}`);
    process.exit(2);
  }
}
process.exit(0);
