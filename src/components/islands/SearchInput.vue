<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { isPlainHotkey } from "@/lib/dom";

// Debounced search island. Owns the masthead search input.
//
// V1 strategy: on input change, debounce 250ms, then navigate to the new URL
// (history.pushState + location.replace). The SSR page re-renders the stream.
// V2 (deferred): fetch /api/ideas and patch the stream container in place —
// requires duplicating IdeaCard markup in Vue, not worth it for v1.

const props = defineProps<{
  initial: string;
}>();

const value = ref(props.initial);
let timer: ReturnType<typeof setTimeout> | null = null;

function commit() {
  const url = new URL(location.href);
  const trimmed = value.value.trim();
  if (trimmed) url.searchParams.set("q", trimmed);
  else url.searchParams.delete("q");
  if (url.toString() === location.href) return;
  location.assign(url.toString());
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

onMounted(() => {
  window.addEventListener("keydown", focusOnSlash);
});

onBeforeUnmount(() => {
  if (timer) clearTimeout(timer);
  window.removeEventListener("keydown", focusOnSlash);
});
</script>

<template>
  <input
    id="search-input"
    v-model="value"
    name="q"
    placeholder="…"
    autocomplete="off"
    @input="onInput"
    @keydown="onKeyDown"
  />
</template>
