// Compute the SHA-256 (base64) of the FOUC-killer inline script in
// src/layouts/Layout.astro. Paste the printed value into
// `security.csp.scriptDirective.hashes` in astro.config.mjs whenever the
// script body changes.

import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const LAYOUT = "src/layouts/Layout.astro";

const src = readFileSync(LAYOUT, "utf8");
const match = src.match(/<script is:inline[^>]*>([\s\S]*?)<\/script>/);
if (!match) {
  console.error(`No <script is:inline> found in ${LAYOUT}`);
  process.exit(1);
}

const body = match[1];
const hash = createHash("sha256").update(body).digest("base64");
console.log(`sha256-${hash}`);
