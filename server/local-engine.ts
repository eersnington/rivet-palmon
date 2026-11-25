import { createRequire } from "node:module";
import { join } from "node:path";

/**
 * Starts the local engine with a 1 GiB log shard cap. RivetKit 3.0.7 starts
 * its engine with a fixed 4 GiB cap, and the engine exits at once when the
 * disk has less free space than that. RivetKit then reports only that the
 * registry did not register. A wrapper script lowers the cap.
 */
export const useSmallEngineLogCap = (env: Record<string, string | undefined>) => {
	if (env.RIVET_ENGINE_BINARY_PATH !== undefined) return;
	const engineCli = createRequire(import.meta.resolve("rivetkit"))(
		"@rivetkit/engine-cli",
	);
	env.LOCAL_ENGINE_BINARY = engineCli.getEnginePath();
	env.LOCAL_ENGINE_LOG_MAX_DISK_BYTES ??= String(1024 ** 3);
	env.RIVET_ENGINE_BINARY_PATH = join(import.meta.dirname, "rivet-engine.sh");
};
