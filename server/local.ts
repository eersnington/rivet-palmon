/**
 * Runs everything on this machine: a local engine and the game server. The
 * engine port stays off RivetKit's default so this game can run beside others.
 */
import { join } from "node:path";
import { useSmallEngineLogCap } from "./local-engine.ts";

const env = process.env;
env.RIVET_RUN_ENGINE ??= "1";
// The engine also binds this port + 1 and + 10, so leave a gap to other apps.
env.RIVET_RUN_ENGINE_PORT ??= "6490";
env.RIVETKIT_STORAGE_PATH ??= join(import.meta.dirname, "../.data");
useSmallEngineLogCap(env);

await import("./main.ts");
