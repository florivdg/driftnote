// One-line JSON audit log to stdout. Bun captures it; a real sink can come later.
export type AuditFields = Record<string, string | number | boolean | null>;

export function audit(event: string, fields: AuditFields = {}): void {
  console.log(JSON.stringify({ t: Date.now(), event, ...fields }));
}
