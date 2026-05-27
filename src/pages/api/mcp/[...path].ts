import type { APIRoute } from "astro";
import { withMcpAuth } from "better-auth/plugins";
import { auth } from "@/lib/auth";
import { buildMcpHandler } from "@/lib/mcp/server";

export const prerender = false;

const handler = withMcpAuth(auth, (req, session) =>
  buildMcpHandler({ userId: session.userId })(req),
);

const route: APIRoute = ({ request }) => handler(request);

export const GET = route;
export const POST = route;
export const DELETE = route;
