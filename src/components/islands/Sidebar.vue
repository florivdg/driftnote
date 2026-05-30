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
import { isoDaysAgo, setDateFrom, setFlag, toggleTag } from "@/lib/url";
import {
  applyURL,
  filtersToSearch,
  initialFilters,
  interceptNav,
  notifyStreamChanged,
  subscribeFilters,
  subscribeStreamChanged,
  type Filters,
} from "@/lib/url-state";
import { HUE_CHOICES, normalizeTagName } from "@/lib/tags";
import { createAbortableFetcher, fetchJSON } from "@/lib/fetcher";

const props = defineProps<{
  initial: {
    tagList: TagListEntry[];
    totalIdeas: number;
    untaggedCount: number;
    voiceCount: number;
    textCount: number;
    archivedCount: number;
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

const tagList = shallowRef<TagListEntry[]>(props.initial.tagList);
const totalIdeas = ref(props.initial.totalIdeas);
const untaggedCount = ref(props.initial.untaggedCount);
const voiceCount = ref(props.initial.voiceCount);
const textCount = ref(props.initial.textCount);
const archivedCount = ref(props.initial.archivedCount);
const filters = shallowRef<Filters>(initialFilters(props.initial));

const showUnused = ref(false);
const tagged = computed(() => tagList.value.filter((t) => t.count > 0));
const unused = computed(() => tagList.value.filter((t) => t.count === 0));
const visible = computed(() =>
  showUnused.value ? tagList.value : tagged.value,
);
function toggleUnused() {
  showUnused.value = !showUnused.value;
  // Hiding unused tags can unmount an open editor; close it so its listeners
  // don't leak (closePickerIfGone reads the freshly recomputed `visible`).
  closePickerIfGone();
}
const activeTagSet = computed(() => new Set(filters.value.tags));
const everythingActive = computed(() => {
  const f = filters.value;
  return ![
    activeTagSet.value.size > 0,
    !!f.q,
    f.untagged,
    !!f.source,
    f.archived,
    !!f.from,
    !!f.to,
  ].some(Boolean);
});
const untaggedActive = computed(() => filters.value.untagged);
const voiceActive = computed(() => filters.value.source === "voice");
const textActive = computed(() => filters.value.source === "text");
const archivedActive = computed(() => filters.value.archived);
const recentFrom = computed(() => isoDaysAgo(7));
const recentActive = computed(
  () => filters.value.from === recentFrom.value && !filters.value.to,
);

const baseURL = computed(
  () => new URL(`/${filtersToSearch(filters.value)}`, "http://x"),
);

const untaggedHref = computed(() =>
  setFlag(baseURL.value, "untagged", filters.value.untagged ? null : "1"),
);
const voiceHref = computed(() =>
  setFlag(baseURL.value, "source", voiceActive.value ? null : "voice"),
);
const textHref = computed(() =>
  setFlag(baseURL.value, "source", textActive.value ? null : "text"),
);
const archivedHref = computed(() =>
  setFlag(baseURL.value, "archived", archivedActive.value ? null : "1"),
);
const recentHref = computed(() =>
  setDateFrom(baseURL.value, recentActive.value ? null : recentFrom.value),
);
function tagHref(name: string): string {
  return toggleTag(baseURL.value, name);
}

const pickerOpenFor = ref<string | null>(null);
const saving = ref(false);
const editName = ref("");
const confirmingDelete = ref(false);
const errorMsg = ref<string | null>(null);
const pickerRef = useTemplateRef<HTMLDivElement>("pickerRef");
let activeDot: HTMLElement | null = null;

// The ref is bound inside v-for, so Vue resolves it to an array; only one
// popover is ever open, so unwrap to that single element.
function pickerEl(): HTMLElement | null {
  const v = pickerRef.value as HTMLElement | HTMLElement[] | null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

function openPicker(e: MouseEvent, name: string) {
  e.preventDefault();
  e.stopPropagation();
  const dot = e.currentTarget as HTMLElement;
  const r = dot.getBoundingClientRect();
  pickerOpenFor.value = name;
  editName.value = name;
  confirmingDelete.value = false;
  errorMsg.value = null;
  activeDot = dot;
  setTimeout(() => {
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
  }, 0);
  void nextTick().then(() => {
    const picker = pickerEl();
    if (!picker) return;
    // Clamp the vertically-centered popover so a tall editor near the top or
    // bottom edge stays fully on-screen.
    const half = picker.offsetHeight / 2;
    const center = r.top + r.height / 2;
    const top = Math.min(Math.max(center, half + 8), innerHeight - half - 8);
    picker.style.setProperty("--popover-top", `${top}px`);
    picker.style.setProperty("--popover-left", `${r.right + 8}px`);
    picker.querySelector<HTMLElement>(".cp-rename-input")?.focus();
  });
}

function closePicker() {
  pickerOpenFor.value = null;
  confirmingDelete.value = false;
  errorMsg.value = null;
  document.removeEventListener("mousedown", onDoc);
  document.removeEventListener("keydown", onKey);
}

function onDoc(e: MouseEvent) {
  const el = pickerEl();
  if (el && !el.contains(e.target as Node)) {
    closePicker();
  }
}

function onKey(e: KeyboardEvent) {
  if (e.key !== "Escape") return;
  closePicker();
  activeDot?.focus();
  activeDot = null;
}

async function tagRequest(name: string, init: RequestInit): Promise<boolean> {
  saving.value = true;
  errorMsg.value = null;
  try {
    const res = await fetch(`/api/tags/${encodeURIComponent(name)}`, init);
    if (!res.ok) {
      errorMsg.value = (await res.text()) || "request failed";
      return false;
    }
    return true;
  } catch {
    errorMsg.value = "network error";
    return false;
  } finally {
    saving.value = false;
  }
}

function jsonPatch(body: unknown): RequestInit {
  return {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

// Keep the URL's ?tags= filter in sync when the tag it points at is renamed
// (newName) or deleted (null); otherwise the stream refetches against a tag
// that no longer exists and goes empty with a dangling filter chip.
function syncActiveFilter(oldName: string, newName: string | null) {
  if (!filters.value.tags.includes(oldName)) return;
  const nextTags = newName
    ? [...new Set(filters.value.tags.map((t) => (t === oldName ? newName : t)))]
    : filters.value.tags.filter((t) => t !== oldName);
  applyURL(
    `/${filtersToSearch({ ...filters.value, tags: nextTags })}`,
    "replace",
  );
}

// If the open editor's tag is no longer rendered (deleted, or dropped to count
// 0 while unused are hidden), its popover unmounts; close it so the document
// listeners don't leak.
function closePickerIfGone(): void {
  const open = pickerOpenFor.value;
  if (open && !visible.value.some((t) => t.name === open)) closePicker();
}

async function pickHue(name: string, h: number) {
  confirmingDelete.value = false;
  if (!(await tagRequest(name, jsonPatch({ hue: h })))) return;
  tagList.value = tagList.value.map((t) =>
    t.name === name ? { ...t, hue: h } : t,
  );
  closePicker();
  notifyStreamChanged();
}

async function submitRename(oldName: string) {
  confirmingDelete.value = false;
  const next = normalizeTagName(editName.value).replace(/^#+/, "");
  if (!next || next === oldName) {
    closePicker();
    return;
  }
  if (!(await tagRequest(oldName, jsonPatch({ name: next })))) return;
  closePicker();
  syncActiveFilter(oldName, next);
  notifyStreamChanged();
}

async function submitDelete(name: string) {
  if (!confirmingDelete.value) {
    confirmingDelete.value = true;
    return;
  }
  if (
    !(await tagRequest(name, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
    }))
  )
    return;
  closePicker();
  syncActiveFilter(name, null);
  notifyStreamChanged();
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
    textCount.value = data.textCount;
    archivedCount.value = data.archivedCount;
    closePickerIfGone();
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
        <a
          :class="'side-item' + (textActive ? ' active' : '')"
          :href="textHref"
          :aria-current="textActive ? 'page' : undefined"
          @click="interceptNav($event, textHref)"
        >
          <span class="dot dot--outline"></span>
          <span class="label">text only</span>
          <span class="num">{{ textCount }}</span>
        </a>
        <a
          :class="'side-item' + (recentActive ? ' active' : '')"
          :href="recentHref"
          :aria-current="recentActive ? 'page' : undefined"
          @click="interceptNav($event, recentHref)"
        >
          <span class="dot dot--outline"></span>
          <span class="label">last 7 days</span>
        </a>
        <a
          :class="'side-item' + (archivedActive ? ' active' : '')"
          :href="archivedHref"
          :aria-current="archivedActive ? 'page' : undefined"
          @click="interceptNav($event, archivedHref)"
        >
          <span class="dot dot--outline"></span>
          <span class="label">archived</span>
          <span class="num">{{ archivedCount }}</span>
        </a>
      </div>

      <div class="side-divider"></div>

      <div class="side-section">
        <div class="side-label">
          <span>Tags</span>
          <button
            v-if="unused.length > 0"
            type="button"
            class="tag-unused-toggle"
            :aria-pressed="showUnused"
            @click="toggleUnused"
          >
            {{ showUnused ? "hide unused" : `${unused.length} unused` }}
          </button>
          <span class="count">{{ tagged.length }}</span>
        </div>
        <div
          v-for="tg in visible"
          :key="tg.id"
          :class="[
            'side-item-wrap',
            activeTagSet.has(tg.name) && 'active',
            tg.count === 0 && 'is-unused',
          ]"
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
            :aria-label="`Edit tag #${tg.name}`"
            title="Edit tag"
            @click="openPicker($event, tg.name)"
          ></button>
          <div
            v-if="pickerOpenFor === tg.name"
            ref="pickerRef"
            class="color-picker"
            role="dialog"
            :aria-label="`Edit tag #${tg.name}`"
          >
            <div class="color-picker-head">
              <span class="cp-tag">#{{ tg.name }}</span>
              <span class="cp-hint">edit</span>
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
            <form class="cp-rename" @submit.prevent="submitRename(tg.name)">
              <input
                v-model="editName"
                class="cp-rename-input"
                type="text"
                :aria-label="`Rename #${tg.name}`"
                :disabled="saving"
                autocomplete="off"
                spellcheck="false"
              />
              <button type="submit" class="cp-rename-btn" :disabled="saving">
                rename
              </button>
            </form>
            <div class="cp-actions">
              <button
                type="button"
                class="cp-delete"
                :class="{ confirming: confirmingDelete }"
                :disabled="saving"
                @click="submitDelete(tg.name)"
              >
                {{ confirmingDelete ? "confirm delete?" : "delete tag" }}
              </button>
            </div>
            <p v-if="errorMsg" class="cp-error" role="alert">{{ errorMsg }}</p>
          </div>
        </div>
      </div>
    </nav>
  </aside>
</template>
