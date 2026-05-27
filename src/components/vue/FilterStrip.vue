<script setup lang="ts">
import { computed } from "vue";
import Chip from "./Chip.vue";
import { removeTag, setQuery, setFlag } from "@/lib/url";
import { interceptNav } from "@/lib/url-state";

const props = defineProps<{
  url: string;
  activeTags: { name: string; hue?: number }[];
  query: string;
  untagged: boolean;
  source: "text" | "voice" | null;
}>();

const baseURL = computed(() => new URL(props.url, "http://x"));
const hasAny = computed(
  () =>
    props.activeTags.length > 0 ||
    !!props.query ||
    props.untagged ||
    !!props.source,
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
const clearHref = computed(() => baseURL.value.pathname);
</script>

<template>
  <div v-if="hasAny" class="filter-strip">
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
    </div>
    <a class="clear" :href="clearHref" @click="interceptNav($event, clearHref)">
      Clear
    </a>
  </div>
</template>
