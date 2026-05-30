<script setup lang="ts">
defineProps<{
  message: string;
  busy: boolean;
}>();

const emit = defineEmits<{
  undo: [];
  dismiss: [];
}>();
</script>

<template>
  <Teleport to="body">
    <div class="undo-toast" role="status" aria-live="polite">
      <span class="undo-toast-msg">{{ message }}</span>
      <button
        type="button"
        class="undo-toast-btn"
        :disabled="busy"
        @click="emit('undo')"
      >
        {{ busy ? "restoring…" : "undo" }}
      </button>
      <button
        type="button"
        class="undo-toast-close"
        aria-label="Dismiss"
        @click="emit('dismiss')"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          aria-hidden="true"
        >
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  </Teleport>
</template>
