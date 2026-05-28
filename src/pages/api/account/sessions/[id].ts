import type { APIRoute } from "astro";
import { deleteSession } from "@/lib/account";
import { guardIdWrite } from "@/lib/ratelimit";
import { audit } from "@/lib/audit";

export const prerender = false;

async function revokeSession(
  userId: string,
  currentId: string | undefined,
  id: string,
): Promise<Response> {
  if (id === currentId) {
    return new Response("Cannot revoke the current session", { status: 400 });
  }
  if (!(await deleteSession(userId, id))) {
    return new Response("Session not found", { status: 404 });
  }
  audit("session_revoke", { userId, sessionId: id });
  return new Response(null, { status: 204 });
}

export const DELETE: APIRoute = ({ params, locals }) =>
  guardIdWrite(
    locals.user,
    params.id,
    "DELETE /api/account/sessions/[id]",
    (userId, id) => revokeSession(userId, locals.session?.id, id),
  );
