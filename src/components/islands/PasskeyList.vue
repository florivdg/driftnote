<script setup lang="ts">
import { computed, ref } from "vue";
import type { PasskeySummary } from "@/lib/account";
import { addPasskeyToAccount, removePasskey } from "@/lib/account-actions";
import { errorString, formatStamp } from "@/lib/account-ui";

const props = defineProps<{
  initial: PasskeySummary[];
}>();

const list = ref<PasskeySummary[]>([...props.initial]);
const adding = ref(false);
const busyId = ref<string | null>(null);
const message = ref<string | null>(null);
const error = ref<string | null>(null);

const canRemove = computed(() => list.value.length > 1);

function deviceLabel(pk: PasskeySummary): string {
  return pk.deviceType === "multiDevice"
    ? "synced passkey"
    : "device-bound passkey";
}

async function handleAdd() {
  if (adding.value) return;
  adding.value = true;
  message.value = null;
  error.value = null;
  try {
    await addPasskeyToAccount("DriftNote on this device");
    // The new credential's metadata comes from the server; reload so the
    // SSR-rendered list picks it up rather than guessing its shape here.
    location.reload();
  } catch (err) {
    error.value = errorString(err, "could not add passkey");
    adding.value = false;
  }
}

async function handleRemove(id: string) {
  if (busyId.value || !canRemove.value) return;
  busyId.value = id;
  message.value = null;
  error.value = null;
  try {
    await removePasskey(id);
    list.value = list.value.filter((pk) => pk.id !== id);
    message.value = "device removed.";
  } catch (err) {
    error.value = errorString(err, "could not remove passkey");
  }
  busyId.value = null;
}
</script>

<template>
  <div class="account-actions">
    <p v-if="list.length === 0" class="account-empty">
      No passkeys registered yet.
    </p>

    <div v-for="pk in list" :key="pk.id" class="account-device">
      <span class="account-mark account-mark-static" />
      <div class="account-device-info">
        <span class="account-device-name">{{
          pk.name || "Unnamed device"
        }}</span>
        <span class="account-device-meta">
          {{ deviceLabel(pk) }} · added {{ formatStamp(pk.createdAt) }}
        </span>
      </div>
      <button
        type="button"
        class="account-remove"
        :disabled="!canRemove || busyId === pk.id"
        :title="
          canRemove
            ? 'Remove this device'
            : 'You can’t remove your only passkey'
        "
        @click="handleRemove(pk.id)"
      >
        {{ busyId === pk.id ? "removing…" : "remove" }}
      </button>
    </div>

    <button
      type="button"
      class="account-item account-item-add"
      :class="{ active: adding }"
      :disabled="adding"
      @click="handleAdd"
    >
      <span class="account-mark" />
      <span class="account-label">
        {{ adding ? "waiting for passkey…" : "add another device" }}
      </span>
      <span class="account-meta">{{ adding ? "···" : "passkey" }}</span>
    </button>

    <p v-if="list.length === 1" class="account-note">
      This is your only passkey — add another device before removing it.
    </p>
    <p v-if="message" class="account-msg" role="status">{{ message }}</p>
    <p v-if="error" class="account-error" role="alert">{{ error }}</p>
  </div>
</template>
