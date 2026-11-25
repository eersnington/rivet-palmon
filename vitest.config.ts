import { join } from "node:path";
import { defineConfig } from "vitest/config";
import { useSmallEngineLogCap } from "./server/local-engine.ts";

// The test starts its own local engine on its own port and data, apart from a running `pnpm dev`.
const env: Record<string, string> = {
	RIVET_RUN_ENGINE_PORT: "6530",
	RIVETKIT_STORAGE_PATH: join(import.meta.dirname, ".data-test"),
	RIVET_LOG_LEVEL: "warn",
};
useSmallEngineLogCap(env);

export default defineConfig({
	test: {
		include: ["test/**/*.test.ts"],
		testTimeout: 120_000,
		hookTimeout: 120_000,
		env,
	},
});
