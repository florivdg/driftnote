import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { mcp } from "better-auth/plugins";
import { passkey } from "@better-auth/passkey";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import * as authSchema from "@/lib/db/auth-schema";
import { user as userTable } from "@/lib/db/schema";
import { audit } from "@/lib/audit";

const baseURL = process.env.BETTER_AUTH_URL ?? "http://localhost:4321";
const rpID = new URL(baseURL).hostname;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_MAX = 254;
const NAME_MAX = 200;

function badRequest(message: string): APIError {
  return new APIError("BAD_REQUEST", { message });
}

function isValidName(name: string): boolean {
  return name.length > 0 && name.length <= NAME_MAX;
}

function isValidEmail(email: string): boolean {
  return email.length > 0 && email.length <= EMAIL_MAX && EMAIL_RE.test(email);
}

function validateSignupFields(name: string, email: string): void {
  if (!isValidName(name)) throw badRequest("name must be 1-200 characters");
  if (!isValidEmail(email))
    throw badRequest("a valid email address is required");
}

async function createNewUserByEmail(name: string, email: string) {
  const existing = db
    .select()
    .from(userTable)
    .where(eq(userTable.email, email))
    .get();
  if (existing) {
    audit("signup_blocked", { email, reason: "email_in_use" });
    throw badRequest(
      "An account with this email already exists. Sign in instead.",
    );
  }
  const id = Bun.randomUUIDv7();
  const now = new Date();
  await db.insert(userTable).values({
    id,
    name,
    email,
    emailVerified: false,
    createdAt: now,
    updatedAt: now,
  });
  audit("signup", { userId: id, email });
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

function pickString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseSignupContext(context: unknown): { name: string; email: string } {
  const parsed = parseJsonContext(context);
  if (!parsed)
    throw badRequest("name and email are required for passkey signup");
  const name = pickString(parsed.name);
  const email = pickString(parsed.email).toLowerCase();
  validateSignupFields(name, email);
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
        // Registration must refuse known emails to prevent account takeover —
        // sign-in goes through verify-authentication, which doesn't touch this.
        resolveUser: async ({ context }) => {
          const { name, email } = parseSignupContext(context);
          return createNewUserByEmail(name, email);
        },
      },
    }),
    mcp({
      loginPage: "/login",
      resource: `${baseURL}/api/mcp`,
      oidcConfig: {
        loginPage: "/login",
        consentPage: "/mcp/consent",
        requirePKCE: true,
      },
    }),
  ],
});
