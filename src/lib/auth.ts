import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { passkey } from "@better-auth/passkey";
import { nanoid } from "nanoid";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import * as authSchema from "@/lib/db/auth-schema";
import { user as userTable } from "@/lib/db/schema";

const baseURL = process.env.BETTER_AUTH_URL ?? "http://localhost:4321";
const rpID = new URL(baseURL).hostname;

async function getOrCreateUserByEmail(name: string, email: string) {
  const existing = db
    .select()
    .from(userTable)
    .where(eq(userTable.email, email))
    .get();
  if (existing) {
    return { id: existing.id, name: existing.name, email: existing.email };
  }
  const id = nanoid();
  const now = new Date();
  await db.insert(userTable).values({
    id,
    name,
    email,
    emailVerified: false,
    createdAt: now,
    updatedAt: now,
  });
  return { id, name, email };
}

function parseJsonContext(
  context: unknown,
): { name?: unknown; email?: unknown } | null {
  if (typeof context !== "string") return null;
  try {
    return JSON.parse(context) as { name?: unknown; email?: unknown };
  } catch {
    return null;
  }
}

const SIGNUP_FIELDS_ERR = "name and email are required for passkey signup";

function pickString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseSignupContext(context: unknown): { name: string; email: string } {
  const parsed = parseJsonContext(context);
  if (!parsed) throw new Error(SIGNUP_FIELDS_ERR);
  const name = pickString(parsed.name);
  const email = pickString(parsed.email);
  if (!name || !email) throw new Error(SIGNUP_FIELDS_ERR);
  return { name, email };
}

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "sqlite",
    schema: authSchema,
  }),
  secret: process.env.BETTER_AUTH_SECRET!,
  baseURL,
  emailAndPassword: { enabled: false },
  socialProviders: {},
  plugins: [
    passkey({
      rpID,
      rpName: "DriftNote",
      // Allow passkey-first signup (no existing session required for register).
      registration: {
        requireSession: false,
        // `context` is a JSON-encoded string from the client (see LoginForm.vue).
        // The passkey plugin forwards it from the URL query verbatim.
        resolveUser: async ({ context }) => {
          const { name, email } = parseSignupContext(context);
          return getOrCreateUserByEmail(name, email);
        },
      },
    }),
  ],
});
