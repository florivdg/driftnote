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

async function requestOrThrow(
  url: string,
  init: RequestInit,
  fallback: string,
): Promise<Response> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error((await res.text()) || fallback);
  return res;
}

export async function updateDisplayName(name: string): Promise<string> {
  const res = await requestOrThrow(
    "/api/account",
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    },
    "could not update name",
  );
  const data = (await res.json()) as { name: string };
  return data.name;
}

export async function removePasskey(id: string): Promise<void> {
  await requestOrThrow(
    `/api/account/passkeys/${encodeURIComponent(id)}`,
    { method: "DELETE" },
    "could not remove passkey",
  );
}

export async function revokeSession(id: string): Promise<void> {
  await requestOrThrow(
    `/api/account/sessions/${encodeURIComponent(id)}`,
    { method: "DELETE" },
    "could not revoke session",
  );
}

export async function revokeOtherSessions(): Promise<void> {
  await requestOrThrow(
    "/api/account/sessions",
    { method: "DELETE" },
    "could not revoke other sessions",
  );
}

export async function deleteAccount(): Promise<void> {
  const res = await authClient.deleteUser();
  unwrapAuthResult(res, "could not delete account");
  location.assign("/login");
}
