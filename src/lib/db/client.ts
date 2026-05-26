import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { mkdirSync } from "node:fs";

mkdirSync("./data", { recursive: true });

const sqlite = new Database("./data/driftnote.db");
sqlite.run("PRAGMA journal_mode = WAL;");
sqlite.run("PRAGMA foreign_keys = ON;");

export const db = drizzle({ client: sqlite });
export { sqlite };
