import type { ExportIdea, UserExport } from "@/lib/export";
import { LOCALE } from "@/lib/time";

// Render a UserExport as a human-readable Markdown document: a short header,
// then notes newest-first under day headings, each with its body and tag list.

function isoDay(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

function dayHeading(ts: number): string {
  return new Date(ts).toLocaleDateString(LOCALE, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function timeLabel(ts: number): string {
  return new Date(ts).toLocaleTimeString(LOCALE, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function tagSuffix(names: string[]): string {
  if (names.length === 0) return "";
  return `\n\n  _${names.map((n) => `#${n}`).join(" ")}_`;
}

// Indent every line of the body so multi-line notes stay inside the bullet.
function indentBody(body: string): string {
  return body
    .trim()
    .split("\n")
    .map((line) => (line.length > 0 ? `  ${line}` : ""))
    .join("\n");
}

function renderIdea(idea: ExportIdea): string {
  const meta = `${timeLabel(idea.createdAt)} · ${idea.source}`;
  return `- **${meta}**\n\n${indentBody(idea.body)}${tagSuffix(idea.tags)}`;
}

function groupByDay(items: ExportIdea[]): Map<string, ExportIdea[]> {
  const groups = new Map<string, ExportIdea[]>();
  for (const idea of items) {
    const key = isoDay(idea.createdAt);
    const arr = groups.get(key) ?? [];
    arr.push(idea);
    groups.set(key, arr);
  }
  return groups;
}

function renderHeader(data: UserExport): string {
  const exported = new Date(data.exportedAt).toISOString();
  return [
    "# DriftNote export",
    "",
    `Exported ${exported}`,
    `${data.ideas.length} notes · ${data.tags.length} tags`,
  ].join("\n");
}

function renderDaySection(items: ExportIdea[]): string {
  const heading = `## ${dayHeading(items[0].createdAt)}`;
  return [heading, "", items.map(renderIdea).join("\n\n")].join("\n");
}

export function toMarkdown(data: UserExport): string {
  const blocks = [renderHeader(data)];
  if (data.ideas.length === 0) {
    blocks.push("_No notes yet._");
    return blocks.join("\n\n") + "\n";
  }
  for (const items of groupByDay(data.ideas).values()) {
    blocks.push(renderDaySection(items));
  }
  return blocks.join("\n\n") + "\n";
}
