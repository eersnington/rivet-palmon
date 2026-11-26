//! The Rivet client. The server gives the browser its endpoint and a
//! short-lived token, so no secret is in the page.
import { Client } from "@rivetkit/effect";
import { Effect, Layer, Schema } from "effect";
import { type JoinParams, LEADERBOARD_KEY, Leaderboard, type Role, Room } from "../../shared/api.ts";

const ClientConfig = Schema.Struct({ endpoint: Schema.String, namespace: Schema.String });

/** The server builds `/config.json` from its environment at runtime. */
const fetchClientConfig = Effect.tryPromise(() => fetch("/config.json").then((response) => response.json())).pipe(
	Effect.flatMap(Schema.decodeUnknownEffect(ClientConfig)),
);

const TokenBody = Schema.Struct({ token: Schema.NullOr(Schema.String) });

/**
 * The server issues a short-lived token for the browser from `/token`. It is
 * `null` when the control plane needs none, such as a local engine.
 */
const fetchToken = (forceRefresh: boolean) =>
	Effect.tryPromise(async () => {
		const response = await fetch(forceRefresh ? "/token?refresh" : "/token");
		if (!response.ok) throw new Error(`/token answered ${response.status}`);
		return response.json();
	}).pipe(
		Effect.flatMap(Schema.decodeUnknownEffect(TokenBody)),
		Effect.map(({ token }) => token),
	);

/** `getToken` must give a token, so the client only gets one when the first `/token` read has a token. */
const getToken: NonNullable<Client.Options["getToken"]> = ({ forceRefresh }) =>
	Effect.runPromise(
		fetchToken(forceRefresh).pipe(
			Effect.flatMap((token) => (token === null ? Effect.fail(new Error("/token has no token")) : Effect.succeed(token))),
		),
	);

/** One Rivet client for the app. A config that cannot load crashes the app. */
export const clientLayer = Layer.unwrap(
	Effect.gen(function* () {
		const config = yield* fetchClientConfig;
		const token = yield* fetchToken(false);
		return Client.layer(token === null ? config : { ...config, getToken });
	}).pipe(Effect.orDie),
);

/** A handle to room `code` that connects with `role`. A spectator needs no name. */
export const room = (code: string, params: JoinParams) =>
	Room.client.pipe(Effect.map((rooms) => rooms.get(code, { params })));

export const joinParams = (role: Role, playerId: string, name: string): JoinParams => ({ role, playerId, name });

export const leaderboard = Leaderboard.client.pipe(Effect.map((boards) => boards.getOrCreate(LEADERBOARD_KEY)));
