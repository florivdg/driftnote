/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    user: {
      id: string;
      name?: string;
      email?: string;
      image?: string | null;
    } | null;
    session: {
      id: string;
      token: string;
      userId: string;
      expiresAt: Date;
    } | null;
  }
}

interface ImportMetaEnv {
  readonly PUBLIC_BETTER_AUTH_URL: string;
  readonly BETTER_AUTH_SECRET: string;
  readonly BETTER_AUTH_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
