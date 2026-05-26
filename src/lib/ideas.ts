import {
  and,
  desc,
  eq,
  exists,
  inArray,
  like,
  sql,
  type SQL,
} from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/lib/db/client";
import { ideas, tags, ideaTags } from "@/lib/db/schema";
import { defaultHueFor, extractTags } from "@/lib/tags";

export type IdeaWithTags = {
  id: string;
  body: string;
  source: "text" | "voice";
  createdAt: number;
  tags: { name: string; hue: number }[];
};

export type StreamFilters = {
  q?: string;
  tags?: string[];
  untagged?: boolean;
  source?: "text" | "voice";
  limit?: number;
};

export type TagListEntry = {
  id: string;
  name: string;
  hue: number;
  count: number;
};

export async function createIdeaWithTags(opts: {
  userId: string;
  body: string;
  source: "text" | "voice";
}): Promise<IdeaWithTags> {
  const text = opts.body.trim();
  const extracted = extractTags(text);
  const now = Date.now();
  const ideaId = nanoid();

  const inserted: IdeaWithTags = await db.transaction(async (tx) => {
    await tx.insert(ideas).values({
      id: ideaId,
      userId: opts.userId,
      body: text,
      source: opts.source,
      createdAt: now,
      updatedAt: now,
    });

    // One batch SELECT instead of N per-tag lookups.
    const existingByName = new Map<string, { id: string; hue: number }>();
    if (extracted.length > 0) {
      const rows = await tx
        .select({ id: tags.id, name: tags.name, hue: tags.hue })
        .from(tags)
        .where(
          and(eq(tags.userId, opts.userId), inArray(tags.name, extracted)),
        );
      rows.forEach((r) => existingByName.set(r.name, { id: r.id, hue: r.hue }));
    }

    const linked: { name: string; hue: number }[] = [];
    for (const name of extracted) {
      const existing = existingByName.get(name);
      let tagId: string;
      let hue: number;
      if (existing) {
        tagId = existing.id;
        hue = existing.hue;
      } else {
        tagId = nanoid();
        hue = defaultHueFor(name);
        await tx.insert(tags).values({
          id: tagId,
          userId: opts.userId,
          name,
          hue,
          createdAt: now,
        });
      }
      await tx.insert(ideaTags).values({ ideaId, tagId }).onConflictDoNothing();
      linked.push({ name, hue });
    }

    return {
      id: ideaId,
      body: text,
      source: opts.source,
      createdAt: now,
      tags: linked,
    };
  });

  return inserted;
}

function searchClause(q: string | undefined): SQL | null {
  const trimmed = q?.trim();
  return trimmed ? like(ideas.body, `%${trimmed}%`) : null;
}

function sourceClause(s: "text" | "voice" | undefined): SQL | null {
  return s ? eq(ideas.source, s) : null;
}

function untaggedClause(flag: boolean | undefined): SQL | null {
  return flag
    ? sql`NOT EXISTS (SELECT 1 FROM ${ideaTags} WHERE ${ideaTags.ideaId} = ${ideas.id})`
    : null;
}

function tagExistsClause(userId: string, name: string): SQL {
  return exists(
    db
      .select({ one: sql`1` })
      .from(ideaTags)
      .innerJoin(tags, eq(tags.id, ideaTags.tagId))
      .where(
        and(
          eq(ideaTags.ideaId, ideas.id),
          eq(tags.userId, userId),
          eq(tags.name, name),
        ),
      ),
  );
}

function buildIdeaFilters(userId: string, filters: StreamFilters): SQL[] {
  const optional = [
    searchClause(filters.q),
    sourceClause(filters.source),
    untaggedClause(filters.untagged),
  ].filter((c): c is SQL => c !== null);
  const tagClauses = (filters.tags ?? []).map((name) =>
    tagExistsClause(userId, name),
  );
  return [eq(ideas.userId, userId), ...optional, ...tagClauses];
}

async function loadTagsForIdeas(
  ideaIds: string[],
): Promise<Map<string, { name: string; hue: number }[]>> {
  const byIdea = new Map<string, { name: string; hue: number }[]>();
  if (ideaIds.length === 0) return byIdea;
  const tagRows = await db
    .select({ ideaId: ideaTags.ideaId, name: tags.name, hue: tags.hue })
    .from(ideaTags)
    .innerJoin(tags, eq(tags.id, ideaTags.tagId))
    .where(
      sql`${ideaTags.ideaId} IN (${sql.join(
        ideaIds.map((x) => sql`${x}`),
        sql`, `,
      )})`,
    );
  for (const t of tagRows) {
    const arr = byIdea.get(t.ideaId) ?? [];
    arr.push({ name: t.name, hue: t.hue });
    byIdea.set(t.ideaId, arr);
  }
  return byIdea;
}

export async function listIdeas(
  userId: string,
  filters: StreamFilters,
): Promise<IdeaWithTags[]> {
  const rows = await db
    .select({
      id: ideas.id,
      body: ideas.body,
      source: ideas.source,
      createdAt: ideas.createdAt,
    })
    .from(ideas)
    .where(and(...buildIdeaFilters(userId, filters)))
    .orderBy(desc(ideas.createdAt))
    .limit(filters.limit ?? 200);

  const byIdea = await loadTagsForIdeas(rows.map((r) => r.id));

  return rows.map((r) => ({
    id: r.id,
    body: r.body,
    source: r.source as "text" | "voice",
    createdAt: r.createdAt,
    tags: byIdea.get(r.id) ?? [],
  }));
}

export async function listTagsWithCounts(
  userId: string,
): Promise<TagListEntry[]> {
  const rows = await db
    .select({
      id: tags.id,
      name: tags.name,
      hue: tags.hue,
      count: sql<number>`COUNT(${ideaTags.ideaId})`,
    })
    .from(tags)
    .leftJoin(ideaTags, eq(ideaTags.tagId, tags.id))
    .where(eq(tags.userId, userId))
    .groupBy(tags.id);

  rows.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  return rows;
}

export async function countUntagged(userId: string): Promise<number> {
  const row = db
    .select({ n: sql<number>`COUNT(*)` })
    .from(ideas)
    .where(
      and(
        eq(ideas.userId, userId),
        sql`NOT EXISTS (SELECT 1 FROM ${ideaTags} WHERE ${ideaTags.ideaId} = ${ideas.id})`,
      ),
    )
    .get();
  return row?.n ?? 0;
}

export async function countVoice(userId: string): Promise<number> {
  const row = db
    .select({ n: sql<number>`COUNT(*)` })
    .from(ideas)
    .where(and(eq(ideas.userId, userId), eq(ideas.source, "voice")))
    .get();
  return row?.n ?? 0;
}
