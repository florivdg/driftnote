import type { APIRoute } from "astro";
import { auth } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { isAllowedRedirectUri } from "@/lib/url";

function forceConsent(request: Request): Request {
  const url = new URL(request.url);
  if (url.searchParams.get("prompt") === "consent") return request;
  url.searchParams.set("prompt", "consent");
  return new Request(url, request);
}

// Better Auth's /mcp/register is otherwise wide-open. Require a session in
// prod; allow anonymous DCR in dev so MCP Inspector (cross-origin, no session
// cookie) can complete the flow.
function blockedDcrResponse(hasUser: boolean): Response | null {
  if (hasUser || !import.meta.env.PROD) return null;
  audit("dcr_blocked", {});
  return Response.json(
    {
      error: "invalid_client",
      error_description: "registration requires authentication",
    },
    { status: 401 },
  );
}

async function readJsonSafe(request: Request): Promise<unknown> {
  try {
    return await request.clone().json();
  } catch {
    return null;
  }
}

function extractRedirectUris(body: unknown): string[] | null {
  if (typeof body !== "object" || body === null) return null;
  const value = (body as Record<string, unknown>).redirect_uris;
  if (!Array.isArray(value)) return null;
  return value.filter((v): v is string => typeof v === "string");
}

function readClientName(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const v = (body as Record<string, unknown>).client_name;
  return typeof v === "string" ? v : null;
}

// Better Auth's DCR schema marks client_name as optional, but our DB column
// `oauthApplication.name` is NOT NULL — let it through and the insert 500s.
function missingClientName(body: unknown): Response | null {
  const name = readClientName(body);
  if (name && name.trim().length > 0) return null;
  audit("dcr_missing_client_name", {});
  return Response.json(
    {
      error: "invalid_client_metadata",
      error_description: "client_name is required",
    },
    { status: 400 },
  );
}

// Better Auth's DCR schema declares redirect_uris as z.array(z.string())
// with no scheme check, so a client could otherwise register
// `javascript:`/`data:`/etc. and exploit the consent navigation.
function invalidRedirectUri(body: unknown): Response | null {
  const uris = extractRedirectUris(body);
  const invalid = uris?.find((u) => !isAllowedRedirectUri(u));
  if (invalid === undefined) return null;
  audit("dcr_invalid_redirect_uri", { uri: invalid });
  return Response.json(
    {
      error: "invalid_redirect_uri",
      error_description: "redirect_uri must use https:// or http://localhost",
    },
    { status: 400 },
  );
}

type DcrValidator = (body: unknown) => Response | null;
const DCR_VALIDATORS: DcrValidator[] = [missingClientName, invalidRedirectUri];

async function handleMcpRegister(
  request: Request,
  hasUser: boolean,
): Promise<Response> {
  const blocked = blockedDcrResponse(hasUser);
  if (blocked) return blocked;
  const body = await readJsonSafe(request);
  for (const validate of DCR_VALIDATORS) {
    const reject = validate(body);
    if (reject) return reject;
  }
  return auth.handler(request);
}

export const ALL: APIRoute = ({ request, locals }) => {
  const path = new URL(request.url).pathname;

  if (path === "/api/auth/mcp/register") {
    return handleMcpRegister(request, !!locals.user);
  }

  if (path === "/api/auth/mcp/authorize") {
    return auth.handler(forceConsent(request));
  }

  return auth.handler(request);
};
