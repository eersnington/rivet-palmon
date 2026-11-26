import { DevToolsVite } from "@effect/ui-devtools/node";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

/** The running game server, which `vite dev` forwards the page's own requests to. */
const gameServer = process.env.PALMON_SERVER ?? "http://localhost:8133";

export default defineConfig({
	root: import.meta.dirname,
	// The devtools plugin runs only under `vite dev`, where it serves the MCP server for agents.
	// Each demo takes its own devtools port, so they can run side by side.
	plugins: [tailwindcss(), DevToolsVite.plugin({ dispatch: true, port: 4783 })],
	optimizeDeps: {
		entries: ["src/entry.ts"],
	},
	server: {
		port: 8183,
		strictPort: true,
		proxy: {
			"/config.json": gameServer,
			"/token": gameServer,
			"/health": gameServer,
		},
	},
});
