<script setup lang="ts">
import { computed } from "vue";
import Chip from "./Chip.vue";
import { removeTag, setQuery, setFlag, setDateFrom } from "@/lib/url";
import { interceptNav } from "@/lib/url-state";

const props = defineProps<{
  url: string;
  activeTags: { name: string; hue?: number }[];
  query: string;
  untagged: boolean;
  source: "text" | "voice" | null;
  archived: boolean;
  from: string | null;
  to: string | null;
  sort: "newest" | "oldest";
}>();

const baseURL = computed(() => new URL(props.url, "http://x"));

function rangeLabel(from: string | null, to: string | null): string {
  if (from) return to ? `${from} → ${to}` : `since ${from}`;
  return to ? `until ${to}` : "";
}
const dateLabel = computed(() => rangeLabel(props.from, props.to));

const hasAny = computed(() =>
  [
    props.activeTags.length > 0,
    !!props.query,
    props.untagged,
    !!props.source,
    props.archived,
    !!dateLabel.value,
  ].some(Boolean),
);

const tagChips = computed(() =>
  props.activeTags.map((t) => ({
    name: t.name,
    hue: t.hue,
    href: removeTag(baseURL.value, t.name),
  })),
);
const queryHref = computed(() => setQuery(baseURL.value, ""));
const untaggedHref = computed(() => setFlag(baseURL.value, "untagged", null));
const sourceHref = computed(() => setFlag(baseURL.value, "source", null));
const archivedHref = computed(() => setFlag(baseURL.value, "archived", null));
const dateHref = computed(() => setDateFrom(baseURL.value, null));
const sortHref = computed(() =>
  setFlag(baseURL.value, "sort", props.sort === "oldest" ? null : "oldest"),
);
const sortLabel = computed(() =>
  props.sort === "oldest" ? "oldest first" : "newest first",
);
const clearHref = computed(() => baseURL.value.pathname);
</script>

<template>
  <div class="filter-strip">
    <template v-if="hasAny">
      <span class="filter-label">Filtering</span>
      <div class="chips">
        <Chip
          v-for="t in tagChips"
          :key="t.name"
          :tag="t.name"
          :hue="t.hue"
          :remove-href="t.href"
          @remove="interceptNav($event, t.href)"
        />
        <span v-if="query" class="chip">
          <span class="chip-mark"></span>
          <span>&ldquo;{{ query }}&rdquo;</span>
          <a
            class="x"
            :href="queryHref"
            aria-label="remove search"
            @click="interceptNav($event, queryHref)"
          >
            ×
          </a>
        </span>
        <span v-if="untagged" class="chip">
          <span class="chip-mark"></span>
          <span>untagged</span>
          <a
            class="x"
            :href="untaggedHref"
            aria-label="remove untagged"
            @click="interceptNav($event, untaggedHref)"
          >
            ×
          </a>
        </span>
        <span v-if="source" class="chip">
          <span class="chip-mark"></span>
          <span>{{ source }} only</span>
          <a
            class="x"
            :href="sourceHref"
            aria-label="remove source filter"
            @click="interceptNav($event, sourceHref)"
          >
            ×
          </a>
        </span>
        <span v-if="archived" class="chip">
          <span class="chip-mark"></span>
          <span>archived</span>
          <a
            class="x"
            :href="archivedHref"
            aria-label="remove archived filter"
            @click="interceptNav($event, archivedHref)"
          >
            ×
          </a>
        </span>
        <span v-if="dateLabel" class="chip">
          <span class="chip-mark"></span>
          <span>{{ dateLabel }}</span>
          <a
            class="x"
            :href="dateHref"
            aria-label="remove date filter"
            @click="interceptNav($event, dateHref)"
          >
            ×
          </a>
        </span>
      </div>
    </template>
    <a
      class="filter-sort"
      :href="sortHref"
      :title="`Sort: ${sortLabel}`"
      @click="interceptNav($event, sortHref)"
    >
      {{ sortLabel }}
    </a>
    <a
      v-if="hasAny"
      class="clear"
      :href="clearHref"
      @click="interceptNav($event, clearHref)"
    >
      Clear
    </a>
  </div>
</template>
