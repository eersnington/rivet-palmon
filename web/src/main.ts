import { BrowserKeyValueStore } from "@effect/platform-browser";
import type { Client } from "@rivetkit/effect";
import { Effect, Option, Schema } from "effect";
import { KeyValueStore } from "effect/persistence";
import { ManagedResource, type Runtime } from "foldkit";
import { Role } from "../../shared/api.ts";
import { SaveProfile } from "./command.ts";
import { CODE_LENGTH, MUSIC_OFF_STORAGE_KEY, MUTED_STORAGE_KEY, PROFILE_STORAGE_KEY, SEAT_STORAGE_KEY } from "./constant.ts";
import { Message } from "./message.ts";
import { type Model, newArena, Profile, Screen, Seat } from "./model.ts";
import { closeSpeaker, openSpeaker, Speaker, type SpeakerService } from "./sound.ts";

export { resources } from "./client.ts";
export { Message } from "./message.ts";
export { Model } from "./model.ts";
export { subscriptions } from "./subscription.ts";
export { update } from "./update.ts";
export { view } from "./view/view.ts";

// FLAGS

export const Flags = Schema.Struct({
	profile: Profile,
	/** The room code in the link. */
	hashCode: Schema.String,
	/** The role this tab had in the room of the link, so a reload goes straight back in. */
	maybeResumeRole: Schema.Option(Role),
	isMuted: Schema.Boolean,
	isMusicOff: Schema.Boolean,
});
export type Flags = typeof Flags.Type;

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
export const flags: Effect.Effect<Flags> = Effect.gen(function* () {
	const profile = yield* savedProfile;
	const isMuted = yield* savedSwitch(MUTED_STORAGE_KEY);
	const isMusicOff = yield* savedSwitch(MUSIC_OFF_STORAGE_KEY);
	const hashCode = yield* codeFromHash;
	const maybeSeat = yield* savedSeat;
	const maybeResumeRole = Option.map(
		Option.filter(maybeSeat, (seat) => seat.code === hashCode),
		(seat) => seat.role,
	);
	return { profile, hashCode, maybeResumeRole, isMuted, isMusicOff };
});

// INIT

export const init: Runtime.ApplicationInit<Model, Message, Flags, Client.Client, SpeakerService> = ({
	profile,
	hashCode,
	maybeResumeRole,
	isMuted,
	isMusicOff,
}) => ({
	model: {
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
	},
	// A new player id is saved at once, so a reload keeps the seat it takes.
	commands: [SaveProfile({ profile })],
});

// MANAGED RESOURCES

export const managedResources = ManagedResource.make<Model, Message>()((entry) => ({
	speaker: entry(Schema.Option(Schema.Null), {
		resource: Speaker,
		modelToMaybeRequirements: (model) =>
			(model.isSoundOn || model.isMusicOn) && model.hasInteracted ? Option.some(null) : Option.none(),
		acquire: () => openSpeaker,
		release: closeSpeaker,
		onAcquired: () => Message.AcquiredSpeaker(),
		onReleased: () => Message.ReleasedSpeaker(),
		onAcquireError: (error) => Message.FailedAcquireSpeaker({ error: String(error) }),
	}),
}));
