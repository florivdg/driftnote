<script setup lang="ts">
import { computed, ref } from "vue";
import { deleteAccount, signOutAndRedirect } from "@/lib/account-actions";
import { errorString } from "@/lib/account-ui";

const signingOut = ref(false);
const deleting = ref(false);
const confirming = ref(false);
const confirmText = ref("");
const error = ref<string | null>(null);

const canDelete = computed(
  () => confirmText.value.trim().toLowerCase() === "delete",
);

async function handleSignOut() {
  if (signingOut.value || deleting.value) return;
  signingOut.value = true;
  error.value = null;
  try {
    await signOutAndRedirect();
  } catch (err) {
    error.value = errorString(err, "sign-out failed");
    signingOut.value = false;
  }
}

function cancelDelete() {
  confirming.value = false;
  confirmText.value = "";
  error.value = null;
}

async function handleDelete() {
  if (deleting.value || !canDelete.value) return;
  deleting.value = true;
  error.value = null;
  try {
    await deleteAccount();
  } catch (err) {
    error.value = errorString(err, "could not delete account");
    deleting.value = false;
  }
}
</script>

<template>
  <div class="account-actions">
    <button
      type="button"
      class="account-item account-item-out"
      :class="{ active: signingOut }"
      :disabled="signingOut || deleting"
      @click="handleSignOut"
    >
      <span class="account-mark" />
      <span class="account-label">
        {{ signingOut ? "stepping out…" : "step out of this stream" }}
      </span>
      <span class="account-meta">sign out</span>
    </button>

    <div class="account-danger">
      <div class="account-danger-text">
        <span class="account-danger-title">delete account</span>
        <span class="account-danger-sub">
          erases every idea, tag, device, and session. cannot be undone.
        </span>
      </div>
      <button
        v-if="!confirming"
        type="button"
        class="btn account-danger-btn"
        :disabled="deleting"
        @click="confirming = true"
      >
        delete…
      </button>
      <div v-else class="account-danger-confirm-row">
        <input
          v-model="confirmText"
          class="account-input account-danger-input"
          type="text"
          placeholder="type “delete”"
          aria-label="Type delete to confirm"
        />
        <button
          type="button"
          class="btn"
          :disabled="deleting"
          @click="cancelDelete"
        >
          cancel
        </button>
        <button
          type="button"
          class="btn account-danger-go"
          :disabled="deleting || !canDelete"
          @click="handleDelete"
        >
          {{ deleting ? "deleting…" : "delete forever" }}
        </button>
      </div>
    </div>

    <p v-if="error" class="account-error" role="alert">{{ error }}</p>
  </div>
</template>
