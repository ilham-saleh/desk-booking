import { z } from "zod";

/**
 * Server-only env. Never import this module from a client component —
 * `src/server/**` is the only code that should read it.
 */
const serverSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  // Optional until Phase 1 wires up migrations/seed against a real database.
  DATABASE_URL: z.string().optional(),
  DATABASE_URL_TEST: z.string().optional(),

  AUTH_SECRET: z.string().optional(),
  AUTH_URL: z.string().optional(),
  AUTH_MICROSOFT_ENTRA_ID_ID: z.string().optional(),
  AUTH_MICROSOFT_ENTRA_ID_SECRET: z.string().optional(),
  AUTH_MICROSOFT_ENTRA_ID_ISSUER: z.string().optional(),
  // Ignored whenever NODE_ENV=production, regardless of this value.
  AUTH_ENABLE_DEV_LOGIN: z
    .string()
    .default("false")
    .transform((value) => value === "true"),

  REALTIME_PORT: z.coerce.number().int().positive().default(8080),

  CHECKIN_OPENS_MINUTES: z.coerce.number().int().positive().default(120),
  CHECKIN_DEADLINE_MINUTES: z.coerce.number().int().positive().default(60),

  UPLOAD_DIR: z.string().default("./uploads"),

  EMAIL_FROM: z.string().default("Desk Booking <no-reply@example.com>"),
  RESEND_API_KEY: z.string().optional(),
});

const clientSchema = z.object({
  NEXT_PUBLIC_WS_URL: z.string().default("ws://localhost:8080"),
});

function parse<T extends z.ZodType>(schema: T, source: Record<string, string | undefined>) {
  const result = schema.safeParse(source);
  if (!result.success) {
    console.error("Invalid environment variables:", result.error.flatten().fieldErrors);
    throw new Error("Invalid environment variables");
  }
  return result.data;
}

export const env = parse(serverSchema, process.env);

export const clientEnv = parse(clientSchema, {
  NEXT_PUBLIC_WS_URL: process.env.NEXT_PUBLIC_WS_URL,
});
