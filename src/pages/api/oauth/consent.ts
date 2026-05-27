import type { APIRoute } from "astro";
import { auth } from "@/lib/auth";
import { audit } from "@/lib/audit";

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return new Response("Unauthorized", { status: 401 });

  const form = await request.formData();
  const consentCode = form.get("consent_code");
  const accept = form.get("accept") === "true";
  if (typeof consentCode !== "string" || !consentCode) {
    return new Response("missing consent_code", { status: 400 });
  }

  const { redirectURI } = await auth.api.oAuthConsent({
    body: { accept, consent_code: consentCode },
    headers: request.headers,
  });

  audit("mcp_consent", { userId: locals.user.id, accepted: accept });
  return Response.redirect(redirectURI, 302);
};
