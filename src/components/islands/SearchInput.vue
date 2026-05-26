<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { navigate } from "astro:transitions/client";
import { isPlainHotkey } from "@/lib/dom";
import { setQuery } from "@/lib/url";

// Debounced search island. Owns the masthead search input.
//
// On input change, debounce 250ms, then hand off to Astro's view-transition
// router via navigate(). The island is mounted with `transition:persist` in
// Masthead.astro, so the DOM element and this Vue instance survive the swap —
// focus and caret stay where the user left them while typing.

const props = defineProps<{
  initial: string;
}>();

const value = ref(props.initial);
let timer: ReturnType<typeof setTimeout> | null = null;

function commit() {
  const next = setQuery(new URL(location.href), value.value.trim());
  if (next === `${location.pathname}${location.search}`) return;
  navigate(next, { history: "push" });
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
