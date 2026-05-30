import { sql } from "drizzle-orm";
import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
  primaryKey,
  check,
} from "drizzle-orm/sqlite-core";

// Better-Auth-generated tables. Regenerate with:
//   bun x auth@latest generate --output src/lib/db/auth-schema.ts --yes
// Do not hand-edit auth-schema.ts.
export * from "./auth-schema";

import { user } from "./auth-schema";

export const ideas = sqliteTable(
  "ideas",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    source: text("source").notNull().default("text"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    archivedAt: integer("archived_at"),
    pinnedAt: integer("pinned_at"),
  },
  (t) => [
    index("idx_ideas_user_created").on(t.userId, t.createdAt),
    check("ideas_source_check", sql`${t.source} IN ('text', 'voice')`),
  ],
);

export const tags = sqliteTable(
  "tags",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    hue: integer("hue").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [uniqueIndex("uniq_tags_user_name").on(t.userId, t.name)],
);

export const ideaTags = sqliteTable(
  "idea_tags",
  {
    ideaId: text("idea_id")
      .notNull()
      .references(() => ideas.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.ideaId, t.tagId] }),
    index("idx_idea_tags_tag").on(t.tagId),
  ],
);
