import type { APIRoute } from "astro";
import { auth } from "@/lib/auth";
import { audit } from "@/lib/audit";

function forceConsent(request: Request): Request {
  const url = new URL(request.url);
  if (url.searchParams.get("prompt") === "consent") return request;
  url.searchParams.set("prompt", "consent");
  return new Request(url, request);
}

export const ALL: APIRoute = ({ request, locals }) => {
  const path = new URL(request.url).pathname;

  if (path === "/api/auth/mcp/register" && !locals.user) {
    audit("dcr_blocked", { userId: null });
    return Response.json(
      {
        error: "invalid_client",
        error_description: "registration requires authentication",
      },
      { status: 401 },
    );
  }

  if (path === "/api/auth/mcp/authorize") {
    return auth.handler(forceConsent(request));
  }

  return auth.handler(request);
};
