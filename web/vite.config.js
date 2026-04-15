import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
var base = process.env.VITE_BASE_PATH || "/";
export default defineConfig({
    plugins: [react()],
    base: base,
    test: {
        environment: "jsdom",
        setupFiles: "./src/test/setup.ts",
        css: true,
    },
});
