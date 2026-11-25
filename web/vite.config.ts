import { foldkit } from "@foldkit/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
	root: import.meta.dirname,
	plugins: [tailwindcss(), foldkit()],
	optimizeDeps: {
		entries: ["src/entry.ts"],
	},
});
