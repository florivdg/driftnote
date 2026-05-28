<script setup lang="ts">
import { computed, ref } from "vue";
import type { SessionSummary } from "@/lib/account";
import { revokeSession, revokeOtherSessions } from "@/lib/account-actions";
import { errorString, formatStamp } from "@/lib/account-ui";

const props = defineProps<{
  initial: SessionSummary[];
  currentId: string | null;
}>();

const list = ref<SessionSummary[]>([...props.initial]);
const busyId = ref<string | null>(null);
const revokingOthers = ref(false);
const message = ref<string | null>(null);
const error = ref<string | null>(null);

const hasOthers = computed(() =>
  list.value.some((s) => s.id !== props.currentId),
);

const BROWSERS: [string, string][] = [
  ["Firefox", "Firefox"],
  ["Edg", "Edge"],
  ["Chrome", "Chrome"],
  ["Safari", "Safari"],
];
const PLATFORMS: [string, string][] = [
  ["iPhone", "iOS"],
  ["iPad", "iPadOS"],
  ["Android", "Android"],
  ["Macintosh", "macOS"],
  ["Windows", "Windows"],
  ["Linux", "Linux"],
];

function pick(pairs: [string, string][], ua: string): string | null {
  for (const [needle, label] of pairs) {
    if (ua.includes(needle)) return label;
  }
  return null;
}

function uaLabel(ua: string | null): string {
  if (!ua) return "Unknown client";
  const parts = [pick(BROWSERS, ua), pick(PLATFORMS, ua)].filter(
    (x): x is string => x !== null,
  );
  return parts.length > 0 ? parts.join(" on ") : "Unknown client";
}

async function handleRevoke(id: string) {
  if (busyId.value) return;
  busyId.value = id;
  message.value = null;
  error.value = null;
  try {
    await revokeSession(id);
    list.value = list.value.filter((s) => s.id !== id);
    message.value = "session revoked.";
  } catch (err) {
    error.value = errorString(err, "could not revoke session");
  }
  busyId.value = null;
}

async function handleRevokeOthers() {
  if (revokingOthers.value || !hasOthers.value) return;
  revokingOthers.value = true;
  message.value = null;
  error.value = null;
  try {
    await revokeOtherSessions();
    list.value = list.value.filter((s) => s.id === props.currentId);
    message.value = "signed out everywhere else.";
  } catch (err) {
    error.value = errorString(err, "could not revoke other sessions");
  }
  revokingOthers.value = false;
}
</script>

<template>
  <div class="account-actions">
    <p v-if="list.length === 0" class="account-empty">No active sessions.</p>

    <div v-for="s in list" :key="s.id" class="account-device">
      <span
        class="account-mark"
        :class="
          s.id === currentId ? 'account-mark-live' : 'account-mark-static'
        "
      />
      <div class="account-device-info">
        <span class="account-device-name">{{ uaLabel(s.userAgent) }}</span>
        <span class="account-device-meta">
          {{ s.ipAddress || "unknown ip" }} · since
          {{ formatStamp(s.createdAt) }}
        </span>
      </div>
      <span v-if="s.id === currentId" class="account-badge">this device</span>
      <button
        v-else
        type="button"
        class="account-remove"
        :disabled="busyId === s.id"
        @click="handleRevoke(s.id)"
      >
        {{ busyId === s.id ? "revoking…" : "revoke" }}
      </button>
    </div>

    <button
      v-if="hasOthers"
      type="button"
      class="account-item account-item-out"
      :class="{ active: revokingOthers }"
      :disabled="revokingOthers"
      @click="handleRevokeOthers"
    >
      <span class="account-mark" />
      <span class="account-label">
        {{ revokingOthers ? "signing out…" : "sign out everywhere else" }}
      </span>
      <span class="account-meta">revoke all</span>
    </button>

    <p v-if="message" class="account-msg" role="status">{{ message }}</p>
    <p v-if="error" class="account-error" role="alert">{{ error }}</p>
  </div>
</template>
