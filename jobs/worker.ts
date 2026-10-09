import { PrismaPg } from "@prisma/adapter-pg";
import { PgBoss } from "pg-boss";

import { PrismaClient } from "@/generated/prisma/client";
import { runCheckInAutoCancelSweep } from "@/server/booking/auto-cancel";
import { runCheckInReminderSweep } from "@/server/booking/check-in-reminder";

const CHECK_IN_SWEEP_QUEUE = "booking.check-in-sweep";
const CHECK_IN_REMINDER_QUEUE = "booking.check-in-reminder";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log("worker: DATABASE_URL not set, nothing to do yet (Phase 0).");
    return;
  }

  // Not `@/server/db` — that module imports "server-only", which only
  // no-ops under Next.js's bundler; this process runs under plain tsx/Node.
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

  const boss = new PgBoss(process.env.DATABASE_URL);
  await boss.start();
  console.log("worker: pg-boss started.");

  await boss.createQueue(CHECK_IN_SWEEP_QUEUE);
  await boss.work(CHECK_IN_SWEEP_QUEUE, async () => {
    const cancelled = await runCheckInAutoCancelSweep(db);
    if (cancelled > 0) console.log(`worker: auto-cancelled ${cancelled} unchecked-in booking(s).`);
  });
  await boss.schedule(CHECK_IN_SWEEP_QUEUE, "*/5 * * * *", null, { tz: "Etc/UTC" });
  console.log("worker: check-in auto-cancel sweep scheduled every 5 minutes.");

  await boss.createQueue(CHECK_IN_REMINDER_QUEUE);
  await boss.work(CHECK_IN_REMINDER_QUEUE, async () => {
    const reminded = await runCheckInReminderSweep(db);
    if (reminded > 0) console.log(`worker: sent ${reminded} check-in reminder(s).`);
  });
  await boss.schedule(CHECK_IN_REMINDER_QUEUE, "*/5 * * * *", null, { tz: "Etc/UTC" });
  console.log("worker: check-in reminders scheduled every 5 minutes.");
  // Desk-watch alerts aren't scheduled: they're sent when a booking is cancelled, auto-cancelled or ended early.

  process.on("SIGTERM", () => void boss.stop());
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
