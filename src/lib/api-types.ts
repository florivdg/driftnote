import type { IdeaWithTags, TagListEntry } from "@/lib/ideas";

export type StreamResponse = {
  ideas: IdeaWithTags[];
  activeTagHues: { name: string; hue: number }[];
};

export type TagsResponse = {
  tagList: TagListEntry[];
  totalIdeas: number;
  untaggedCount: number;
  textCount: number;
  archivedCount: number;
};
