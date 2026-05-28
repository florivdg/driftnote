import type { APIRoute } from "astro";
import { deletePasskey } from "@/lib/account";
import { guardIdWrite } from "@/lib/ratelimit";
import { audit } from "@/lib/audit";

export const prerender = false;

async function removePasskey(userId: string, id: string): Promise<Response> {
  // Last-key guard lives in deletePasskey (atomic). The UI disables removal of
  // the only passkey too; this is the server-side backstop.
  const result = await deletePasskey(userId, id);
  if (result === "last") {
    return new Response("Cannot remove your only passkey", { status: 400 });
  }
  if (result === "missing") {
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
