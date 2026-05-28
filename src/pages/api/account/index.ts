import type { APIRoute } from "astro";
import { parseAccountPatchBody } from "@/lib/validation";
import { setDisplayName } from "@/lib/account";
import { guardWrite } from "@/lib/ratelimit";
import { audit } from "@/lib/audit";

export const prerender = false;

async function applyNameUpdate(
  userId: string,
  request: Request,
): Promise<Response> {
  const parsed = await parseAccountPatchBody(request);
  if (!parsed.ok) return parsed.res;
  const ok = await setDisplayName(userId, parsed.value.name);
  if (!ok) return new Response("User not found", { status: 404 });
  audit("account_update", { userId });
  return Response.json({ name: parsed.value.name });
}

export const PATCH: APIRoute = ({ request, locals }) =>
  guardWrite(locals.user, "PATCH /api/account", (userId) =>
    applyNameUpdate(userId, request),
  );
