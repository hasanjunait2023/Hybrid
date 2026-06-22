import type { Config } from "tailwindcss";
import hybridPreset from "@hybrid/config/tailwind";

export default {
  presets: [hybridPreset],
  content: [
    "./app/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
    "../../packages/ui/src/**/*.{ts,tsx}",
  ],
} satisfies Config;
