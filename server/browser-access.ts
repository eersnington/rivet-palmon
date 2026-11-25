//! What the browser needs to reach the actors: where the control plane is,
//! and a short-lived token. The admin token never leaves the server.
import { Clock, Config, Duration, Effect, Layer, Option, Redacted, Schema, SynchronizedRef } from "effect";
import {
	FetchHttpClient,
	HttpClient,
	HttpClientRequest,
	HttpClientResponse,
	HttpRouter,
	HttpServerRequest,
	HttpServerResponse,
} from "effect/http";

const PublicRivet = Config.all({
	endpoint: Config.String("PUBLIC_RIVET_ENDPOINT").pipe(
		Config.withDefault("http://localhost:6490"),
		Config.map((endpoint) => endpoint.replace(/\/$/, "")),
	),
	namespace: Config.String("PUBLIC_RIVET_NAMESPACE").pipe(
		Config.withDefault("default"),
	),
});

const TOKEN_DURATION = Duration.minutes(15);
const TOKEN_RENEW_BEFORE_EXPIRY = Duration.minutes(1);
/** A forced refresh cannot make the server issue more often than this. */
const TOKEN_MIN_AGE_FOR_REFRESH = Duration.seconds(5);

const IssuedTokenBody = Schema.Struct({
	token: Schema.String,
	expires_ts: Schema.Number,
});

interface IssuedToken {
	readonly token: string;
	readonly issuedAt: number;
	readonly expiresAt: number;
}

const noStoreJson = (body: unknown, status = 200) =>
	HttpServerResponse.jsonUnsafe(body, {
		status,
		headers: { "cache-control": "no-store" },
	});

/**
 * The browser reads the client config at runtime, so one image works on any
 * cluster. It has no token. The browser gets one from `/token`.
 */
const ConfigRoute = Layer.unwrap(
	Effect.map(PublicRivet, (rivet) =>
		HttpRouter.add("GET", "/config.json", noStoreJson(rivet)),
	),
);

/**
 * Issues a scoped JWT for browsers with the admin token, which stays here.
 * Page loads share one token until it is near its expiry. Without
 * `RIVET_ADMIN_TOKEN`, it answers `{"token": null}`.
 */
const TokenRoute = Layer.unwrap(
	Effect.gen(function* () {
		const rivet = yield* PublicRivet;
		const adminToken = yield* Config.option(
			Config.Redacted("RIVET_ADMIN_TOKEN"),
		);
		if (Option.isNone(adminToken)) {
			return HttpRouter.add("GET", "/token", noStoreJson({ token: null }));
		}

		const client = (yield* HttpClient.HttpClient).pipe(
			HttpClient.filterStatusOk,
		);
		const issue = Effect.gen(function* () {
			const response = yield* client.execute(
				HttpClientRequest.post(`${rivet.endpoint}/auth/tokens`).pipe(
					HttpClientRequest.bearerToken(Redacted.value(adminToken.value)),
					HttpClientRequest.bodyJsonUnsafe({
						namespace: rivet.namespace,
						duration: Duration.toSeconds(TOKEN_DURATION),
						grants: [
							{
								resource: "actor",
								target: "any",
								operations: ["create", "read", "list"],
							},
							{
								resource: "actor_gateway",
								target: "any",
								operations: ["create", "read", "update", "delete", "list"],
							},
						],
					}),
				),
			);
			// A decode error could echo the body, which holds the token.
			const body = yield* HttpClientResponse.schemaBodyJson(IssuedTokenBody)(
				response,
			).pipe(
				Effect.mapError(() => new Error("control plane answered without a token")),
			);
			const issuedAt = yield* Clock.currentTimeMillis;
			return { token: body.token, issuedAt, expiresAt: body.expires_ts };
		});

		const cache = yield* SynchronizedRef.make(Option.none<IssuedToken>());
		const isFresh = (cached: IssuedToken, now: number, forceRefresh: boolean) =>
			now < cached.expiresAt - Duration.toMillis(TOKEN_RENEW_BEFORE_EXPIRY) &&
			!(
				forceRefresh &&
				now - cached.issuedAt > Duration.toMillis(TOKEN_MIN_AGE_FOR_REFRESH)
			);
		// The ref runs one update at a time, so concurrent page loads share one issue.
		const browserToken = (forceRefresh: boolean) =>
			SynchronizedRef.modifyEffect(cache, (cached) =>
				Effect.gen(function* () {
					const now = yield* Clock.currentTimeMillis;
					if (Option.isSome(cached) && isFresh(cached.value, now, forceRefresh)) {
						return [cached.value, cached] as const;
					}
					const issued = yield* issue;
					return [issued, Option.some(issued)] as const;
				}),
			);

		return HttpRouter.add(
			"GET",
			"/token",
			Effect.gen(function* () {
				const params = yield* HttpServerRequest.ParsedSearchParams;
				const { token, expiresAt } = yield* browserToken("refresh" in params);
				return noStoreJson({ token, expiresAt });
			}).pipe(
				Effect.catch((error) =>
					Effect.logError("token issue failed", error.message).pipe(
						Effect.as(noStoreJson({ error: "token issue failed" }, 502)),
					),
				),
			),
		);
	}),
).pipe(Layer.provide(FetchHttpClient.layer));

/** `GET /config.json` and `GET /token`. */
export const BrowserAccessRoutes = Layer.mergeAll(ConfigRoute, TokenRoute);
