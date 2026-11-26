import { BrowserHost } from "@effect/ui/html";
import { Effect, Layer } from "effect";
import { Palmon, props } from "./main.ts";

/**
 * The devtools overlay, on a local page or with `?devtools` in the URL. It
 * loads in its own chunk, so other visitors never download it.
 */
const devToolsLayer = Layer.unwrap(
	Effect.gen(function* () {
		const isLocal = yield* Effect.sync(() => ["localhost", "127.0.0.1"].includes(location.hostname));
		const isAsked = yield* Effect.sync(() => new URLSearchParams(location.search).has("devtools"));
		if (!isLocal && !isAsked) return Layer.empty;
		const { DevTools } = yield* Effect.promise(() => import("@effect/ui-devtools"));
		// The clock ticks four times a second, which would flood the timeline.
		return DevTools.layer({ position: "BottomRight", exclude: ["TickedClock"] });
	}),
);

const Main = BrowserHost.mount(Palmon, props, document.getElementById("root")!).pipe(Layer.provide(devToolsLayer));

Layer.launch(Main).pipe(Effect.runFork);
