import type { APIRoute } from "astro";
import { oAuthProtectedResourceMetadata } from "better-auth/plugins";
import { auth } from "@/lib/auth";

export const prerender = false;

const handler = oAuthProtectedResourceMetadata(auth);

export const GET: APIRoute = ({ request }) => handler(request);
