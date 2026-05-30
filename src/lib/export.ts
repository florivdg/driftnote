import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { ideas, tags, ideaTags } from "@/lib/db/schema";

// A self-contained, re-importable snapshot of one user's data. Versioned so a
// future importer can branch on shape; all timestamps are epoch-millis integers
// matching the columns, and tags carry their derived hue so colours round-trip.

export const EXPORT_VERSION = 1;

export type ExportTag = { name: string; hue: number };

export type ExportIdea = {
  id: string;
  body: string;
  source: "text" | "voice";
  createdAt: number;
  updatedAt: number;
  tags: string[];
};

export type UserExport = {
  version: number;
  exportedAt: number;
  ideas: ExportIdea[];
  tags: ExportTag[];
};

type IdeaRow = {
  id: string;
  body: string;
  source: string;
  createdAt: number;
  updatedAt: number;
};

async function loadIdeaRows(userId: string): Promise<IdeaRow[]> {
  return db
    .select({
      id: ideas.id,
      body: ideas.body,
      source: ideas.source,
      createdAt: ideas.createdAt,
      updatedAt: ideas.updatedAt,
    })
    .from(ideas)
    .where(eq(ideas.userId, userId))
    .orderBy(desc(ideas.createdAt));
}

async function loadTagRows(userId: string): Promise<ExportTag[]> {
  return db
    .select({ name: tags.name, hue: tags.hue })
    .from(tags)
    .where(eq(tags.userId, userId))
    .orderBy(asc(tags.name));
}

// One join scoped to the user maps every idea to its tag names (alphabetical),
// avoiding an N+1 per-idea lookup.
async function loadTagNamesByIdea(
  userId: string,
): Promise<Map<string, string[]>> {
  const rows = await db
    .select({ ideaId: ideaTags.ideaId, name: tags.name })
    .from(ideaTags)
    .innerJoin(ideas, eq(ideas.id, ideaTags.ideaId))
    .innerJoin(tags, eq(tags.id, ideaTags.tagId))
    .where(eq(ideas.userId, userId))
    .orderBy(asc(tags.name));
  const byIdea = new Map<string, string[]>();
  for (const r of rows) {
    const arr = byIdea.get(r.ideaId) ?? [];
    arr.push(r.name);
    byIdea.set(r.ideaId, arr);
  }
  return byIdea;
}

export async function loadUserExport(userId: string): Promise<UserExport> {
  const [ideaRows, tagRows, tagsByIdea] = await Promise.all([
    loadIdeaRows(userId),
    loadTagRows(userId),
    loadTagNamesByIdea(userId),
  ]);
  return {
    version: EXPORT_VERSION,
    exportedAt: Date.now(),
    tags: tagRows,
    ideas: ideaRows.map((r) => ({
      id: r.id,
      body: r.body,
      source: r.source === "voice" ? "voice" : "text",
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      tags: tagsByIdea.get(r.id) ?? [],
    })),
  };
}
