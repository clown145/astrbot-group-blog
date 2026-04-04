/// <reference types="astro/client" />

import type { RuntimeEnv } from "./lib/server/runtime-env";

declare namespace App {
  interface Locals {
    runtime?: {
      env?: RuntimeEnv;
    };
  }
}
