<script setup lang="ts">
import { computed, ref } from "vue";
import { authClient, unwrapAuthResult } from "@/lib/auth-client";

const mode = ref<"signin" | "signup">("signin");
const name = ref("");
const email = ref("");
const authing = ref(false);
const error = ref<string | null>(null);

const buttonDisabled = computed(() => {
  if (authing.value) return true;
  if (mode.value === "signup") return !name.value.trim() || !email.value.trim();
  return false;
});

function hasControlChar(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    if (s.charCodeAt(i) < 32) return true;
  }
  return false;
}

function isSafeRelative(raw: string): boolean {
  if (!raw.startsWith("/")) return false;
  if (raw.startsWith("//") || raw.startsWith("/\\")) return false;
  return !hasControlChar(raw);
}

function safeNext(raw: string | null): string {
  return raw && isSafeRelative(raw) ? raw : "/";
}

function redirect() {
  const next = safeNext(new URL(location.href).searchParams.get("next"));
  location.assign(next);
}

async function performSignIn() {
  const res = await authClient.signIn.passkey();
  unwrapAuthResult(res, "sign-in failed");
}

async function performSignUp() {
  const register = await authClient.passkey.addPasskey({
    name: "DriftNote on this device",
    // resolveUser on the server JSON-parses this string; see lib/auth.ts.
    context: JSON.stringify({
      name: name.value.trim(),
      email: email.value.trim(),
    }),
  });
  unwrapAuthResult(register, "sign-up failed");
  // The passkey plugin's verify-registration does NOT set a session cookie.
  // Sign in with the freshly created credential to actually log in.
  const signIn = await authClient.signIn.passkey();
  unwrapAuthResult(signIn, "sign-in after sign-up failed");
}

const ACTIONS: Record<"signin" | "signup", () => Promise<void>> = {
  signin: performSignIn,
  signup: performSignUp,
};

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "authentication failed";
}

function handleAuthError(err: unknown) {
  console.error(err);
  const msg = errorMessage(err);
  // Server refuses passkey signup when the email already has an account.
  // Flip to sign-in so the user's existing passkey unlocks the account.
  if (mode.value === "signup" && msg.includes("already exists")) {
    mode.value = "signin";
  }
  error.value = msg;
  authing.value = false;
}

async function trigger() {
  if (buttonDisabled.value) return;
  authing.value = true;
  error.value = null;
  try {
    await ACTIONS[mode.value]();
    redirect();
  } catch (err) {
    handleAuthError(err);
  }
}
</script>

<template>
  <form class="login-card" @submit.prevent="trigger">
    <div class="login-tabs">
      <button
        type="button"
        :class="['login-tab', mode === 'signin' && 'active']"
        @click="mode = 'signin'"
      >
        Sign in
      </button>
      <button
        type="button"
        :class="['login-tab', mode === 'signup' && 'active']"
        @click="mode = 'signup'"
      >
        Create account
      </button>
    </div>

    <template v-if="mode === 'signin'">
      <h2>Welcome back.</h2>
      <p class="sub">Sign in to your stream</p>
    </template>
    <template v-else>
      <h2>Start a stream.</h2>
      <p class="sub">Create your account</p>
    </template>

    <template v-if="mode === 'signup'">
      <div class="login-field">
        <label for="login-name">Name</label>
        <input
          id="login-name"
          v-model="name"
          type="text"
          placeholder="Aria K."
          autocomplete="name"
        />
      </div>
      <div class="login-field">
        <label for="login-email">Email</label>
        <input
          id="login-email"
          v-model="email"
          type="email"
          placeholder="you@somewhere.com"
          autocomplete="email"
        />
      </div>
    </template>

    <button
      type="button"
      :class="['btn', 'btn-passkey', authing && 'authing']"
      :disabled="buttonDisabled"
      :aria-busy="authing"
      @click="trigger"
    >
      <template v-if="authing">
        <span class="passkey-spinner"></span>
        Waiting for passkey…
      </template>
      <template v-else>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M12 11c0 5 .5 7 2 9" />
          <path d="M5 16c0-3 1-5 2-6" />
          <path d="M3.4 14c-.3-1-.4-2-.4-3a9 9 0 0 1 14.5-7.1" />
          <path d="M19 7c1.3 1.5 2 3.4 2 5.5v1" />
          <path d="M8.5 19.5c-.6-.9-1-2-1.3-3" />
          <path d="M16 16c0 2 .5 4 1 5" />
          <path d="M8 8a4 4 0 0 1 7 2.7c0 2 .2 4 .6 5.3" />
        </svg>
        {{ mode === "signin" ? "Sign in with passkey" : "Create with passkey" }}
      </template>
    </button>

    <p v-if="error" class="sub login-error" role="alert">
      {{ error }}
    </p>
  </form>
</template>
