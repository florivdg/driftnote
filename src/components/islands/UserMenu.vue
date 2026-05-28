<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useTemplateRef } from "vue";
import { signOutAndRedirect } from "@/lib/account-actions";
import { MONTHS_SHORT, WEEKDAYS_SHORT } from "@/lib/time";

const props = defineProps<{
  name?: string;
  email?: string;
  initials: string;
}>();

const open = ref(false);
const signingOut = ref(false);
const error = ref<string | null>(null);
const triggerRef = useTemplateRef<HTMLButtonElement>("triggerRef");
const menuRef = useTemplateRef<HTMLDivElement>("menuRef");

const now = new Date();
const sessionDate = `${WEEKDAYS_SHORT[now.getDay()]} · ${MONTHS_SHORT[now.getMonth()]} ${now.getDate()}`;

const displayName = computed(() => props.name?.trim() || props.email || "you");

function openMenu() {
  const r = triggerRef.value!.getBoundingClientRect();
  const top = r.bottom + 10;
  const right = Math.max(12, window.innerWidth - r.right);
  open.value = true;
  setTimeout(() => {
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
  }, 0);
  void nextTick().then(() => {
    const menu = menuRef.value;
    if (menu) {
      menu.style.setProperty("--popover-top", `${top}px`);
      menu.style.setProperty("--popover-right", `${right}px`);
      menu.querySelector<HTMLElement>("a, button")?.focus();
    }
  });
}

function closeMenu() {
  open.value = false;
  document.removeEventListener("mousedown", onDoc);
  document.removeEventListener("keydown", onKey);
}

function toggleMenu() {
  if (open.value) closeMenu();
  else openMenu();
}

function onDoc(e: MouseEvent) {
  if (menuRef.value && !menuRef.value.contains(e.target as Node)) {
    closeMenu();
  }
}

function onKey(e: KeyboardEvent) {
  if (e.key === "Escape") {
    closeMenu();
    triggerRef.value?.focus();
  }
}

async function handleSignOut() {
  if (signingOut.value) return;
  signingOut.value = true;
  error.value = null;
  try {
    await signOutAndRedirect();
  } catch (err) {
    error.value = err instanceof Error ? err.message : "sign-out failed";
    signingOut.value = false;
  }
}

onBeforeUnmount(() => {
  document.removeEventListener("mousedown", onDoc);
  document.removeEventListener("keydown", onKey);
});
</script>

<template>
  <div class="user-menu-wrap">
    <button
      ref="triggerRef"
      type="button"
      class="avatar user-menu-trigger"
      :title="name ?? email ?? 'Account'"
      :aria-label="`Account menu for ${displayName}`"
      :aria-haspopup="true"
      :aria-expanded="open"
      @click="toggleMenu"
    >
      {{ initials }}
    </button>
    <div v-if="open" ref="menuRef" class="user-menu" aria-label="Account menu">
      <div class="user-menu-line">
        <span>session</span>
        <span class="sep">·</span>
        <span>{{ sessionDate }}</span>
      </div>
      <div class="user-menu-head">
        <span class="user-menu-name">{{ displayName }}</span>
        <span v-if="email && name" class="user-menu-email">{{ email }}</span>
      </div>
      <div class="user-menu-rule" />
      <a class="user-menu-item" href="/account">
        <span class="user-menu-mark" />
        <span class="user-menu-label">account</span>
      </a>
      <button
        type="button"
        class="user-menu-item user-menu-item-out"
        :disabled="signingOut"
        @click="handleSignOut"
      >
        <span class="user-menu-mark" />
        <span class="user-menu-label">{{
          signingOut ? "signing out…" : "sign out"
        }}</span>
      </button>
      <p v-if="error" class="user-menu-error" role="alert">{{ error }}</p>
    </div>
  </div>
</template>
