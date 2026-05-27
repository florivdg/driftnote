import { createAuthClient } from "better-auth/client";
import { passkeyClient } from "@better-auth/passkey/client";

// authClient is only invoked client-side; the SSR fallback exists purely so the
// module can be imported during island SSR (createAuthClient parses baseURL).
export const authClient = createAuthClient({
  baseURL:
    typeof window === "undefined" ? "http://localhost" : window.location.origin,
  plugins: [passkeyClient()],
});

export function unwrapAuthResult(res: unknown, fallback: string): void {
  const err = (res as { error?: { message?: string } } | null)?.error;
  if (err) throw new Error(err.message ?? fallback);
}
