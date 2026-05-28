import { and, eq, gt, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { passkey, session, user } from "@/lib/db/schema";

export type PasskeyDeleteResult = "deleted" | "last" | "missing";

export type PasskeySummary = {
  id: string;
  name: string | null;
  deviceType: string;
  createdAt: number | null;
};

export type SessionSummary = {
  id: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: number;
};

export async function listPasskeys(userId: string): Promise<PasskeySummary[]> {
  const rows = await db
    .select({
      id: passkey.id,
      name: passkey.name,
      deviceType: passkey.deviceType,
      createdAt: passkey.createdAt,
    })
    .from(passkey)
    .where(eq(passkey.userId, userId))
    .orderBy(passkey.createdAt);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    deviceType: r.deviceType,
    createdAt: r.createdAt ? r.createdAt.getTime() : null,
  }));
}

export async function listSessions(userId: string): Promise<SessionSummary[]> {
  const rows = await db
    .select({
      id: session.id,
      ipAddress: session.ipAddress,
      userAgent: session.userAgent,
      createdAt: session.createdAt,
    })
    .from(session)
    .where(and(eq(session.userId, userId), gt(session.expiresAt, new Date())))
    .orderBy(session.createdAt);
  return rows.map((r) => ({
    id: r.id,
    ipAddress: r.ipAddress,
    userAgent: r.userAgent,
    createdAt: r.createdAt.getTime(),
  }));
}

export async function deletePasskey(
  userId: string,
  id: string,
): Promise<PasskeyDeleteResult> {
  // Last-key guard inside the DELETE: the count subquery is evaluated as part
  // of the single (write-locked) statement, so concurrent deletes of different
  // passkeys can't both pass and drop the user to zero credentials.
  const deleted = await db
    .delete(passkey)
    .where(
      and(
        eq(passkey.id, id),
        eq(passkey.userId, userId),
        sql`(select count(*) from ${passkey} where ${passkey.userId} = ${userId}) > 1`,
      ),
    )
    .returning({ id: passkey.id });
  if (deleted.length > 0) return "deleted";
  // Nothing deleted: tell "only passkey" apart from "wrong/foreign id".
  const existing = db
    .select({ id: passkey.id })
    .from(passkey)
    .where(and(eq(passkey.id, id), eq(passkey.userId, userId)))
    .get();
  return existing ? "last" : "missing";
}

export async function deleteSession(
  userId: string,
  id: string,
): Promise<boolean> {
  const deleted = await db
    .delete(session)
    .where(and(eq(session.id, id), eq(session.userId, userId)))
    .returning({ id: session.id });
  return deleted.length > 0;
}

export async function deleteOtherSessions(
  userId: string,
  currentId: string,
): Promise<void> {
  await db
    .delete(session)
    .where(and(eq(session.userId, userId), ne(session.id, currentId)));
}

export async function setDisplayName(
  userId: string,
  name: string,
): Promise<boolean> {
  const updated = await db
    .update(user)
    .set({ name })
    .where(eq(user.id, userId))
    .returning({ id: user.id });
  return updated.length > 0;
}
