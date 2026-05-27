import type { APIRoute } from "astro";
import { oAuthDiscoveryMetadata } from "better-auth/plugins";
import { auth } from "@/lib/auth";

export const prerender = false;

const handler = oAuthDiscoveryMetadata(auth);

export const GET: APIRoute = ({ request }) => handler(request);
