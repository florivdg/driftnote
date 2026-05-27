<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  tag: string;
  hue?: number | null;
  dashed?: boolean;
  removeHref?: string;
}>();

defineEmits<{ remove: [event: MouseEvent] }>();

const cls = computed(() =>
  [
    "chip",
    props.dashed ? "btn-chip" : "",
    typeof props.hue === "number" ? "has-hue" : "",
  ]
    .filter(Boolean)
    .join(" "),
);
</script>

<template>
  <span :class="cls" :data-hue="hue">
    <span class="chip-mark"></span>
    <span>{{ tag }}</span>
    <a
      v-if="removeHref"
      class="x"
      :href="removeHref"
      :aria-label="`remove ${tag}`"
      @click="$emit('remove', $event)"
    >
      ×
    </a>
  </span>
</template>
