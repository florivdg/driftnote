<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { isPlainHotkey } from "@/lib/dom";
import { setQuery } from "@/lib/url";
import { applyURL, subscribeFilters } from "@/lib/url-state";

// Debounced search island. Owns the masthead search input.
//
// On input change, debounce 250ms, then pushState the new URL via applyURL().
// StreamView listens for the `urlchange` event and refetches /api/stream — the
// input element itself never unmounts, so focus and caret stay where the user
// left them while typing.

const props = defineProps<{
  initial: string;
}>();

const value = ref(props.initial);
let timer: ReturnType<typeof setTimeout> | null = null;

function commit() {
  applyURL(setQuery(new URL(location.href), value.value.trim()));
}

function onInput() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(commit, 250);
}

function onKeyDown(e: KeyboardEvent) {
  if (e.key === "Enter") {
    e.preventDefault();
    if (timer) clearTimeout(timer);
    commit();
  }
}

function focusOnSlash(e: KeyboardEvent) {
  if (!isPlainHotkey(e, "/")) return;
  e.preventDefault();
  const el = document.getElementById("search-input") as HTMLInputElement | null;
  el?.focus();
  el?.select();
}

let unsubscribe: (() => void) | null = null;

onMounted(() => {
  window.addEventListener("keydown", focusOnSlash);
  // Re-sync the input when the URL changes from elsewhere
  // (e.g. clearing the search chip in FilterStrip, browser back/forward).
  unsubscribe = subscribeFilters((f) => {
    if (f.q !== value.value) value.value = f.q;
  });
});

onBeforeUnmount(() => {
  if (timer) clearTimeout(timer);
  window.removeEventListener("keydown", focusOnSlash);
  unsubscribe?.();
});
</script>

<template>
  <input
    id="search-input"
    v-model="value"
    name="q"
    placeholder="…"
    autocomplete="off"
    aria-label="Search notes"
    @input="onInput"
    @keydown="onKeyDown"
  />
</template>
