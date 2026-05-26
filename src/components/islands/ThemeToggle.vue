<script setup lang="ts">
import { onMounted, ref } from "vue";

const theme = ref<"dark" | "light">("dark");

onMounted(() => {
  const stored = localStorage.getItem("driftnote_theme");
  if (stored === "light" || stored === "dark") theme.value = stored;
  document.body.dataset.theme = theme.value;
});

function toggle() {
  theme.value = theme.value === "dark" ? "light" : "dark";
  document.body.dataset.theme = theme.value;
  localStorage.setItem("driftnote_theme", theme.value);
}
</script>

<template>
  <button
    class="theme-toggle"
    @click="toggle"
    :title="`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`"
    :aria-label="`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`"
    :aria-pressed="theme === 'dark'"
    type="button"
  >
    <span class="knob">
      <svg
        v-if="theme === 'dark'"
        width="10"
        height="10"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
      </svg>
      <svg
        v-else
        width="10"
        height="10"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="4" />
        <path
          d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"
        />
      </svg>
    </span>
  </button>
</template>
