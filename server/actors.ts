import { Client } from "@rivetkit/effect";
import { Config, Effect, Layer, Option } from "effect";
import { LeaderboardLive } from "./leaderboard.ts";
import { RoomLive } from "./room.ts";

/**
 * Rooms call the leaderboard through the same control plane. A cluster sets
 * `RIVET_ENDPOINT`. A local engine listens on `RIVET_RUN_ENGINE_PORT`.
 */
const ActorClientLive = Layer.unwrap(
	Effect.gen(function* () {
		const endpoint = yield* Config.option(Config.String("RIVET_ENDPOINT"));
		if (Option.isSome(endpoint)) return Client.layer({});
		const port = yield* Config.Port("RIVET_RUN_ENGINE_PORT").pipe(Config.withDefault(6490));
		return Client.layer({ endpoint: `http://127.0.0.1:${port}` });
	}).pipe(Effect.orDie),
);

export const ActorsLive = Layer.mergeAll(RoomLive, LeaderboardLive).pipe(
	Layer.provide(ActorClientLive),
);
