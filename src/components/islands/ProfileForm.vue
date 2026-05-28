<script setup lang="ts">
import { nextTick, ref, useTemplateRef } from "vue";
import { updateDisplayName } from "@/lib/account-actions";
import { errorString } from "@/lib/account-ui";

const props = defineProps<{
  initialName: string | null;
  email: string | null;
}>();

const name = ref(props.initialName ?? "");
const draft = ref(name.value);
const editing = ref(false);
const saving = ref(false);
const message = ref<string | null>(null);
const error = ref<string | null>(null);
const input = useTemplateRef<HTMLInputElement>("input");

async function startEdit() {
  draft.value = name.value;
  editing.value = true;
  message.value = null;
  error.value = null;
  await nextTick();
  input.value?.focus();
}

function cancel() {
  editing.value = false;
  error.value = null;
}

async function save() {
  const next = draft.value.trim();
  if (!next || saving.value) return;
  saving.value = true;
  error.value = null;
  try {
    name.value = await updateDisplayName(next);
    editing.value = false;
    message.value = "name updated.";
  } catch (err) {
    error.value = errorString(err, "could not update name");
  }
  saving.value = false;
}
</script>

<template>
  <div class="account-profile">
    <article class="account-entry">
      <div class="account-entry-top">
        <span class="account-entry-num">№01</span>
        <span class="account-entry-stamp">name</span>
        <button
          v-if="!editing"
          type="button"
          class="account-edit"
          @click="startEdit"
        >
          edit
        </button>
      </div>
      <div v-if="!editing" class="account-entry-body">{{ name || "—" }}</div>
      <div v-else class="account-edit-row">
        <input
          ref="input"
          v-model="draft"
          class="account-input"
          type="text"
          maxlength="200"
          aria-label="Display name"
          @keydown.enter.prevent="save"
          @keydown.esc="cancel"
        />
        <div class="account-edit-actions">
          <button type="button" class="btn" :disabled="saving" @click="cancel">
            cancel
          </button>
          <button
            type="button"
            class="btn btn-primary"
            :disabled="saving || !draft.trim()"
            @click="save"
          >
            {{ saving ? "saving…" : "save" }}
          </button>
        </div>
      </div>
    </article>

    <article class="account-entry">
      <div class="account-entry-top">
        <span class="account-entry-num">№02</span>
        <span class="account-entry-stamp">correspondence</span>
      </div>
      <div class="account-entry-body account-entry-mono">
        {{ email || "—" }}
      </div>
    </article>

    <p v-if="message" class="account-msg" role="status">{{ message }}</p>
    <p v-if="error" class="account-error" role="alert">{{ error }}</p>
  </div>
</template>
