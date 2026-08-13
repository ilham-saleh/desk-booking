import { PgBoss } from "pg-boss";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log("worker: DATABASE_URL not set, nothing to do yet (Phase 0).");
    return;
  }

  const boss = new PgBoss(process.env.DATABASE_URL);
  await boss.start();
  console.log("worker: pg-boss started, no queues registered yet.");
  console.log("Check-in auto-cancel and reminder queues arrive in Phase 3.");

  process.on("SIGTERM", () => void boss.stop());
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
