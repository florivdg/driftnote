import { navigate } from "astro:transitions/client";
import { authClient, unwrapAuthResult } from "./auth-client";

export async function signOutAndRedirect(): Promise<void> {
  const res = await authClient.signOut();
  unwrapAuthResult(res, "sign-out failed");
  await navigate("/login", { history: "push" });
}

export async function addPasskeyToAccount(name: string): Promise<void> {
  const res = await authClient.passkey.addPasskey({ name });
  unwrapAuthResult(res, "could not add passkey");
}
