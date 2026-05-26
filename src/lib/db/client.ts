import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { mkdirSync } from "node:fs";

mkdirSync("./data", { recursive: true });

const sqlite = new Database("./data/driftnote.db");
sqlite.exec("PRAGMA journal_mode = WAL;");
sqlite.exec("PRAGMA foreign_keys = ON;");

export const db = drizzle({ client: sqlite });
export { sqlite };
