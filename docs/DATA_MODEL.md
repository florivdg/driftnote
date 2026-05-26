# DriftNote — Data Model

## ER overview

```
              ┌───────────┐
              │   user    │  (Better Auth)
              │ id, name, │
              │ email…    │
              └─────┬─────┘
                    │ 1
                    │
            ┌───────┴────────┐
            │ N              │ N
       ┌────▼────┐      ┌────▼────┐
       │  ideas  │      │  tags   │
       │ id,     │      │ id,     │
       │ body,   │      │ name,   │
       │ source, │      │ hue     │
       │ ts      │      └────┬────┘
       └────┬────┘           │
            │ N           N  │
            │     ┌──────────┘
            │     │
        ┌───▼─────▼────┐
        │  idea_tags   │
        │ ideaId, tagId│
        └──────────────┘

(Better Auth also owns: session, account, verification, passkey)
```

## Tables

### `user` / `session` / `account` / `verification` / `passkey`

Owned by Better Auth. Generated via:

```sh
bun x auth@latest generate --output src/lib/db/auth-schema.ts --yes
```

(The CLI package is `auth`, not `@better-auth/cli` — the latter is being deprecated. [Source](https://better-auth.com/docs/concepts/cli).)

Imported and re-exported from `src/lib/db/schema.ts` so Drizzle's migration story sees them. **Do not modify by hand** — regenerate when upgrading Better Auth. The `passkey` table is contributed by the `@better-auth/passkey` plugin and only appears in the generated schema when that plugin is enabled in `auth.ts`.

Relevant columns for app code:

- `user.id` (text, primary key) — used as `ideas.userId` / `tags.userId` foreign key.
- `user.name`, `user.email`, `user.image` — for avatar / masthead.
- `session.token`, `session.userId`, `session.expiresAt` — read via `auth.api.getSession()` in middleware.

### `ideas`

| Column      | Type                                           | Notes                                      |
| ----------- | ---------------------------------------------- | ------------------------------------------ |
| `id`        | text PK                                        | `nanoid()` or `crypto.randomUUID()`.       |
| `userId`    | text NOT NULL FK → `user.id` ON DELETE CASCADE |                                            |
| `body`      | text NOT NULL                                  | Raw text including hashtags.               |
| `source`    | text NOT NULL DEFAULT `'text'`                 | CHECK `IN ('text','voice')`.               |
| `createdAt` | integer NOT NULL                               | unix ms (SQLite `INTEGER` + `Date.now()`). |
| `updatedAt` | integer NOT NULL                               | unix ms.                                   |

**Indexes**:

- `idx_ideas_user_created` on `(userId, createdAt DESC)` — covers the main stream query.

### `tags`

| Column      | Type                                           | Notes                              |
| ----------- | ---------------------------------------------- | ---------------------------------- |
| `id`        | text PK                                        |                                    |
| `userId`    | text NOT NULL FK → `user.id` ON DELETE CASCADE |                                    |
| `name`      | text NOT NULL                                  | lowercase, `/^[a-z][a-z0-9_-]*$/`. |
| `hue`       | integer NOT NULL                               | 0–360, one of `HUE_CHOICES`.       |
| `createdAt` | integer NOT NULL                               |                                    |

**Constraints**:

- `UNIQUE (userId, name)` — a user can't have two tags with the same name.

### `idea_tags`

| Column   | Type                                            | Notes |
| -------- | ----------------------------------------------- | ----- |
| `ideaId` | text NOT NULL FK → `ideas.id` ON DELETE CASCADE |       |
| `tagId`  | text NOT NULL FK → `tags.id` ON DELETE CASCADE  |       |

**Constraints**:

- `PRIMARY KEY (ideaId, tagId)`.
- `idx_idea_tags_tag` on `tagId` — tag-filter queries (e.g. `WHERE tagId = ?`).

## Why a join table, not a JSON array

`ideas.tags TEXT JSON` would work in SQLite, but:

- Filtering by tag (`WHERE tag = 'recipe'`) becomes a `json_each` scan with no index.
- Tag rename / recolor needs to walk every idea.
- Counts (`tag.count` in the sidebar) become per-row `json_each` aggregations.

The join table keeps queries one indexed `JOIN` away from the page renderer and lets `tags` own canonical hue + name. Cost is one extra `INSERT` per tag per idea — fine for a single-user write rate.

## Write flow (POST /api/ideas)

```ts
const body = await req.json();
const text = String(body.text ?? "").trim();
const source = body.source === "voice" ? "voice" : "text";
const extracted = extractTags(text); // ported from data.jsx
const now = Date.now();

await db.transaction(async (tx) => {
  const ideaId = nanoid();
  await tx.insert(ideas).values({
    id: ideaId,
    userId,
    body: text,
    source,
    createdAt: now,
    updatedAt: now,
  });

  // upsert tags, then link
  for (const name of extracted) {
    const existing = await tx
      .select()
      .from(tags)
      .where(and(eq(tags.userId, userId), eq(tags.name, name)))
      .get();
    const tagId = existing?.id ?? nanoid();
    if (!existing) {
      await tx.insert(tags).values({
        id: tagId,
        userId,
        name,
        hue: defaultHueFor(name), // 0–360 from a deterministic hash
        createdAt: now,
      });
    }
    await tx.insert(ideaTags).values({ ideaId, tagId }).onConflictDoNothing();
  }
});
```

`defaultHueFor(name)` picks from `HUE_CHOICES` (13 values from `data.jsx`) by hashing the name. Known seed tags (`recipe`, `writing`, …) get their predefined hue from `TAG_PALETTE` on first creation.

## Read flow (page render)

The main stream query, grouped server-side:

```sql
SELECT i.id, i.body, i.source, i.createdAt,
       GROUP_CONCAT(t.name) AS tag_names,
       GROUP_CONCAT(t.hue)  AS tag_hues
FROM ideas i
LEFT JOIN idea_tags it ON it.ideaId = i.id
LEFT JOIN tags     t  ON t.id = it.tagId
WHERE i.userId = ?
  AND (? IS NULL OR i.body LIKE '%' || ? || '%')
GROUP BY i.id
HAVING (? IS NULL OR <all of activeTags> IN tag_names)
ORDER BY i.createdAt DESC
LIMIT 200;
```

The Drizzle version uses `groupBy` + `sql\`group_concat(${tags.name})\``; the `HAVING`for multi-tag AND-filter is easier expressed as a chain of`EXISTS` subqueries. Defer optimization until 200+ ideas exist.

Sidebar tag list (with counts):

```sql
SELECT t.id, t.name, t.hue, COUNT(it.ideaId) AS count
FROM tags t
LEFT JOIN idea_tags it ON it.tagId = t.id
WHERE t.userId = ?
GROUP BY t.id
ORDER BY count DESC, t.name ASC;
```

## bun:sqlite specifics

- Driver: `import { Database } from "bun:sqlite"`. Drizzle adapter: `import { drizzle } from "drizzle-orm/bun-sqlite"`.
- Drizzle's initialization supports both forms ([docs](https://orm.drizzle.team/docs/connect-bun-sqlite)):
  ```ts
  // (a) pass a path — Drizzle constructs the Database for you
  const db = drizzle("./data/driftnote.db");
  // (b) pass an existing client — we use this so we can call PRAGMAs on it
  const sqlite = new Database("./data/driftnote.db");
  const db = drizzle({ client: sqlite });
  ```
- Enable WAL + foreign keys once at boot:
  ```ts
  sqlite.exec("PRAGMA journal_mode = WAL;");
  sqlite.exec("PRAGMA foreign_keys = ON;");
  ```
- `bun:sqlite` is synchronous; Drizzle exposes synchronous methods (`.all()`, `.get()`, `.run()`) plus the async-shaped API. Either works — pick one style per file. Transactions are blocking and serialized via SQLite's locking.
- Single `Database` instance for the process. DB file: `./data/driftnote.db` (gitignored). `mkdir -p data` at boot if missing.
- Required dep: `@types/bun` (dev) so TypeScript resolves `bun:sqlite`. Drizzle's recommended install: `bun add drizzle-orm dotenv -d drizzle-kit @types/bun` ([docs](https://orm.drizzle.team/docs/get-started/bun-sqlite-existing)).

## Better Auth + Drizzle (single connection)

**Decision: use Better Auth's Drizzle adapter, not the bun:sqlite driver directly.** Better Auth ships `better-auth/adapters/drizzle` (not a separate package), so we wire it as:

```ts
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/lib/db/client";

betterAuth({
  database: drizzleAdapter(db, { provider: "sqlite" }),
  // ...
});
```

That means:

- One `bun:sqlite` `Database` instance per process; one Drizzle `db` instance; both Better Auth's tables and our app tables are reached through it.
- Migration history is unified — `drizzle-kit generate` picks up both the Better-Auth-generated schema (re-exported from `src/lib/db/schema.ts`) and our app schema, and emits a single migration set.
- No "dual driver" / "two file handles" concern from the earlier draft.

Better Auth also accepts a raw `bun:sqlite` Database directly (`database: new Database("...")`) per [its SQLite adapter docs](https://www.better-auth.com/docs/adapters/sqlite), but that path uses Better Auth's built-in Kysely-based schema and bypasses Drizzle — we want Drizzle to own everything.

## Migration strategy

- Source of truth: `src/lib/db/schema.ts` (Drizzle) — which re-exports the Better-Auth-generated tables from `auth-schema.ts`.
- `drizzle.config.ts` declares dialect + schema path + output folder:
  ```ts
  import { defineConfig } from "drizzle-kit";
  export default defineConfig({
    dialect: "sqlite",
    schema: "./src/lib/db/schema.ts",
    out: "./drizzle",
    dbCredentials: { url: "./data/driftnote.db" },
  });
  ```
- `bun run db:generate` → `drizzle-kit generate` emits a new `0001_xxx.sql` under `./drizzle/`.
- `bun run db:migrate` → a tiny runner (drizzle-kit's CLI doesn't apply migrations for bun-sqlite; the migrator helper does):

  ```ts
  // scripts/migrate.ts
  import { migrate } from "drizzle-orm/bun-sqlite/migrator";
  import { db } from "../src/lib/db/client";
  migrate(db, { migrationsFolder: "./drizzle" });
  ```

  `package.json`:

  ```json
  {
    "scripts": {
      "db:generate": "drizzle-kit generate",
      "db:migrate": "bun scripts/migrate.ts"
    }
  }
  ```

Auth tables are part of the same migration history — regenerate auth schema with `bun x auth@latest generate`, re-export from `schema.ts`, run `bun run db:generate`, commit the resulting `drizzle/000N_xxx.sql`.

## Future schema work (not in v1)

- `user_prefs` table for theme/density/sidebar side (currently localStorage).
- `idea_versions` for edit history.
- `audio_clips` table + on-disk blob storage for real voice recordings.
- Per-user tag count materialized via trigger if N grows.
