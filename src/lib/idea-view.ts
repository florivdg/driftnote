import { computed, type ComputedRef, type Ref } from "vue";
import type { IdeaWithTags } from "@/lib/ideas";
import { parseIdeaBody, type BodyPart } from "@/lib/idea-body";
import { formatTime } from "@/lib/time";

// Shared derived view-state for a single idea: the body split into
// text/hashtag parts, a relative timestamp, and the lead tag's hue (drives the
// card stripe / data-hue). Used by both IdeaCard and the permalink NoteDetail.
export function useIdeaView(idea: Ref<IdeaWithTags>): {
  parts: ComputedRef<BodyPart[]>;
  timeLabel: ComputedRef<string>;
  primaryHue: ComputedRef<number | undefined>;
} {
  return {
    parts: computed(() => parseIdeaBody(idea.value.body, idea.value.tags)),
    timeLabel: computed(() => formatTime(idea.value.createdAt)),
    primaryHue: computed(() => idea.value.tags[0]?.hue),
  };
}
