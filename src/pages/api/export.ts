import type { APIRoute } from "astro";
import { loadUserExport } from "@/lib/export";
import { toMarkdown } from "@/lib/export-markdown";
import { gateRead } from "@/lib/ratelimit";
import { audit } from "@/lib/audit";

export const prerender = false;

type Format = "json" | "md";

function parseFormat(raw: string | null): Format {
  return raw === "md" || raw === "markdown" ? "md" : "json";
}

function filename(format: Format): string {
  const day = new Date().toISOString().slice(0, 10);
  return `driftnote-export-${day}.${format}`;
}

function attachment(
  body: string,
  contentType: string,
  format: Format,
): Response {
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": contentType,
      "content-disposition": `attachment; filename="${filename(format)}"`,
      "cache-control": "no-store",
    },
  });
}

export const GET: APIRoute = async ({ url, locals }) => {
  const gate = gateRead(locals.user, "GET /api/export");
  if (!gate.ok) return gate.res;

  const format = parseFormat(url.searchParams.get("format"));
  const data = await loadUserExport(gate.user.id);
  audit("data_export", {
    userId: gate.user.id,
    format,
    count: data.ideas.length,
  });

  if (format === "md") {
    return attachment(toMarkdown(data), "text/markdown; charset=utf-8", "md");
  }
  return attachment(
    JSON.stringify(data, null, 2),
    "application/json; charset=utf-8",
    "json",
  );
};
