<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, shallowRef } from "vue";
import type { IdeaWithTags } from "@/lib/ideas";
import type { StreamResponse } from "@/lib/api-types";
import { groupByDay } from "@/lib/time";
import {
  currentFilters,
  filtersToSearch,
  subscribeFilters,
  subscribeStreamChanged,
  type Filters,
} from "@/lib/url-state";
import { createAbortableFetcher, fetchJSON } from "@/lib/fetcher";
import FilterStrip from "@/components/vue/FilterStrip.vue";
import DayGroup from "@/components/vue/DayGroup.vue";
import IdeaCard from "@/components/vue/IdeaCard.vue";

function isFilterActive(f: Filters): boolean {
  return f.q !== "" || f.tags.length > 0 || f.untagged || f.source !== null;
}

const props = defineProps<{
  initial: {
    ideas: IdeaWithTags[];
    activeTagHues: { name: string; hue: number }[];
    query: string;
    tags: string[];
    untagged: boolean;
    source: "text" | "voice" | null;
  };
}>();

const ideas = shallowRef<IdeaWithTags[]>(props.initial.ideas);
const activeTagHues = shallowRef<{ name: string; hue: number }[]>(
  props.initial.activeTagHues,
);
const filters = shallowRef<Filters>({
  q: props.initial.query,
  tags: props.initial.tags,
  untagged: props.initial.untagged,
  source: props.initial.source,
});

const groups = computed(() => groupByDay(ideas.value));
const filterActive = computed(() => isFilterActive(filters.value));

// O(N×T) once per ideas change, then O(M) lookups instead of O(N×M×T) scans.
const hueByTagName = computed(() => {
  const map = new Map<string, number>();
  for (const idea of ideas.value) {
    for (const t of idea.tags) if (!map.has(t.name)) map.set(t.name, t.hue);
  }
  return map;
});

const activeTagHueMap = computed(
  () => new Map(activeTagHues.value.map((t) => [t.name, t.hue])),
);

// Server-side hue is authoritative; fall back to the ideas-derived map so a
// freshly created idea's tag colour shows up before the next stream refetch.
const activeTagsWithHue = computed(() =>
  filters.value.tags.map((name) => ({
    name,
    hue: activeTagHueMap.value.get(name) ?? hueByTagName.value.get(name),
  })),
);

const urlString = computed(() => `/${filtersToSearch(filters.value)}`);

const fetcher = createAbortableFetcher();
let unsubFilters: (() => void) | null = null;
let unsubStream: (() => void) | null = null;

async function loadIdeas(f: Filters): Promise<void> {
  const search = filtersToSearch(f);
  try {
    const data = await fetcher.run((signal) =>
      fetchJSON<StreamResponse>(`/api/stream${search}`, signal),
    );
    if (data) {
      ideas.value = data.ideas;
      activeTagHues.value = data.activeTagHues;
    }
  } catch (err) {
    console.error("stream fetch failed; falling back to reload", err);
    location.assign(`/${search}`);
  }
}

onMounted(() => {
  unsubFilters = subscribeFilters((f) => {
    filters.value = f;
    void loadIdeas(f);
  });
  unsubStream = subscribeStreamChanged(() => {
    void loadIdeas(currentFilters());
  });
});

onBeforeUnmount(() => {
  unsubFilters?.();
  unsubStream?.();
  fetcher.dispose();
});
</script>

<template>
  <FilterStrip
    :url="urlString"
    :active-tags="activeTagsWithHue"
    :query="filters.q"
    :untagged="filters.untagged"
    :source="filters.source"
  />
  <div v-if="ideas.length === 0 && filterActive" class="stream-empty">
    <h3>Nothing here.</h3>
    <p>Loosen a filter, or jot down what&rsquo;s on your mind.</p>
  </div>
  <div
    v-else-if="ideas.length === 0"
    class="stream-empty stream-empty--onboarding"
    aria-label="Welcome — no notes yet"
  >
    <h3>Your stream starts here.</h3>
    <p>Capture a thought in the composer below.</p>
    <ul class="stream-empty-hints" aria-label="Keyboard shortcuts">
      <li><kbd>#</kbd> prefix a word to tag it</li>
      <li><kbd>⌘↵</kbd> to save from the keyboard</li>
      <li><kbd>/</kbd> to jump to search</li>
      <li><kbd>M</kbd> to record voice</li>
    </ul>
  </div>
  <template v-else>
    <DayGroup
      v-for="g in groups"
      :key="g.key"
      :label="g.label"
      :count="g.items.length"
    >
      <IdeaCard
        v-for="(idea, idx) in g.items"
        :key="idea.id"
        :idea="idea"
        :index="idx"
        :url="urlString"
      />
    </DayGroup>
  </template>
  <div class="stream-end">End of stream</div>
</template>
