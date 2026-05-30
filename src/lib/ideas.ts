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
import { db } from "@/lib/db/client";
import { ideas, tags, ideaTags } from "@/lib/db/schema";
import {
  defaultHueFor,
  extractTags,
  hashtagRenamer,
  hashtagStripper,
} from "@/lib/tags";

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

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type ResolvedTag = { name: string; id: string; hue: number };

// All tag reconciliation runs inside db.transaction with a SYNCHRONOUS callback:
// drizzle's bun-sqlite transaction wraps BEGIN/COMMIT synchronously, so an async
// callback would commit before any awaited statement ran (no atomicity, no
// rollback on a mid-sync failure). The helpers below therefore use the eager
// .run()/.all() executors, never await.

// Resolve each desired tag name to a row, creating any that don't exist yet.
// One batch SELECT instead of N per-tag lookups; returns desired order.
function resolveDesiredTags(
  tx: Tx,
  userId: string,
  desired: string[],
  now: number,
): ResolvedTag[] {
  const existing = new Map<string, { id: string; hue: number }>();
  if (desired.length > 0) {
    const rows = tx
      .select({ id: tags.id, name: tags.name, hue: tags.hue })
      .from(tags)
      .where(and(eq(tags.userId, userId), inArray(tags.name, desired)))
      .all();
    rows.forEach((r) => existing.set(r.name, { id: r.id, hue: r.hue }));
  }
  const out: ResolvedTag[] = [];
  for (const name of desired) {
    const found = existing.get(name);
    if (found) {
      out.push({ name, id: found.id, hue: found.hue });
      continue;
    }
    const id = Bun.randomUUIDv7();
    const hue = defaultHueFor(name);
    tx.insert(tags).values({ id, userId, name, hue, createdAt: now }).run();
    out.push({ name, id, hue });
  }
  return out;
}

function currentLinkIds(tx: Tx, ideaId: string): Set<string> {
  const rows = tx
    .select({ tagId: ideaTags.tagId })
    .from(ideaTags)
    .where(eq(ideaTags.ideaId, ideaId))
    .all();
  return new Set(rows.map((r) => r.tagId));
}

function addLinks(
  tx: Tx,
  ideaId: string,
  resolved: ResolvedTag[],
  currentIds: Set<string>,
): void {
  for (const t of resolved) {
    if (currentIds.has(t.id)) continue;
    tx.insert(ideaTags)
      .values({ ideaId, tagId: t.id })
      .onConflictDoNothing()
      .run();
  }
}

function removeLinks(
  tx: Tx,
  ideaId: string,
  currentIds: Set<string>,
  desiredIds: Set<string>,
): void {
  const toRemove = [...currentIds].filter((id) => !desiredIds.has(id));
  if (toRemove.length === 0) return;
  tx.delete(ideaTags)
    .where(and(eq(ideaTags.ideaId, ideaId), inArray(ideaTags.tagId, toRemove)))
    .run();
}

// Make the idea's tag links exactly match `desired`: create missing tags,
// add new links, drop stale ones. Orphaned tag rows are intentionally kept
// (the sidebar hides count-0 tags and a tag's hue is preserved for reuse).
function syncIdeaTags(
  tx: Tx,
  userId: string,
  ideaId: string,
  desired: string[],
  now: number,
): { name: string; hue: number }[] {
  const resolved = resolveDesiredTags(tx, userId, desired, now);
  const desiredIds = new Set(resolved.map((t) => t.id));
  const currentIds = currentLinkIds(tx, ideaId);
  addLinks(tx, ideaId, resolved, currentIds);
  removeLinks(tx, ideaId, currentIds, desiredIds);
  return resolved.map((t) => ({ name: t.name, hue: t.hue }));
}

export async function createIdeaWithTags(opts: {
  userId: string;
  body: string;
  source: "text" | "voice";
}): Promise<IdeaWithTags> {
  const text = opts.body.trim();
  const extracted = extractTags(text);
  const now = Date.now();
  const ideaId = Bun.randomUUIDv7();

  return db.transaction((tx) => {
    tx.insert(ideas)
      .values({
        id: ideaId,
        userId: opts.userId,
        body: text,
        source: opts.source,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    const tagList = syncIdeaTags(tx, opts.userId, ideaId, extracted, now);
    return {
      id: ideaId,
      body: text,
      source: opts.source,
      createdAt: now,
      tags: tagList,
    };
  });
}

export async function updateIdeaWithTags(opts: {
  userId: string;
  ideaId: string;
  body: string;
}): Promise<IdeaWithTags | null> {
  const text = opts.body.trim();
  const extracted = extractTags(text);
  const now = Date.now();

  return db.transaction((tx) => {
    const updated = tx
      .update(ideas)
      .set({ body: text, updatedAt: now })
      .where(and(eq(ideas.id, opts.ideaId), eq(ideas.userId, opts.userId)))
      .returning({ source: ideas.source, createdAt: ideas.createdAt })
      .all();
    const row = updated[0];
    if (!row) return null;
    const tagList = syncIdeaTags(tx, opts.userId, opts.ideaId, extracted, now);
    return {
      id: opts.ideaId,
      body: text,
      source: row.source as "text" | "voice",
      createdAt: row.createdAt,
      tags: tagList,
    };
  });
}

export async function deleteIdea(
  userId: string,
  ideaId: string,
): Promise<boolean> {
  const deleted = db
    .delete(ideas)
    .where(and(eq(ideas.id, ideaId), eq(ideas.userId, userId)))
    .returning({ id: ideas.id })
    .all();
  return deleted.length > 0;
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

export async function getTagHues(
  userId: string,
  names: string[],
): Promise<{ name: string; hue: number }[]> {
  if (names.length === 0) return [];
  return await db
    .select({ name: tags.name, hue: tags.hue })
    .from(tags)
    .where(and(eq(tags.userId, userId), inArray(tags.name, names)));
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

export async function countIdeas(userId: string): Promise<number> {
  const row = db
    .select({ n: sql<number>`COUNT(*)` })
    .from(ideas)
    .where(eq(ideas.userId, userId))
    .get();
  return row?.n ?? 0;
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

export type TagRow = typeof tags.$inferSelect;
export type TagMutation = { tag: TagRow; merged: boolean };

function findTag(tx: Tx, userId: string, name: string): TagRow | undefined {
  const rows = tx
    .select()
    .from(tags)
    .where(and(eq(tags.userId, userId), eq(tags.name, name)))
    .all();
  return rows[0];
}

// Rewrite the body of every idea linked to `tagId`, applying `transform`.
// Driving FROM idea_tags filtered by tagId lets SQLite use idx_idea_tags_tag and
// join ideas by primary key, so this touches only notes that use the tag — never
// a full ideas scan. Runs inside the caller's transaction (single commit); skips
// no-op rows and leaves updatedAt untouched (a tag rename/delete is metadata).
function rewriteBodiesForTag(
  tx: Tx,
  userId: string,
  tagId: string,
  transform: (body: string) => string,
): void {
  const rows = tx
    .select({ id: ideas.id, body: ideas.body })
    .from(ideaTags)
    .innerJoin(ideas, eq(ideas.id, ideaTags.ideaId))
    .where(and(eq(ideaTags.tagId, tagId), eq(ideas.userId, userId)))
    .all();
  for (const r of rows) {
    const next = transform(r.body);
    if (next === r.body) continue;
    tx.update(ideas).set({ body: next }).where(eq(ideas.id, r.id)).run();
  }
}

// Move every link off the source tag onto the target (deduping links the idea
// already has), then drop the source row. The FK cascade clears its old links.
function mergeTagLinks(tx: Tx, sourceId: string, targetId: string): void {
  tx.run(
    sql`INSERT OR IGNORE INTO idea_tags (idea_id, tag_id)
        SELECT idea_id, ${targetId} FROM idea_tags WHERE tag_id = ${sourceId}`,
  );
  tx.delete(tags).where(eq(tags.id, sourceId)).run();
}

// Rename a tag, or merge it into an existing one when the new name is taken.
//
// The transaction callback is SYNCHRONOUS on purpose (see the note above
// resolveDesiredTags): bun-sqlite wraps BEGIN/COMMIT synchronously, so an async
// callback would commit before the awaited statements ran — forfeiting both
// atomicity and the guarantee that the lookup and the rename/merge happen as one
// uninterrupted step. Running eagerly closes the check-then-act window where a
// concurrent insert of `newName` could otherwise slip between the target lookup
// and the UPDATE and trip the uniq_tags_user_name index.
export async function renameOrMergeTag(
  userId: string,
  oldName: string,
  newName: string,
): Promise<TagMutation | null> {
  return db.transaction((tx) => {
    const source = findTag(tx, userId, oldName);
    if (!source) return null;
    if (newName === oldName) return { tag: source, merged: false };

    rewriteBodiesForTag(
      tx,
      userId,
      source.id,
      hashtagRenamer(oldName, newName),
    );

    const target = findTag(tx, userId, newName);
    if (target) {
      mergeTagLinks(tx, source.id, target.id);
      return { tag: target, merged: true };
    }

    const renamed = tx
      .update(tags)
      .set({ name: newName })
      .where(eq(tags.id, source.id))
      .returning()
      .all();
    return { tag: renamed[0], merged: false };
  });
}

// Delete a tag; its idea_tags links go with it via ON DELETE cascade. First
// strip the #name token from every linked body (keeping the bare word) so the
// tag can't silently re-create itself the next time a note is edited. Both steps
// run in one synchronous transaction (see the note above renameOrMergeTag).
export async function deleteTag(
  userId: string,
  name: string,
): Promise<boolean> {
  return db.transaction((tx) => {
    const source = findTag(tx, userId, name);
    if (!source) return false;
    rewriteBodiesForTag(tx, userId, source.id, hashtagStripper(name));
    tx.delete(tags).where(eq(tags.id, source.id)).run();
    return true;
  });
}
