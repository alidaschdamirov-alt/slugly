import { spawnSync } from "node:child_process";

const attempts = 20;
const delayMs = 5_000;

for (let attempt = 1; attempt <= attempts; attempt += 1) {
  console.log(`Database migration attempt ${attempt}/${attempts}`);
  const result = spawnSync("pnpm", ["db:migrate"], {
    stdio: "inherit",
    env: process.env,
  });

  if (result.status === 0) process.exit(0);
  if (attempt < attempts) {
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }
}

throw new Error("Database migrations failed after all retry attempts");
