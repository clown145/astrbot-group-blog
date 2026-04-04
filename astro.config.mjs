// @ts-check
import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  output: "server",
  adapter: cloudflare({
    inspectorPort: false,
  }),
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
  },
});
