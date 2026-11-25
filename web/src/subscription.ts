import type { Client } from "@rivetkit/effect";
import { Clock, Effect, Option, Schedule, Schema, Stream } from "effect";
import { Dom, Subscription } from "foldkit";
import { type RoomView, Role } from "../../shared/api.ts";
import { joinParams, leaderboard, room } from "./client.ts";
import { RECONNECT_DELAY, TICK_INTERVAL } from "./constant.ts";
import { Message } from "./message.ts";
import { maybeArenaOf, type Model } from "./model.ts";

const stamp = (view: RoomView) =>
	Clock.currentTimeMillis.pipe(Effect.map((receivedAtMs) => Message.UpdatedRoomView({ view, receivedAtMs })));

/**
 * One live connection to the room. A player also listens for hands, which
 * only players may do. A lost connection opens again after a delay.
 */
const roomEvents = (code: string, role: Role, playerId: string, name: string) =>
	Stream.unwrap(
		Effect.gen(function* () {
			const handle = yield* room(code, joinParams(role, playerId, name));
			// One plain call first: a room that is gone fails here at once, while a
			// connection to it would keep retrying.
			const first = yield* handle.GetRoom().pipe(Effect.flatMap(stamp));
			const connection = yield* handle.connect;
			const views = Stream.concat(
				Stream.succeed(first),
				Stream.merge(
					connection.events.RoomChanged.pipe(Stream.mapEffect(stamp)),
					Stream.fromEffect(connection.GetRoom().pipe(Effect.flatMap(stamp))),
				),
			);
			if (role === "spectator") return views;
			const hands = Stream.merge(
				connection.events.Hand.pipe(Stream.map((hand) => Message.UpdatedHand({ maybeHand: Option.some(hand) }))),
				Stream.fromEffect(
					connection.GetHand().pipe(Effect.map((hand) => Message.UpdatedHand({ maybeHand: Option.fromNullishOr(hand) }))),
				),
			);
			return Stream.merge(views, hands);
		}),
	).pipe(
		Stream.catch((error): Stream.Stream<Message> => {
			if (error._tag === "RoomRefused") return Stream.succeed(Message.RefusedSeat({ reason: error.reason }));
			if (error._tag === "RivetError" && error.reason._tag === "ActorNotFound") return Stream.succeed(Message.DisappearedRoom());
			return Stream.succeed(Message.LostRoomConnection());
		}),
		// The stream ends when the room is destroyed. The next connect finds no room.
		Stream.concat(Stream.succeed(Message.LostRoomConnection())),
		Stream.repeat(Schedule.spaced(RECONNECT_DELAY)),
	);

/** The recent battles, live. */
const leaderboardEvents = Stream.unwrap(
	Effect.gen(function* () {
		const connection = yield* (yield* leaderboard).connect;
		return Stream.merge(
			connection.events.ResultRecorded.pipe(Stream.map((result) => Message.RecordedResult({ result }))),
			Stream.fromEffect(connection.RecentResults().pipe(Effect.map((results) => Message.UpdatedRecentResults({ results })))),
		);
	}),
).pipe(
	Stream.catch(() => Stream.empty),
	Stream.repeat(Schedule.spaced(RECONNECT_DELAY)),
);

const clockTicks = Stream.tick(TICK_INTERVAL).pipe(
	Stream.mapEffect(() => Clock.currentTimeMillis),
	Stream.map((nowMs) => Message.TickedClock({ nowMs })),
);

/** The first key or pointer press on the page. After it, the browser allows audio. */
const firstInteraction = Stream.merge(
	Dom.streamFromEvent({ target: window, type: "pointerdown", mapEvent: () => null }),
	Dom.streamFromEvent({ target: window, type: "keydown", mapEvent: () => null }),
).pipe(Stream.take(1), Stream.as(Message.InteractedWithPage()));

const RoomDependencies = Schema.Struct({
	code: Schema.String,
	role: Role,
	playerId: Schema.String,
	name: Schema.String,
});

export const subscriptions = Subscription.make<Model, Message, Client.Client>()((entry) => ({
	leaderboard: entry(
		{ isHome: Schema.Boolean },
		{
			modelToDependencies: (model) => ({ isHome: model.screen._tag === "Home" }),
			dependenciesToStream: ({ isHome }) => (isHome ? leaderboardEvents : Stream.empty),
		},
	),
	room: entry(
		{ maybeRoom: Schema.Option(RoomDependencies) },
		{
			modelToDependencies: (model) => ({
				maybeRoom: Option.map(maybeArenaOf(model), (arena) => ({
					code: arena.code,
					role: arena.role,
					playerId: model.profile.playerId,
					name: model.profile.name.trim(),
				})),
			}),
			dependenciesToStream: ({ maybeRoom }) =>
				Option.match(maybeRoom, {
					onNone: () => Stream.empty,
					onSome: ({ code, role, playerId, name }) => roomEvents(code, role, playerId, name),
				}),
		},
	),
	clock: entry(
		{ isTicking: Schema.Boolean },
		{
			modelToDependencies: (model) => ({
				isTicking: Option.exists(
					Option.flatMap(maybeArenaOf(model), (arena) => arena.maybeView),
					(view) => view.deadlineAt !== null,
				),
			}),
			dependenciesToStream: ({ isTicking }) => (isTicking ? clockTicks : Stream.empty),
		},
	),
	firstInteraction: entry(
		{ hasInteracted: Schema.Boolean },
		{
			modelToDependencies: (model) => ({ hasInteracted: model.hasInteracted }),
			dependenciesToStream: ({ hasInteracted }) => (hasInteracted ? Stream.empty : firstInteraction),
		},
	),
}));
