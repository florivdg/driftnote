import type { APIRoute } from "astro";
import { deleteOtherSessions } from "@/lib/account";
import { guardWrite } from "@/lib/ratelimit";
import { audit } from "@/lib/audit";

export const prerender = false;

async function revokeOthers(
  userId: string,
  currentId: string | undefined,
): Promise<Response> {
  if (!currentId) return new Response("No active session", { status: 400 });
  await deleteOtherSessions(userId, currentId);
  audit("session_revoke_others", { userId });
  return new Response(null, { status: 204 });
}

export const DELETE: APIRoute = ({ locals }) =>
  guardWrite(locals.user, "DELETE /api/account/sessions", (userId) =>
    revokeOthers(userId, locals.session?.id),
  );
