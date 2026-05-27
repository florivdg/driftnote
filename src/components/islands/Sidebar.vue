<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  useTemplateRef,
} from "vue";
import type { TagListEntry } from "@/lib/ideas";
import type { TagsResponse } from "@/lib/api-types";
import { setFlag, toggleTag } from "@/lib/url";
import {
  filtersToSearch,
  interceptNav,
  notifyStreamChanged,
  subscribeFilters,
  subscribeStreamChanged,
  type Filters,
} from "@/lib/url-state";
import { HUE_CHOICES } from "@/lib/tags";
import { createAbortableFetcher, fetchJSON } from "@/lib/fetcher";

const props = defineProps<{
  initial: {
    tagList: TagListEntry[];
    totalIdeas: number;
    untaggedCount: number;
    voiceCount: number;
    query: string;
    tags: string[];
    untagged: boolean;
    source: "text" | "voice" | null;
  };
}>();

const tagList = shallowRef<TagListEntry[]>(props.initial.tagList);
const totalIdeas = ref(props.initial.totalIdeas);
const untaggedCount = ref(props.initial.untaggedCount);
const voiceCount = ref(props.initial.voiceCount);
const filters = shallowRef<Filters>({
  q: props.initial.query,
  tags: props.initial.tags,
  untagged: props.initial.untagged,
  source: props.initial.source,
});

const visible = computed(() => tagList.value.filter((t) => t.count > 0));
const activeTagSet = computed(() => new Set(filters.value.tags));
const everythingActive = computed(
  () =>
    activeTagSet.value.size === 0 &&
    !filters.value.q &&
    !filters.value.untagged &&
    !filters.value.source,
);
const untaggedActive = computed(() => filters.value.untagged);
const voiceActive = computed(() => filters.value.source === "voice");

const baseURL = computed(
  () => new URL(`/${filtersToSearch(filters.value)}`, "http://x"),
);

const untaggedHref = computed(() =>
  setFlag(baseURL.value, "untagged", filters.value.untagged ? null : "1"),
);
const voiceHref = computed(() =>
  setFlag(baseURL.value, "source", voiceActive.value ? null : "voice"),
);
function tagHref(name: string): string {
  return toggleTag(baseURL.value, name);
}

const pickerOpenFor = ref<string | null>(null);
const saving = ref(false);
const pickerRef = useTemplateRef<HTMLDivElement>("pickerRef");
let activeDot: HTMLElement | null = null;

function openPicker(e: MouseEvent, name: string) {
  e.preventDefault();
  e.stopPropagation();
  const dot = e.currentTarget as HTMLElement;
  const r = dot.getBoundingClientRect();
  pickerOpenFor.value = name;
  activeDot = dot;
  setTimeout(() => {
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
  }, 0);
  void nextTick().then(() => {
    const picker = pickerRef.value;
    if (picker) {
      picker.style.setProperty("--popover-top", `${r.top + r.height / 2}px`);
      picker.style.setProperty("--popover-left", `${r.right + 8}px`);
      picker.querySelector<HTMLElement>("button")?.focus();
    }
  });
}

function closePicker() {
  pickerOpenFor.value = null;
  document.removeEventListener("mousedown", onDoc);
  document.removeEventListener("keydown", onKey);
}

function onDoc(e: MouseEvent) {
  if (pickerRef.value && !pickerRef.value.contains(e.target as Node)) {
    closePicker();
  }
}

function onKey(e: KeyboardEvent) {
  if (e.key !== "Escape") return;
  closePicker();
  activeDot?.focus();
  activeDot = null;
}

async function pickHue(name: string, h: number) {
  saving.value = true;
  try {
    const res = await fetch(`/api/tags/${encodeURIComponent(name)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ hue: h }),
    });
    if (!res.ok) throw new Error("failed");
    tagList.value = tagList.value.map((t) =>
      t.name === name ? { ...t, hue: h } : t,
    );
    closePicker();
    notifyStreamChanged();
  } catch (err) {
    console.error(err);
  } finally {
    saving.value = false;
  }
}

const fetcher = createAbortableFetcher();
let unsubFilters: (() => void) | null = null;
let unsubStream: (() => void) | null = null;

async function refetchTags(): Promise<void> {
  try {
    const data = await fetcher.run((signal) =>
      fetchJSON<TagsResponse>("/api/tags", signal),
    );
    if (!data) return;
    tagList.value = data.tagList;
    totalIdeas.value = data.totalIdeas;
    untaggedCount.value = data.untaggedCount;
    voiceCount.value = data.voiceCount;
  } catch (err) {
    console.error("tags fetch failed", err);
  }
}

onMounted(() => {
  unsubFilters = subscribeFilters((f) => {
    filters.value = f;
  });
  unsubStream = subscribeStreamChanged(() => {
    void refetchTags();
  });
});

onBeforeUnmount(() => {
  unsubFilters?.();
  unsubStream?.();
  fetcher.dispose();
  document.removeEventListener("mousedown", onDoc);
  document.removeEventListener("keydown", onKey);
});
</script>

<template>
  <aside class="sidebar">
    <nav aria-label="Filters">
      <div class="side-section">
        <div class="side-label"><span>Stream</span></div>
        <a
          :class="'side-item' + (everythingActive ? ' active' : '')"
          href="/"
          :aria-current="everythingActive ? 'page' : undefined"
          @click="interceptNav($event, '/')"
        >
          <span class="dot dot--ink"></span>
          <span class="label">everything</span>
          <span class="num">{{ totalIdeas }}</span>
        </a>
        <a
          :class="'side-item' + (untaggedActive ? ' active' : '')"
          :href="untaggedHref"
          :aria-current="untaggedActive ? 'page' : undefined"
          @click="interceptNav($event, untaggedHref)"
        >
          <span class="dot dot--outline"></span>
          <span class="label">untagged</span>
          <span class="num">{{ untaggedCount }}</span>
        </a>
        <a
          :class="'side-item' + (voiceActive ? ' active' : '')"
          :href="voiceHref"
          :aria-current="voiceActive ? 'page' : undefined"
          @click="interceptNav($event, voiceHref)"
        >
          <span class="dot dot--outline"></span>
          <span class="label">voice only</span>
          <span class="num">{{ voiceCount }}</span>
        </a>
      </div>

      <div class="side-divider"></div>

      <div class="side-section">
        <div class="side-label">
          <span>Tags</span>
          <span class="count">{{ visible.length }}</span>
        </div>
        <div
          v-for="tg in visible"
          :key="tg.id"
          :class="['side-item-wrap', activeTagSet.has(tg.name) && 'active']"
        >
          <a
            :class="[
              'side-item',
              'has-hue',
              activeTagSet.has(tg.name) && 'active',
            ]"
            :data-hue="tg.hue"
            :href="tagHref(tg.name)"
            :aria-current="activeTagSet.has(tg.name) ? 'page' : undefined"
            @click="interceptNav($event, tagHref(tg.name))"
          >
            <span class="dot" aria-hidden="true"></span>
            <span class="label">{{ tg.name }}</span>
            <span class="num">{{ tg.count }}</span>
          </a>
          <button
            type="button"
            class="dot-button-overlay"
            :aria-label="`Change color for #${tg.name}`"
            title="Change color"
            @click="openPicker($event, tg.name)"
          ></button>
          <div
            v-if="pickerOpenFor === tg.name"
            ref="pickerRef"
            class="color-picker"
            role="dialog"
            :aria-label="`Color for #${tg.name}`"
          >
            <div class="color-picker-head">
              <span class="cp-tag">#{{ tg.name }}</span>
              <span class="cp-hint">pick a color</span>
            </div>
            <div class="color-grid">
              <button
                v-for="(h, index) in HUE_CHOICES"
                :key="h"
                :class="['color-swatch', h === tg.hue && 'active']"
                :data-hue="h"
                :disabled="saving"
                :aria-label="`Color ${index + 1} of ${HUE_CHOICES.length}`"
                :aria-pressed="h === tg.hue"
                @click="pickHue(tg.name, h)"
              ></button>
            </div>
          </div>
        </div>
      </div>
    </nav>
  </aside>
</template>
