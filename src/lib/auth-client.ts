import { createAuthClient } from "better-auth/client";
import { passkeyClient } from "@better-auth/passkey/client";

export const authClient = createAuthClient({
  baseURL: window.location.origin,
  plugins: [passkeyClient()],
});

export function unwrapAuthResult(res: unknown, fallback: string): void {
  const err = (res as { error?: { message?: string } } | null)?.error;
  if (err) throw new Error(err.message ?? fallback);
}
