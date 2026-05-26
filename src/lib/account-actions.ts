import { authClient, unwrapAuthResult } from "./auth-client";

export async function signOutAndRedirect(): Promise<void> {
  const res = await authClient.signOut();
  unwrapAuthResult(res, "sign-out failed");
  location.assign("/login");
}

export async function addPasskeyToAccount(name: string): Promise<void> {
  const res = await authClient.passkey.addPasskey({ name });
  unwrapAuthResult(res, "could not add passkey");
}
