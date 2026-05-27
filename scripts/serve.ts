import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { db } from "../src/lib/db/client";

migrate(db, { migrationsFolder: "./drizzle" });
console.log("Migrations applied.");

await import("../dist/server/entry.mjs");
