import type { IdeaWithTags, TagListEntry } from "@/lib/ideas";

export type StreamResponse = {
  ideas: IdeaWithTags[];
};

export type TagsResponse = {
  tagList: TagListEntry[];
  totalIdeas: number;
  untaggedCount: number;
  voiceCount: number;
};
