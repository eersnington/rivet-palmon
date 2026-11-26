import { Subscription } from "@effect/ui";
import { HtmlSubscription } from "@effect/ui/html";
import { Clock, Effect, Option, Schedule, Stream } from "effect";
import type { Role, RoomView } from "../../shared/api.ts";
import { joinParams, leaderboard, room } from "./client.ts";
import { RECONNECT_DELAY, TICK_INTERVAL } from "./constant.ts";
import { Message } from "./message.ts";
import { maybeArenaOf, type Model } from "./model.ts";
import { musicMoodOf } from "./music/mood.ts";
import type { MusicMood } from "./music/player.ts";
import { Speaker } from "./sound.ts";

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

/** Opens the speaker and keeps it open until the Subscription stops. */
const openSpeaker = Stream.unwrap(
	Effect.gen(function* () {
		yield* (yield* Speaker).open;
		return Stream.never;
	}),
);

const setMusicMood = (mood: MusicMood) =>
	Stream.fromEffect(Effect.gen(function* () {
		yield* (yield* Speaker).setMood(mood);
	})).pipe(Stream.drain);

const setEffectsOn = (isOn: boolean) =>
	Stream.fromEffect(Effect.gen(function* () {
		yield* (yield* Speaker).setEffectsOn(isOn);
	})).pipe(Stream.drain);

export const subscriptions = ({ model }: { readonly model: Model }) => {
	const maybeArena = maybeArenaOf(model);
	const isTicking = Option.exists(
		Option.flatMap(maybeArena, (arena) => arena.maybeView),
		(view) => view.deadlineAt !== null,
	);
	// A browser starts audio only after the viewer pressed something on the page.
	const isSpeakerWanted = (model.isSoundOn || model.isMusicOn) && model.hasInteracted;
	return [
		model.screen._tag === "Home" && Subscription.make("leaderboard", leaderboardEvents),
		...Option.toArray(
			Option.map(maybeArena, (arena) =>
				Subscription.make(
					"room",
					[arena.code, arena.role, model.profile.playerId, model.profile.name.trim()],
					([code, role, playerId, name]) => roomEvents(code, role, playerId, name),
				),
			),
		),
		isTicking && Subscription.make("clock", clockTicks),
		// The first key or press on the page. `pointerup` covers touch, where a press activates on release.
		...(model.hasInteracted
			? []
			: (["mousedown", "pointerup", "keydown"] as const).map((event) =>
					HtmlSubscription.onDocument(event, Message.InteractedWithPage()),
				)),
		isSpeakerWanted && Subscription.make("speaker", openSpeaker),
		// The speaker keeps the latest mood and switch, so a speaker that opens later plays them too.
		Subscription.make("music", musicMoodOf(model), setMusicMood),
		Subscription.make("effects", model.isSoundOn, setEffectsOn),
	];
};
