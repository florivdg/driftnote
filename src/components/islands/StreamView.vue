<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, shallowRef } from "vue";
import type { IdeaWithTags } from "@/lib/ideas";
import type { StreamResponse } from "@/lib/api-types";
import { groupByDay } from "@/lib/time";
import {
  currentFilters,
  filtersToSearch,
  initialFilters,
  subscribeFilters,
  subscribeStreamChanged,
  type Filters,
} from "@/lib/url-state";
import { createAbortableFetcher, fetchJSON } from "@/lib/fetcher";
import { useUndoDelete, type DeletedNote } from "@/lib/use-undo-delete";
import FilterStrip from "@/components/vue/FilterStrip.vue";
import DayGroup from "@/components/vue/DayGroup.vue";
import IdeaCard from "@/components/vue/IdeaCard.vue";
import UndoToast from "@/components/vue/UndoToast.vue";

const props = defineProps<{
  initial: {
    ideas: IdeaWithTags[];
    activeTagHues: { name: string; hue: number }[];
    query: string;
    tags: string[];
    untagged: boolean;
    source: "text" | "voice" | null;
    archived: boolean;
    from: string | null;
    to: string | null;
    sort: "newest" | "oldest";
  };
}>();

const ideas = shallowRef<IdeaWithTags[]>(props.initial.ideas);
const activeTagHues = shallowRef<{ name: string; hue: number }[]>(
  props.initial.activeTagHues,
);
const filters = shallowRef<Filters>(initialFilters(props.initial));

const groups = computed(() => groupByDay(ideas.value));

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

const undo = useUndoDelete(() => void loadIdeas(currentFilters()));

function onDeleted(note: DeletedNote): void {
  undo.offer(note);
  void loadIdeas(currentFilters());
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
    :archived="filters.archived"
    :from="filters.from"
    :to="filters.to"
    :sort="filters.sort"
  />
  <div v-if="ideas.length === 0" class="stream-empty">
    <h2>Nothing here.</h2>
    <p>Loosen a filter, or jot down what's on your mind.</p>
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
        @deleted="onDeleted"
      />
    </DayGroup>
  </template>
  <div class="stream-end">End of stream</div>
  <UndoToast
    v-if="undo.pending.value"
    message="Note deleted."
    :busy="undo.restoring.value"
    @undo="undo.undo"
    @dismiss="undo.dismiss"
  />
</template>
