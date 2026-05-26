<script setup lang="ts">
import { ref } from "vue";
import { addPasskeyToAccount, signOutAndRedirect } from "@/lib/account-actions";

const adding = ref(false);
const signingOut = ref(false);
const message = ref<string | null>(null);
const error = ref<string | null>(null);

function errorString(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

async function handleAddPasskey() {
  if (adding.value) return;
  adding.value = true;
  message.value = null;
  error.value = null;
  try {
    await addPasskeyToAccount("DriftNote on this device");
    message.value = "passkey added on this device.";
  } catch (err) {
    error.value = errorString(err, "could not add passkey");
  }
  adding.value = false;
}

async function handleSignOut() {
  if (signingOut.value) return;
  signingOut.value = true;
  error.value = null;
  try {
    await signOutAndRedirect();
  } catch (err) {
    error.value = errorString(err, "sign-out failed");
  }
  signingOut.value = false;
}
</script>

<template>
  <div class="account-actions">
    <button
      type="button"
      class="account-item account-item-add"
      :class="{ active: adding }"
      :disabled="adding || signingOut"
      @click="handleAddPasskey"
    >
      <span class="account-mark" />
      <span class="account-label">
        {{ adding ? "waiting for passkey…" : "add another device" }}
      </span>
      <span class="account-meta">{{ adding ? "··· " : "passkey" }}</span>
    </button>
    <button
      type="button"
      class="account-item account-item-out"
      :class="{ active: signingOut }"
      :disabled="signingOut || adding"
      @click="handleSignOut"
    >
      <span class="account-mark" />
      <span class="account-label">
        {{ signingOut ? "stepping out…" : "step out of this stream" }}
      </span>
      <span class="account-meta">sign out</span>
    </button>
    <p v-if="message" class="account-msg">{{ message }}</p>
    <p v-if="error" class="account-error">{{ error }}</p>
  </div>
</template>
