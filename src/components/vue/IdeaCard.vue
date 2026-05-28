<script setup lang="ts">
import { computed } from "vue";
import type { IdeaWithTags } from "@/lib/ideas";
import { formatTime } from "@/lib/time";
import { toggleTag } from "@/lib/url";
import { parseIdeaBody } from "@/lib/idea-body";
import { interceptNav } from "@/lib/url-state";

const props = defineProps<{
  idea: IdeaWithTags;
  index: number;
  url: string;
}>();

const baseURL = computed(() => new URL(props.url, "http://x"));
const num = computed(() => String(props.index + 1).padStart(3, "0"));
const primaryHue = computed(() => props.idea.tags[0]?.hue);
const parts = computed(() => parseIdeaBody(props.idea.body, props.idea.tags));
const timeLabel = computed(() => formatTime(props.idea.createdAt));
const stamps = computed(() =>
  props.idea.tags.map((t) => ({
    name: t.name,
    hue: t.hue,
    href: toggleTag(baseURL.value, t.name),
  })),
);
</script>

<template>
  <article class="entry" :data-hue="primaryHue">
    <div class="entry-top">
      <span class="entry-num">№{{ num }}</span>
      <span class="entry-stamps">
        <template v-for="(s, i) in stamps" :key="s.name">
          <span v-if="i > 0" class="sep"></span>
          <a
            class="stamp has-hue"
            :data-hue="s.hue"
            :href="s.href"
            :title="`Filter by #${s.name}`"
            @click="interceptNav($event, s.href)"
          >
            <span class="stamp-sq"></span>
            <span class="stamp-label">{{ s.name }}</span>
          </a>
        </template>
      </span>
    </div>
    <div class="entry-body">
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
      <span>{{ timeLabel }}</span>
      <span class="dot-sep"></span>
      <span :class="'source ' + (idea.source === 'voice' ? 'voice' : '')">
        {{ idea.source === "voice" ? "voice" : "typed" }}
      </span>
    </div>
  </article>
</template>
