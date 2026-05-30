<script setup lang="ts">
import { computed, ref, useTemplateRef, watch } from "vue";
import { extractTags } from "@/lib/tags";
import { isSaveHotkey } from "@/lib/keyboard";
import { notifyStreamChanged } from "@/lib/url-state";

const props = defineProps<{
  suggested: string[];
}>();

const text = ref("");
const submitting = ref(false);
const ta = useTemplateRef<HTMLTextAreaElement>("ta");

const tags = computed(() => extractTags(text.value));

watch(text, () => {
  const el = ta.value;
  if (!el) return;
  el.style.height = "auto";
  el.style.height = Math.min(240, el.scrollHeight) + "px";
});

async function postIdea(body: string): Promise<void> {
  const res = await fetch("/api/ideas", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: body, source: "text" }),
  });
  if (!res.ok) throw new Error(`POST /api/ideas failed: ${res.status}`);
}

async function submit() {
  const body = text.value.trim();
  if (!body || submitting.value) return;
  submitting.value = true;
  try {
    await postIdea(body);
    text.value = "";
    notifyStreamChanged();
  } catch (err) {
    console.error(err);
  } finally {
    submitting.value = false;
  }
}

function onKeyDown(e: KeyboardEvent) {
  if (isSaveHotkey(e)) {
    e.preventDefault();
    submit();
  }
}

function addSuggestion(t: string) {
  if (tags.value.includes(t)) return;
  text.value = (text.value.trimEnd() + " #" + t + " ").replace(/^ +/, "");
  ta.value?.focus();
}
</script>

<template>
  <div class="composer">
    <div class="composer-body">
      <textarea
        ref="ta"
        v-model="text"
        :rows="2"
        placeholder="What's coming up?"
        aria-label="New idea"
        @keydown="onKeyDown"
      ></textarea>
    </div>

    <div v-if="tags.length > 0" class="composer-tags">
      <span v-for="t in tags" :key="t" class="chip">
        <span class="chip-mark"></span>
        <span>{{ t }}</span>
      </span>
    </div>

    <div
      v-if="tags.length === 0 && suggested.length > 0 && text.length > 0"
      class="composer-tags"
    >
      <span class="composer-add-label">Add →</span>
      <button
        v-for="t in suggested.slice(0, 4)"
        :key="t"
        type="button"
        class="chip btn-chip"
        @click="addSuggestion(t)"
      >
        <span class="chip-mark"></span>
        <span>{{ t }}</span>
      </button>
    </div>

    <div class="composer-bar">
      <span class="hint">
        <kbd>#</kbd> to tag · <kbd>⌘</kbd><kbd>↵</kbd> to save
      </span>
      <button
        class="btn btn-primary"
        type="button"
        :disabled="!text.trim() || submitting"
        @click="submit"
      >
        Save
      </button>
    </div>
  </div>
</template>
