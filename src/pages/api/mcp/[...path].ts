import type { APIRoute } from "astro";
import { withMcpAuth } from "better-auth/plugins";
import { auth } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { buildMcpHandler } from "@/lib/mcp/server";

export const prerender = false;

// MCP clients are arbitrary by design — Inspector, Claude Desktop, future
// browser clients all hit this endpoint cross-origin. Better Auth already
// sets ACAO: * on its metadata + /mcp/register, so match the convention here.
// TODO: narrow ACAO to an allow-list once the prod client set is known.
const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, Mcp-Protocol-Version, Mcp-Session-Id",
  "Access-Control-Max-Age": "86400",
  "Access-Control-Expose-Headers": "WWW-Authenticate, Mcp-Session-Id",
};

function withCors(res: Response): Response {
  for (const [k, v] of Object.entries(CORS_HEADERS)) res.headers.set(k, v);
  return res;
}

function isExpired(expiresAt: Date | null | undefined): boolean {
  return !!expiresAt && new Date(expiresAt).getTime() < Date.now();
}

function expiredTokenResponse(): Response {
  return new Response(
    JSON.stringify({
      error: "invalid_token",
      error_description: "The access token expired",
    }),
    {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        "WWW-Authenticate":
          'Bearer error="invalid_token", error_description="The access token expired"',
      },
    },
  );
}

const handler = withMcpAuth(auth, (req, session) => {
  if (isExpired(session.accessTokenExpiresAt)) {
    audit("mcp_expired_token", {
      userId: session.userId,
      clientId: session.clientId,
    });
    return expiredTokenResponse();
  }
  return buildMcpHandler({ userId: session.userId })(req);
});

const route: APIRoute = async ({ request }) => withCors(await handler(request));

export const GET = route;
export const POST = route;
export const DELETE = route;
export const OPTIONS: APIRoute = () =>
  withCors(new Response(null, { status: 204 }));
