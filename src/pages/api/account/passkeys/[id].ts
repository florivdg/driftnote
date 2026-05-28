import type { APIRoute } from "astro";
import { countPasskeys, deletePasskey } from "@/lib/account";
import { guardIdWrite } from "@/lib/ratelimit";
import { audit } from "@/lib/audit";

export const prerender = false;

async function removePasskey(userId: string, id: string): Promise<Response> {
  // Last-key guard: never let a user delete their only credential and lock
  // themselves out. The UI disables this too, but enforce it server-side.
  if ((await countPasskeys(userId)) <= 1) {
    return new Response("Cannot remove your only passkey", { status: 400 });
  }
  if (!(await deletePasskey(userId, id))) {
    return new Response("Passkey not found", { status: 404 });
  }
  audit("passkey_remove", { userId, passkeyId: id });
  return new Response(null, { status: 204 });
}

export const DELETE: APIRoute = ({ params, locals }) =>
  guardIdWrite(
    locals.user,
    params.id,
    "DELETE /api/account/passkeys/[id]",
    removePasskey,
  );
