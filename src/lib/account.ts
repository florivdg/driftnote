import { and, eq, ne } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { passkey, session, user } from "@/lib/db/schema";

export type PasskeySummary = {
  id: string;
  name: string | null;
  deviceType: string;
  backedUp: boolean;
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
      backedUp: passkey.backedUp,
      createdAt: passkey.createdAt,
    })
    .from(passkey)
    .where(eq(passkey.userId, userId))
    .orderBy(passkey.createdAt);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    deviceType: r.deviceType,
    backedUp: r.backedUp,
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
    .where(eq(session.userId, userId))
    .orderBy(session.createdAt);
  return rows.map((r) => ({
    id: r.id,
    ipAddress: r.ipAddress,
    userAgent: r.userAgent,
    createdAt: r.createdAt.getTime(),
  }));
}

export async function countPasskeys(userId: string): Promise<number> {
  const rows = await db
    .select({ id: passkey.id })
    .from(passkey)
    .where(eq(passkey.userId, userId));
  return rows.length;
}

export async function deletePasskey(
  userId: string,
  id: string,
): Promise<boolean> {
  const deleted = await db
    .delete(passkey)
    .where(and(eq(passkey.id, id), eq(passkey.userId, userId)))
    .returning({ id: passkey.id });
  return deleted.length > 0;
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
