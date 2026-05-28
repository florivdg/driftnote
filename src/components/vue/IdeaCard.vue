<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  ref,
  useTemplateRef,
  watch,
} from "vue";
import type { IdeaWithTags } from "@/lib/ideas";
import { formatTime } from "@/lib/time";
import { toggleTag } from "@/lib/url";
import { parseIdeaBody } from "@/lib/idea-body";
import { extractTags } from "@/lib/tags";
import { interceptNav, notifyStreamChanged } from "@/lib/url-state";
import { isSaveHotkey } from "@/lib/keyboard";
import {
  anchorBelow,
  attachDismiss,
  createDismissHandlers,
  detachDismiss,
  placePopover,
} from "@/lib/popover";

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

const menuOpen = ref(false);
const editing = ref(false);
const confirmingDelete = ref(false);
const busy = ref(false);
const errorMsg = ref<string | null>(null);
const draft = ref("");

const triggerRef = useTemplateRef<HTMLButtonElement>("triggerRef");
const menuRef = useTemplateRef<HTMLDivElement>("menuRef");
const editRef = useTemplateRef<HTMLTextAreaElement>("editRef");

const draftTags = computed(() => extractTags(draft.value));

const dismiss = createDismissHandlers({
  trigger: () => triggerRef.value,
  surface: () => menuRef.value,
  close: closeMenu,
});

function openMenu() {
  const pos = anchorBelow(triggerRef.value!, 8);
  menuOpen.value = true;
  attachDismiss(dismiss);
  void nextTick().then(() => {
    if (menuRef.value) placePopover(menuRef.value, pos);
  });
}

function closeMenu() {
  menuOpen.value = false;
  confirmingDelete.value = false;
  errorMsg.value = null;
  detachDismiss(dismiss);
}

function toggleMenu() {
  if (menuOpen.value) closeMenu();
  else openMenu();
}

function autosize() {
  const el = editRef.value;
  if (!el) return;
  el.style.height = "auto";
  el.style.height = Math.min(320, el.scrollHeight) + "px";
}

watch(draft, () => autosize());

function startEdit() {
  draft.value = props.idea.body;
  errorMsg.value = null;
  editing.value = true;
  closeMenu();
  void nextTick().then(() => {
    editRef.value?.focus();
    autosize();
  });
}

function cancelEdit() {
  editing.value = false;
  errorMsg.value = null;
}

function errMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

async function sendPatch(text: string): Promise<void> {
  const res = await fetch(`/api/ideas/${props.idea.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(`save failed: ${res.status}`);
}

async function sendDelete(): Promise<void> {
  const res = await fetch(`/api/ideas/${props.idea.id}`, {
    method: "DELETE",
    headers: { "content-type": "application/json" },
  });
  if (!res.ok) throw new Error(`delete failed: ${res.status}`);
}

async function saveEdit() {
  const text = draft.value.trim();
  if (!text || busy.value) return;
  busy.value = true;
  errorMsg.value = null;
  try {
    await sendPatch(text);
    editing.value = false;
    notifyStreamChanged();
  } catch (err) {
    errorMsg.value = errMessage(err, "could not save");
  } finally {
    busy.value = false;
  }
}

function onEditKey(e: KeyboardEvent) {
  if (isSaveHotkey(e)) {
    e.preventDefault();
    void saveEdit();
  } else if (e.key === "Escape") {
    e.preventDefault();
    cancelEdit();
  }
}

function requestDelete() {
  if (!confirmingDelete.value) {
    confirmingDelete.value = true;
    return;
  }
  void performDelete();
}

async function performDelete() {
  if (busy.value) return;
  busy.value = true;
  errorMsg.value = null;
  try {
    await sendDelete();
    closeMenu();
    notifyStreamChanged();
  } catch (err) {
    errorMsg.value = errMessage(err, "could not delete");
  } finally {
    busy.value = false;
  }
}

onBeforeUnmount(() => {
  detachDismiss(dismiss);
});
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
      <div class="entry-menu">
        <button
          ref="triggerRef"
          type="button"
          class="icon-btn entry-menu-trigger"
          aria-label="Note actions"
          :aria-haspopup="true"
          :aria-expanded="menuOpen"
          @click="toggleMenu"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <circle cx="12" cy="5" r="1.6" />
            <circle cx="12" cy="12" r="1.6" />
            <circle cx="12" cy="19" r="1.6" />
          </svg>
        </button>
        <Teleport v-if="menuOpen" to="body">
          <div
            ref="menuRef"
            class="entry-menu-pop"
            role="menu"
            aria-label="Note actions"
          >
            <button
              type="button"
              class="entry-menu-item"
              role="menuitem"
              @click="startEdit"
            >
              <span class="entry-menu-mark"></span>
              <span class="entry-menu-label">edit</span>
            </button>
            <button
              type="button"
              class="entry-menu-item entry-menu-item-del"
              :class="{ confirming: confirmingDelete }"
              role="menuitem"
              :disabled="busy"
              @click="requestDelete"
            >
              <span class="entry-menu-mark"></span>
              <span class="entry-menu-label">{{
                confirmingDelete ? "confirm?" : "delete"
              }}</span>
            </button>
            <p v-if="errorMsg" class="entry-menu-error" role="alert">
              {{ errorMsg }}
            </p>
          </div>
        </Teleport>
      </div>
    </div>

    <div v-if="!editing" class="entry-body">
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
    <div v-else class="entry-edit">
      <textarea
        ref="editRef"
        v-model="draft"
        class="entry-edit-area"
        aria-label="Edit note"
        @keydown="onEditKey"
      ></textarea>
      <div v-if="draftTags.length > 0" class="composer-tags entry-edit-tags">
        <span v-for="t in draftTags" :key="t" class="chip">
          <span class="chip-mark"></span>
          <span>{{ t }}</span>
        </span>
      </div>
      <p v-if="errorMsg" class="entry-menu-error" role="alert">
        {{ errorMsg }}
      </p>
      <div class="entry-edit-bar">
        <span class="hint"><kbd>⌘</kbd><kbd>↵</kbd> save · <kbd>esc</kbd></span>
        <button type="button" class="btn" :disabled="busy" @click="cancelEdit">
          Cancel
        </button>
        <button
          type="button"
          class="btn btn-primary"
          :disabled="busy || !draft.trim()"
          @click="saveEdit"
        >
          Save
        </button>
      </div>
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
