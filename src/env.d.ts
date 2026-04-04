/// <reference types="astro/client" />

import type { RuntimeEnv } from "./lib/server/runtime-env";

declare module "cloudflare:workers" {
  export const env: RuntimeEnv;
}

declare namespace App {
  interface Locals {
    runtime?: {
      env?: RuntimeEnv;
    };
  }
}
