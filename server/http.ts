//! The node's HTTP servers: the game on `PORT` and metrics on a private port.
import { createServer } from "node:http";
import { join } from "node:path";
import { NodeHttpServer } from "@effect/platform-node";
import { Registry } from "@rivetkit/effect";
import { Config, Layer } from "effect";
import { HttpRouter, HttpStaticServer } from "effect/http";
import { BrowserAccessRoutes } from "./browser-access.ts";

const webRoot = join(import.meta.dirname, "../web/dist");

/** Serves the game, `/config.json`, `/token` and `/health` on `PORT`. */
export const AppServerLive = Layer.mergeAll(
	HttpRouter.add("GET", "/health", Registry.health),
	BrowserAccessRoutes,
	HttpStaticServer.layer({ root: webRoot, spa: true }),
).pipe(
	HttpRouter.serve,
	Layer.provide(
		NodeHttpServer.layerConfig(createServer, {
			port: Config.Port("PORT").pipe(Config.withDefault(8133)),
		}),
	),
);

/** Serves `GET /metrics` on a private port. The cluster ships them with the logs. */
export const MetricsServerLive = HttpRouter.add(
	"GET",
	"/metrics",
	Registry.prometheusMetrics,
).pipe(
	(routes) => HttpRouter.serve(routes, { disableLogger: true }),
	Layer.provide(
		NodeHttpServer.layerConfig(createServer, {
			host: Config.succeed("127.0.0.1"),
			port: Config.Port("RIVETKIT_METRICS_PORT").pipe(Config.withDefault(9433)),
		}),
	),
);
