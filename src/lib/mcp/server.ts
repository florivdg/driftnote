import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { listIdeas, type IdeaWithTags } from "@/lib/ideas";
import { checkRate, readBucket } from "@/lib/ratelimit";
import { audit } from "@/lib/audit";

export type McpSession = { userId: string };

const limitSchema = z
  .number()
  .int()
  .min(1)
  .max(200)
  .default(50)
  .describe("Maximum number of notes to return (1..200, default 50).");

function jsonResult(payload: IdeaWithTags[]) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload) }],
  };
}

function rateLimitedResult(retryAfter: number, tool: string, userId: string) {
  audit("rate_limited", { userId, route: `mcp:${tool}` });
  return {
    isError: true,
    content: [
      {
        type: "text" as const,
        text: `rate_limited: retry after ${retryAfter}s`,
      },
    ],
  };
}

async function gate<T>(
  userId: string,
  tool: string,
  run: () => Promise<T> | T,
) {
  const check = checkRate(readBucket, userId);
  if (!check.ok) return rateLimitedResult(check.retryAfter, tool, userId);
  return run();
}

function buildServer(session: McpSession): McpServer {
  const server = new McpServer({ name: "driftnote", version: "0.0.1" });
  const { userId } = session;

  server.registerTool(
    "get_notes",
    {
      title: "Get notes",
      description:
        "List the signed-in user's notes, newest first. Supports optional filters for source (text/voice), untagged-only, and a result limit.",
      inputSchema: {
        limit: limitSchema,
        source: z
          .enum(["text", "voice"])
          .optional()
          .describe("Filter by capture source."),
        untagged: z
          .boolean()
          .optional()
          .describe("If true, only return notes that have no tags."),
      },
    },
    async ({ limit, source, untagged }) =>
      gate(userId, "get_notes", async () =>
        jsonResult(await listIdeas(userId, { limit, source, untagged })),
      ),
  );

  server.registerTool(
    "get_notes_by_tag",
    {
      title: "Get notes by tag",
      description:
        "List the signed-in user's notes that carry the given tag (case-insensitive, no leading '#').",
      inputSchema: {
        tag: z
          .string()
          .min(1)
          .max(100)
          .describe("Tag name to filter by, without the leading '#'."),
        limit: limitSchema,
      },
    },
    async ({ tag, limit }) =>
      gate(userId, "get_notes_by_tag", async () =>
        jsonResult(
          await listIdeas(userId, {
            tags: [tag.replace(/^#/, "").trim().toLowerCase()],
            limit,
          }),
        ),
      ),
  );

  server.registerTool(
    "search_notes",
    {
      title: "Search notes",
      description:
        "Case-insensitive substring search across the signed-in user's note bodies.",
      inputSchema: {
        q: z.string().min(1).max(200).describe("Search query."),
        limit: limitSchema,
      },
    },
    async ({ q, limit }) =>
      gate(userId, "search_notes", async () =>
        jsonResult(await listIdeas(userId, { q, limit })),
      ),
  );

  return server;
}

export function buildMcpHandler(
  session: McpSession,
): (req: Request) => Promise<Response> {
  return async (req) => {
    const server = buildServer(session);
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    await server.connect(transport);
    try {
      return await transport.handleRequest(req);
    } finally {
      // Fire-and-forget — awaiting in finally could replace the just-returned Response.
      transport
        .close()
        .catch((e) => audit("mcp_close_error", { msg: String(e) }));
      server.close().catch((e) => audit("mcp_close_error", { msg: String(e) }));
    }
  };
}
