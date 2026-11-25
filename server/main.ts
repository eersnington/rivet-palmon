import { NodeRuntime } from "@effect/platform-node";
import { Registry } from "@rivetkit/effect";
import { Layer } from "effect";
import { ActorsLive } from "./actors.ts";
import { AppServerLive, MetricsServerLive } from "./http.ts";

/**
 * A node that runs on its own. A cluster sets RIVET_ENDPOINT, RIVET_TOKEN,
 * RIVET_NAMESPACE, RIVET_POOL and the node version. `pnpm start:local` sets
 * RIVET_RUN_ENGINE=1 instead, so RivetKit starts a local engine.
 */
const RegistryLive = Registry.layer({ startServices: false, runtime: "native" });

const MainLive = Layer.mergeAll(
	Registry.serve(ActorsLive),
	AppServerLive,
	MetricsServerLive,
).pipe(Layer.provide(RegistryLive));

Layer.launch(MainLive).pipe(NodeRuntime.runMain);
