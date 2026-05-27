import type { APIRoute } from "astro";
import { auth } from "@/lib/auth";
import { audit } from "@/lib/audit";

export const prerender = false;

function readConsentCode(form: FormData): string | null {
  const value = form.get("consent_code");
  return typeof value === "string" && value.length > 0 ? value : null;
}

// Returns JSON, not a 302. The consent page submits via fetch and navigates
// client-side via location.assign so CSP `form-action 'self'` stays intact —
// a native 302 would leak the cross-origin OAuth callback through form-action.
// Without JS this endpoint just renders the JSON; MCP clients always run in a
// JS-capable browser context, so that's acceptable.
export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const form = await request.formData();
  const consentCode = readConsentCode(form);
  const accept = form.get("accept") === "true";
  if (!consentCode) {
    return Response.json({ error: "missing consent_code" }, { status: 400 });
  }

  const { redirectURI } = await auth.api.oAuthConsent({
    body: { accept, consent_code: consentCode },
    headers: request.headers,
  });

  audit("mcp_consent", { userId: locals.user.id, accepted: accept });
  return Response.json({ redirectURI });
};
