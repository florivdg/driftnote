<script setup lang="ts">
import { onBeforeUnmount, ref, useTemplateRef } from "vue";
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
const dotRef = useTemplateRef<HTMLSpanElement>("dotRef");
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
  if (e.key === "Escape") closePicker();
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
    // Reload so all SSR'd cards/stripes update consistently.
    location.reload();
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
    >
      <span
        ref="dotRef"
        class="dot dot-button"
        role="button"
        :aria-label="`Change color for #${tag}`"
        title="Change color"
        @click="openPicker"
      ></span>
      <span class="label">{{ tag }}</span>
      <span class="num">{{ count }}</span>
    </a>
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
          v-for="h in HUE_CHOICES"
          :key="h"
          :class="['color-swatch', h === hue && 'active']"
          :style="{
            '--hue': h,
            background: `oklch(var(--tag-mark-L) var(--tag-mark-C) ${h})`,
          }"
          :disabled="saving"
          :aria-label="`Hue ${h}`"
          @click="pickHue(h)"
        ></button>
      </div>
    </div>
  </div>
</template>
