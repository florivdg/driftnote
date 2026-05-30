<script setup lang="ts">
import { ref, toRef } from "vue";
import type { IdeaWithTags } from "@/lib/ideas";
import { useIdeaView } from "@/lib/idea-view";

const props = defineProps<{ idea: IdeaWithTags }>();

const { parts, timeLabel, primaryHue } = useIdeaView(toRef(props, "idea"));
const copied = ref(false);
const copyError = ref(false);

async function copyBody() {
  copyError.value = false;
  try {
    await navigator.clipboard.writeText(props.idea.body);
    copied.value = true;
    setTimeout(() => (copied.value = false), 1200);
  } catch {
    copyError.value = true;
  }
}
</script>

<template>
  <article class="entry note-detail" :data-hue="primaryHue">
    <div class="entry-top">
      <span class="entry-stamps">
        <template v-for="(t, i) in idea.tags" :key="t.name">
          <span v-if="i > 0" class="sep"></span>
          <span class="stamp has-hue" :data-hue="t.hue">
            <span class="stamp-sq"></span>
            <span class="stamp-label">{{ t.name }}</span>
          </span>
        </template>
      </span>
    </div>

    <div class="entry-body" data-testid="note-body">
      <template v-for="(p, i) in parts" :key="i">
        <span v-if="p.kind === 'text'">{{ p.value }}</span>
        <span
          v-else
          :class="'htag' + (p.hue !== undefined ? ' has-hue' : '')"
          :data-hue="p.hue"
        >
          {{ p.value }}
        </span>
      </template>
    </div>

    <div class="entry-foot">
      <span v-if="idea.pinned" class="entry-pinned">pinned</span>
      <span v-if="idea.pinned" class="dot-sep"></span>
      <span v-if="idea.archived">archived</span>
      <span v-if="idea.archived" class="dot-sep"></span>
      <span>{{ timeLabel }}</span>
      <span class="dot-sep"></span>
      <span :class="'source ' + (idea.source === 'voice' ? 'voice' : '')">
        {{ idea.source === "voice" ? "voice" : "typed" }}
      </span>
      <span class="dot-sep"></span>
      <button
        type="button"
        class="entry-copy"
        data-testid="note-copy"
        :title="copied ? 'Copied' : 'Copy text'"
        @click="copyBody"
      >
        {{ copied ? "copied" : "copy" }}
      </button>
      <span v-if="copyError" class="entry-menu-error" role="alert">
        could not copy
      </span>
    </div>
  </article>
</template>
