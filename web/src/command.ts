import { BrowserKeyValueStore, Clipboard } from "@effect/platform-browser";
import { Command, Component } from "@effect/ui";
import type { RivetError } from "@rivetkit/effect";
import { Array, Duration, Effect, Layer, Option, Random, Schema, Stream } from "effect";
import { KeyValueStore } from "effect/persistence";
import { Card, Critter, DEFAULT_SETTINGS, type MoveRejected, Room, type RoomRefused } from "../../shared/api.ts";
import { joinParams } from "./client.ts";
import {
	CODE_LENGTH,
	CODE_LETTERS,
	CREATE_ROOM_RETRIES,
	MUSIC_OFF_STORAGE_KEY,
	MUTED_STORAGE_KEY,
	NOTICE_MS,
	PROFILE_STORAGE_KEY,
	SEAT_STORAGE_KEY,
} from "./constant.ts";
import { Message } from "./message.ts";
import { Profile, Seat } from "./model.ts";
import { Cue, Speaker } from "./sound.ts";

// PAGE

export const SaveProfile = Command.make("SaveProfile", { args: { profile: Profile } }, ({ profile }) =>
	Effect.gen(function* () {
		const store = KeyValueStore.toSchemaStore(yield* KeyValueStore.KeyValueStore, Profile);
		yield* store.set(PROFILE_STORAGE_KEY, profile);
	}).pipe(Effect.ignore, Effect.provide(BrowserKeyValueStore.layerLocalStorage), Effect.as(Component.noop)),
);

/** A switch saved as "1" for on. */
const saveSwitch = (key: string, isOn: boolean) =>
	KeyValueStore.KeyValueStore.pipe(
		Effect.flatMap((store) => store.set(key, isOn ? "1" : "0")),
		Effect.ignore,
		Effect.provide(BrowserKeyValueStore.layerLocalStorage),
		Effect.as(Component.noop),
	);

/** Remembers the mute switch for the next visit. */
export const SaveMuted = Command.make("SaveMuted", { args: { isMuted: Schema.Boolean } }, ({ isMuted }) =>
	saveSwitch(MUTED_STORAGE_KEY, isMuted),
);

/** Remembers the music switch for the next visit. */
export const SaveMusicOff = Command.make("SaveMusicOff", { args: { isMusicOff: Schema.Boolean } }, ({ isMusicOff }) =>
	saveSwitch(MUSIC_OFF_STORAGE_KEY, isMusicOff),
);

/** Plays the cues while the speaker is open and effects are on. */
export class PlayCues extends Command.Service<PlayCues>()("PlayCues", {
	args: { cues: Schema.Array(Cue) },
	success: Component.Noop,
}) {
	static readonly layer = this.toLayer(
		Effect.gen(function* () {
			const speaker = yield* Speaker;
			return ({ cues }) => speaker.play(cues).pipe(Effect.as(Component.noop));
		}),
	);
}

export const WaitBeforeHidingNotice = Command.make("WaitBeforeHidingNotice", { args: { id: Schema.Number } }, ({ id }) =>
	Effect.sleep(Duration.millis(NOTICE_MS)).pipe(Effect.as(Message.CompletedWaitBeforeHidingNotice({ id }))),
);

// HOME

const randomCode = Effect.map(
	Effect.all(Array.makeBy(CODE_LENGTH, () => Random.nextIntBetween(0, CODE_LETTERS.length - 1))),
	(indexes) => indexes.map((index) => CODE_LETTERS[index]).join(""),
);

/** Opens a room with a new code. A taken code fails, so it tries a few. A solo room seats a computer trainer. */
export class CreateRoom extends Command.Service<CreateRoom>()("CreateRoom", {
	args: { profile: Profile, solo: Schema.Boolean },
	success: Message,
}) {
	static readonly layer = this.toLayer(
		Effect.gen(function* () {
			const rooms = yield* Room.client;
			return ({ profile, solo }) =>
				Effect.gen(function* () {
					const code = yield* randomCode;
					yield* rooms.create(code, {
						input: { ...DEFAULT_SETTINGS, solo },
						params: joinParams("player", profile.playerId, profile.name),
					});
					return Message.SucceededCreateRoom({ code });
				}).pipe(
					Effect.retry({ times: CREATE_ROOM_RETRIES }),
					Effect.catch((error) => Effect.succeed(Message.FailedCreateRoom({ error: error.message }))),
				);
		}),
	);
}

// ARENA

const seatStore = Effect.map(KeyValueStore.KeyValueStore, (store) => KeyValueStore.toSchemaStore(store, Seat));

const replaceUrl = (url: string) => Effect.sync(() => history.replaceState(history.state, "", url));

/** Puts the room in the URL, and remembers this tab's role in it for a reload. */
export const SaveSeat = Command.make("SaveSeat", { args: { seat: Seat } }, ({ seat }) =>
	Effect.gen(function* () {
		yield* replaceUrl(`#${seat.code}`);
		yield* (yield* seatStore).set(SEAT_STORAGE_KEY, seat);
	}).pipe(Effect.ignore, Effect.provide(BrowserKeyValueStore.layerSessionStorage), Effect.as(Component.noop)),
);

/** Takes the room out of the URL and forgets this tab's seat. */
export const ClearSeat = Command.make("ClearSeat", { args: {} }, () =>
	Effect.gen(function* () {
		yield* replaceUrl(yield* Effect.sync(() => location.pathname));
		yield* (yield* seatStore).remove(SEAT_STORAGE_KEY);
	}).pipe(Effect.ignore, Effect.provide(BrowserKeyValueStore.layerSessionStorage), Effect.as(Component.noop)),
);

const moveArgs = { code: Schema.String, profile: Profile };

/** A refused move reports why, so the screen can say it. */
const toMoveMessage = <R>(move: Effect.Effect<void, MoveRejected | RivetError.RivetError | RoomRefused, R>) =>
	move.pipe(
		Effect.as(Message.SucceededSendMove()),
		Effect.catchTag("MoveRejected", (error) => Effect.succeed(Message.FailedSendMove({ reason: error.reason }))),
		Effect.catch((error) => Effect.succeed(Message.FailedSendMove({ reason: error.message }))),
	);

type Rooms = Effect.Success<typeof Room.client>;

/** The player's handle to room `code`. */
const playerRoom = (rooms: Rooms, code: string, profile: Profile) =>
	rooms.get(code, { params: joinParams("player", profile.playerId, profile.name) });

export class PickCritter extends Command.Service<PickCritter>()("PickCritter", {
	args: { ...moveArgs, critter: Critter },
	success: Message,
}) {
	static readonly layer = this.toLayer(
		Effect.gen(function* () {
			const rooms = yield* Room.client;
			return ({ code, profile, critter }) => toMoveMessage(playerRoom(rooms, code, profile).PickCritter({ critter }));
		}),
	);
}

export class PlayCard extends Command.Service<PlayCard>()("PlayCard", {
	args: { ...moveArgs, card: Card },
	success: Message,
}) {
	static readonly layer = this.toLayer(
		Effect.gen(function* () {
			const rooms = yield* Room.client;
			return ({ code, profile, card }) => toMoveMessage(playerRoom(rooms, code, profile).Play({ card }));
		}),
	);
}

/** Reads this player's hand again, for example after a refused move. */
export class FetchHand extends Command.Service<FetchHand>()("FetchHand", {
	args: moveArgs,
	success: Message,
}) {
	static readonly layer = this.toLayer(
		Effect.gen(function* () {
			const rooms = yield* Room.client;
			return ({ code, profile }) =>
				playerRoom(rooms, code, profile)
					.GetHand()
					.pipe(
						Effect.map((hand) => Message.UpdatedHand({ maybeHand: Option.fromNullishOr(hand) })),
						Effect.catch(() => Effect.succeed(Message.UpdatedHand({ maybeHand: Option.none() }))),
					);
		}),
	);
}

/**
 * Opens a spectator connection that tries to listen for hands. The room's
 * `canSubscribe` refuses it and closes the connection.
 */
export class PeekHand extends Command.Service<PeekHand>()("PeekHand", {
	args: { code: Schema.String },
	success: Message,
}) {
	static readonly layer = this.toLayer(
		Effect.gen(function* () {
			const rooms = yield* Room.client;
			return ({ code }) =>
				Effect.gen(function* () {
					const peekerId = yield* Effect.sync(() => crypto.randomUUID());
					const connection = yield* rooms.get(code, { params: joinParams("spectator", peekerId, "") }).connect;
					yield* connection.events.Hand.pipe(Stream.runDrain);
					return Message.CompletedPeekHand({ isRefused: false });
				}).pipe(
					Effect.scoped,
					Effect.timeout("5 seconds"),
					Effect.catch((error) =>
						Effect.succeed(
							Message.CompletedPeekHand({ isRefused: error._tag === "RivetError" && error.reason._tag === "Forbidden" }),
						),
					),
				);
		}),
	);
}

export const CopyLink = Command.make("CopyLink", { args: { code: Schema.String } }, ({ code }) =>
	Effect.gen(function* () {
		const origin = yield* Effect.sync(() => location.origin);
		yield* (yield* Clipboard.Clipboard).writeString(`${origin}/#${code}`);
	}).pipe(Effect.ignore, Effect.provide(Clipboard.layer), Effect.as(Component.noop)),
);

/** The Commands that reach the room through the Rivet client, and the speaker's. */
export const commandsLayer = Layer.mergeAll(
	CreateRoom.layer,
	PickCritter.layer,
	PlayCard.layer,
	FetchHand.layer,
	PeekHand.layer,
	PlayCues.layer,
);
