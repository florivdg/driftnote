<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, useTemplateRef } from "vue";
import { navigate } from "astro:transitions/client";
import { HUE_CHOICES } from "@/lib/tags";

const props = defineProps<{
  tag: string;
  count: number;
  hue: number;
  active: boolean;
  href: string;
}>();

const hue = ref(props.hue);
const pickerOpen = ref(false);
const pickerPos = ref({ top: 0, left: 0 });
const saving = ref(false);
const dotRef = useTemplateRef<HTMLButtonElement>("dotRef");
const pickerRef = useTemplateRef<HTMLDivElement>("pickerRef");

function openPicker(e: MouseEvent) {
  e.preventDefault();
  e.stopPropagation();
  const r = dotRef.value!.getBoundingClientRect();
  pickerPos.value = { top: r.top + r.height / 2, left: r.right + 8 };
  pickerOpen.value = true;
  // attach listeners next tick so the opening click doesn't close us
  setTimeout(() => {
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
  }, 0);
  void nextTick().then(() => {
    pickerRef.value?.querySelector<HTMLElement>("button")?.focus();
  });
}

function closePicker() {
  pickerOpen.value = false;
  document.removeEventListener("mousedown", onDoc);
  document.removeEventListener("keydown", onKey);
}

function onDoc(e: MouseEvent) {
  if (pickerRef.value && !pickerRef.value.contains(e.target as Node)) {
    closePicker();
  }
}

function onKey(e: KeyboardEvent) {
  if (e.key === "Escape") {
    closePicker();
    dotRef.value?.focus();
  }
}

async function pickHue(h: number) {
  saving.value = true;
  try {
    const res = await fetch(`/api/tags/${encodeURIComponent(props.tag)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ hue: h }),
    });
    if (!res.ok) throw new Error("failed");
    hue.value = h;
    closePicker();
    // Re-fetch SSR so all cards/stripes update with the new hue.
    await navigate(location.pathname + location.search, {
      history: "replace",
    });
  } catch (err) {
    console.error(err);
    saving.value = false;
  }
}

onBeforeUnmount(() => {
  document.removeEventListener("mousedown", onDoc);
  document.removeEventListener("keydown", onKey);
});
</script>

<template>
  <div :class="['side-item-wrap', active && 'active']">
    <a
      :class="['side-item', 'has-hue', active && 'active']"
      :style="`--hue: ${hue}`"
      :href="href"
      :aria-current="active ? 'page' : undefined"
    >
      <span class="dot" aria-hidden="true"></span>
      <span class="label">{{ tag }}</span>
      <span class="num">{{ count }}</span>
    </a>
    <button
      ref="dotRef"
      type="button"
      class="dot-button-overlay"
      :aria-label="`Change color for #${tag}`"
      title="Change color"
      @click="openPicker"
    ></button>
    <div
      v-if="pickerOpen"
      ref="pickerRef"
      class="color-picker"
      :style="{ top: pickerPos.top + 'px', left: pickerPos.left + 'px' }"
      role="dialog"
      :aria-label="`Color for #${tag}`"
    >
      <div class="color-picker-head">
        <span class="cp-tag">#{{ tag }}</span>
        <span class="cp-hint">pick a color</span>
      </div>
      <div class="color-grid">
        <button
          v-for="(h, index) in HUE_CHOICES"
          :key="h"
          :class="['color-swatch', h === hue && 'active']"
          :style="{
            '--hue': h,
            background: `oklch(var(--tag-mark-L) var(--tag-mark-C) ${h})`,
          }"
          :disabled="saving"
          :aria-label="`Color ${index + 1} of ${HUE_CHOICES.length}`"
          :aria-pressed="h === hue"
          @click="pickHue(h)"
        ></button>
      </div>
    </div>
  </div>
</template>
