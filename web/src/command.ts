import { BrowserKeyValueStore, Clipboard } from "@effect/platform-browser";
import { Array, Duration, Effect, Option, Random, Schema, Stream } from "effect";
import { KeyValueStore } from "effect/persistence";
import { Command } from "foldkit";
import { replaceUrl } from "foldkit/navigation";
import type { RivetError } from "@rivetkit/effect";
import { Card, Critter, DEFAULT_SETTINGS, type MoveRejected, Room, type RoomRefused } from "../../shared/api.ts";
import { joinParams, room } from "./client.ts";
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
import { MusicMood } from "./music/player.ts";
import { Cue, playCues, Speaker } from "./sound.ts";

// PAGE

export const SaveProfile = Command.define("SaveProfile", {
	args: { profile: Profile },
	messages: [Message.CompletedSaveProfile],
	execute: ({ profile }) =>
		Effect.gen(function* () {
			const store = KeyValueStore.toSchemaStore(yield* KeyValueStore.KeyValueStore, Profile);
			yield* store.set(PROFILE_STORAGE_KEY, profile);
		}).pipe(
			Effect.ignore,
			Effect.provide(BrowserKeyValueStore.layerLocalStorage),
			Effect.as(Message.CompletedSaveProfile()),
		),
});

/** Remembers the mute switch for the next visit. */
export const SaveMuted = Command.define("SaveMuted", {
	args: { isMuted: Schema.Boolean },
	messages: [Message.CompletedSaveMuted],
	execute: ({ isMuted }) =>
		KeyValueStore.KeyValueStore.pipe(
			Effect.flatMap((store) => store.set(MUTED_STORAGE_KEY, isMuted ? "1" : "0")),
			Effect.ignore,
			Effect.provide(BrowserKeyValueStore.layerLocalStorage),
			Effect.as(Message.CompletedSaveMuted()),
		),
});

/** Remembers the music switch for the next visit. */
export const SaveMusicOff = Command.define("SaveMusicOff", {
	args: { isMusicOff: Schema.Boolean },
	messages: [Message.CompletedSaveMusicOff],
	execute: ({ isMusicOff }) =>
		KeyValueStore.KeyValueStore.pipe(
			Effect.flatMap((store) => store.set(MUSIC_OFF_STORAGE_KEY, isMusicOff ? "1" : "0")),
			Effect.ignore,
			Effect.provide(BrowserKeyValueStore.layerLocalStorage),
			Effect.as(Message.CompletedSaveMusicOff()),
		),
});

/** Moves the music to `mood` on its next bar line. Without an open speaker there is no music to move. */
export const SetMusic = Command.define("SetMusic", {
	args: { mood: MusicMood },
	messages: [Message.CompletedSetMusic],
	execute: ({ mood }) =>
		Speaker.get.pipe(
			Effect.flatMap((rig) => Effect.sync(() => rig.music.setMood(mood))),
			Effect.catchTag("ResourceNotAvailable", () => Effect.void),
			Effect.as(Message.CompletedSetMusic()),
		),
});

/** Switches the effects bus. The music bus is separate and keeps playing. */
export const SetEffects = Command.define("SetEffects", {
	args: { isOn: Schema.Boolean },
	messages: [Message.CompletedSetEffects],
	execute: ({ isOn }) =>
		Speaker.get.pipe(
			Effect.flatMap((rig) => Effect.sync(() => rig.setEffectsOn(isOn))),
			Effect.catchTag("ResourceNotAvailable", () => Effect.void),
			Effect.as(Message.CompletedSetEffects()),
		),
});

/** Plays the cues while the speaker is open and effects are on. */
export const PlayCues = Command.define("PlayCues", {
	args: { cues: Schema.Array(Cue) },
	messages: [Message.CompletedPlayCues],
	execute: ({ cues }) =>
		Speaker.get.pipe(
			Effect.flatMap((rig) => playCues(rig, cues)),
			Effect.catchTag("ResourceNotAvailable", () => Effect.void),
			Effect.as(Message.CompletedPlayCues()),
		),
});

export const WaitBeforeHidingNotice = Command.define("WaitBeforeHidingNotice", {
	args: { id: Schema.Number },
	messages: [Message.CompletedWaitBeforeHidingNotice],
	execute: ({ id }) =>
		Effect.sleep(Duration.millis(NOTICE_MS)).pipe(Effect.as(Message.CompletedWaitBeforeHidingNotice({ id }))),
});

// HOME

const randomCode = Effect.map(
	Effect.all(Array.makeBy(CODE_LENGTH, () => Random.nextIntBetween(0, CODE_LETTERS.length - 1))),
	(indexes) => indexes.map((index) => CODE_LETTERS[index]).join(""),
);

/** Opens a room with a new code. A taken code fails, so it tries a few. A solo room seats a computer trainer. */
export const CreateRoom = Command.define("CreateRoom", {
	args: { profile: Profile, solo: Schema.Boolean },
	messages: [Message.SucceededCreateRoom, Message.FailedCreateRoom],
	execute: ({ profile, solo }) =>
		Effect.gen(function* () {
			const code = yield* randomCode;
			const rooms = yield* Room.client;
			yield* rooms.create(code, {
				input: { ...DEFAULT_SETTINGS, solo },
				params: joinParams("player", profile.playerId, profile.name),
			});
			return Message.SucceededCreateRoom({ code });
		}).pipe(
			Effect.retry({ times: CREATE_ROOM_RETRIES }),
			Effect.catch((error) => Effect.succeed(Message.FailedCreateRoom({ error: error.message }))),
		),
});

// ARENA

const seatStore = Effect.map(KeyValueStore.KeyValueStore, (store) => KeyValueStore.toSchemaStore(store, Seat));

/** Puts the room in the URL, and remembers this tab's role in it for a reload. */
export const SaveSeat = Command.define("SaveSeat", {
	args: { seat: Seat },
	messages: [Message.CompletedSaveSeat],
	execute: ({ seat }) =>
		Effect.gen(function* () {
			yield* replaceUrl(`#${seat.code}`);
			yield* (yield* seatStore).set(SEAT_STORAGE_KEY, seat);
		}).pipe(
			Effect.ignore,
			Effect.provide(BrowserKeyValueStore.layerSessionStorage),
			Effect.as(Message.CompletedSaveSeat()),
		),
});

/** Takes the room out of the URL and forgets this tab's seat. */
export const ClearSeat = Command.define("ClearSeat", {
	messages: [Message.CompletedClearSeat],
	execute: Effect.gen(function* () {
		yield* replaceUrl(yield* Effect.sync(() => location.pathname));
		yield* (yield* seatStore).remove(SEAT_STORAGE_KEY);
	}).pipe(
		Effect.ignore,
		Effect.provide(BrowserKeyValueStore.layerSessionStorage),
		Effect.as(Message.CompletedClearSeat()),
	),
});

const moveArgs = { code: Schema.String, profile: Profile };

/** A refused move reports why, so the screen can say it. */
const toMoveMessage = <R>(move: Effect.Effect<void, MoveRejected | RivetError.RivetError | RoomRefused, R>) =>
	move.pipe(
		Effect.as(Message.SucceededSendMove()),
		Effect.catchTag("MoveRejected", (error) => Effect.succeed(Message.FailedSendMove({ reason: error.reason }))),
		Effect.catch((error) => Effect.succeed(Message.FailedSendMove({ reason: error.message }))),
	);

export const PickCritter = Command.define("PickCritter", {
	args: { ...moveArgs, critter: Critter },
	messages: [Message.SucceededSendMove, Message.FailedSendMove],
	execute: ({ code, profile, critter }) =>
		room(code, joinParams("player", profile.playerId, profile.name)).pipe(
			Effect.flatMap((handle) => handle.PickCritter({ critter })),
			toMoveMessage,
		),
});

export const PlayCard = Command.define("PlayCard", {
	args: { ...moveArgs, card: Card },
	messages: [Message.SucceededSendMove, Message.FailedSendMove],
	execute: ({ code, profile, card }) =>
		room(code, joinParams("player", profile.playerId, profile.name)).pipe(
			Effect.flatMap((handle) => handle.Play({ card })),
			toMoveMessage,
		),
});

/** Reads this player's hand again, for example after a refused move. */
export const FetchHand = Command.define("FetchHand", {
	args: moveArgs,
	messages: [Message.UpdatedHand],
	execute: ({ code, profile }) =>
		room(code, joinParams("player", profile.playerId, profile.name)).pipe(
			Effect.flatMap((handle) => handle.GetHand()),
			Effect.map((hand) => Message.UpdatedHand({ maybeHand: Option.fromNullishOr(hand) })),
			Effect.catch(() => Effect.succeed(Message.UpdatedHand({ maybeHand: Option.none() }))),
		),
});

/**
 * Opens a spectator connection that tries to listen for hands. The room's
 * `canSubscribe` refuses it and closes the connection.
 */
export const PeekHand = Command.define("PeekHand", {
	args: { code: Schema.String },
	messages: [Message.CompletedPeekHand],
	execute: ({ code }) =>
		Effect.gen(function* () {
			const peekerId = yield* Effect.sync(() => crypto.randomUUID());
			const handle = yield* room(code, joinParams("spectator", peekerId, ""));
			const connection = yield* handle.connect;
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
		),
});

export const CopyLink = Command.define("CopyLink", {
	args: { code: Schema.String },
	messages: [Message.CompletedCopyLink],
	execute: ({ code }) =>
		Effect.gen(function* () {
			const origin = yield* Effect.sync(() => location.origin);
			yield* (yield* Clipboard.Clipboard).writeString(`${origin}/#${code}`);
		}).pipe(Effect.ignore, Effect.provide(Clipboard.layer), Effect.as(Message.CompletedCopyLink())),
});

