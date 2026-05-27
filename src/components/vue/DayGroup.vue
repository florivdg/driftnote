<script setup lang="ts">
defineProps<{
  label: string;
  count: number;
}>();
</script>

<template>
  <section class="day-group">
    <header class="day-header">
      <h2 class="day-title">{{ label }}<span class="day-period">.</span></h2>
      <span class="day-meta">
        <span class="day-count">{{ count }}</span>
        <span>{{ count === 1 ? "entry" : "entries" }}</span>
      </span>
    </header>
    <div class="stream">
      <slot />
    </div>
  </section>
</template>
