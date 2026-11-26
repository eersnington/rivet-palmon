import { BrowserKeyValueStore } from "@effect/platform-browser";
import { Component, Head } from "@effect/ui";
import { Effect, Layer, Option } from "effect";
import { KeyValueStore } from "effect/persistence";
import { clientLayer } from "./client.ts";
import { commandsLayer, SaveProfile } from "./command.ts";
import { CODE_LENGTH, MUSIC_OFF_STORAGE_KEY, MUTED_STORAGE_KEY, PROFILE_STORAGE_KEY, SEAT_STORAGE_KEY } from "./constant.ts";
import { PalmonDef, type PalmonProps } from "./definition.ts";
import { newArena, Profile, Screen, Seat } from "./model.ts";
import { Speaker } from "./sound.ts";
import { subscriptions } from "./subscription.ts";
import { update } from "./update.ts";
import { view } from "./view/view.ts";

// FLAGS

const newProfile = Effect.sync((): Profile => ({ playerId: crypto.randomUUID(), name: "" }));

const savedProfile = Effect.gen(function* () {
	const store = KeyValueStore.toSchemaStore(yield* KeyValueStore.KeyValueStore, Profile);
	return yield* store.get(PROFILE_STORAGE_KEY);
}).pipe(
	Effect.flatMap(Option.match({ onNone: () => newProfile, onSome: Effect.succeed })),
	Effect.catch(() => newProfile),
	Effect.provide(BrowserKeyValueStore.layerLocalStorage),
);

/** A switch saved as "1" for on. A missing or unreadable one is off. */
const savedSwitch = (key: string) =>
	KeyValueStore.KeyValueStore.pipe(
		Effect.flatMap((store) => store.get(key)),
		Effect.map((value) => value === "1"),
		Effect.catch(() => Effect.succeed(false)),
		Effect.provide(BrowserKeyValueStore.layerLocalStorage),
	);

const savedSeat = Effect.gen(function* () {
	const store = KeyValueStore.toSchemaStore(yield* KeyValueStore.KeyValueStore, Seat);
	return yield* store.get(SEAT_STORAGE_KEY);
}).pipe(
	Effect.catch(() => Effect.succeed(Option.none<Seat>())),
	Effect.provide(BrowserKeyValueStore.layerSessionStorage),
);

const codeFromHash = Effect.sync(() => location.hash.replace(/^#/, "").toUpperCase().slice(0, CODE_LENGTH));

/** The saved player, the sound and music switches, and the room of the link. */
export const props: Effect.Effect<PalmonProps> = Effect.gen(function* () {
	const profile = yield* savedProfile;
	const isMuted = yield* savedSwitch(MUTED_STORAGE_KEY);
	const isMusicOff = yield* savedSwitch(MUSIC_OFF_STORAGE_KEY);
	const hashCode = yield* codeFromHash;
	const maybeSeat = yield* savedSeat;
	const maybeResumeRole = Option.map(
		Option.filter(maybeSeat, (seat) => seat.code === hashCode),
		(seat) => seat.role,
	);
	return { initial: { profile, hashCode, maybeResumeRole, isMuted, isMusicOff } };
});

// COMPONENT

export const PalmonNoDeps = PalmonDef.make({
	init: ($) => {
		const { profile, hashCode, maybeResumeRole, isMuted, isMusicOff } = $.props.initial;
		return $.set({
			profile,
			codeInput: hashCode,
			isCreatingRoom: false,
			recent: [],
			screen: Option.match(
				Option.filter(maybeResumeRole, () => hashCode.length === CODE_LENGTH),
				{
					onNone: () => Screen.Home(),
					onSome: (role) => Screen.Arena({ arena: newArena(hashCode, role) }),
				},
			),
			maybeNotice: Option.none(),
			noticeCount: 0,
			isSoundOn: !isMuted,
			isMusicOn: !isMusicOff,
			hasInteracted: false,
		})
			// A new player id is saved at once, so a reload keeps the seat it takes.
			.run(SaveProfile.make({ profile }));
	},
	update,
	subscriptions,
	head: () => [Head.title("Palmon")],
	view,
});

/** The app with its Rivet client, its Commands and the speaker. The client and the speaker live as long as the app. */
export const Palmon = PalmonNoDeps.pipe(
	Component.provide(commandsLayer.pipe(Layer.provideMerge(Layer.mergeAll(clientLayer, Speaker.layer)))),
);
