import { UiSchema } from "@effect/ui";
import { Option, Schema } from "effect";
import { type FighterView, GameResult, HandView, Role, RoomView } from "../../shared/api.ts";

// PROFILE

/** This browser's player. The id survives a reload, so a reload rejoins the same seat. */
export const Profile = Schema.Struct({ playerId: Schema.String, name: Schema.String });
export type Profile = typeof Profile.Type;

/** The room this tab sits in, saved per tab so a reload goes straight back in. */
export const Seat = Schema.Struct({ code: Schema.String, role: Role });
export type Seat = typeof Seat.Type;

// FLAGS

/** What this browser saved, read before the app mounts. */
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

// ARENA

/** A spectator's try to see a hand. The room refuses it. */
export const Peek = UiSchema.TaggedEnum({
	Idle: {},
	Trying: {},
	Refused: {},
});
export type Peek = typeof Peek.Type;

/** Everything this tab knows about the room it is in. */
export const Arena = Schema.Struct({
	code: Schema.String,
	role: Role,
	/** The newest view of the room. Views carry a `seq`, so an older one never replaces a newer one. */
	maybeView: Schema.Option(RoomView),
	maybeHand: Schema.Option(HandView),
	/** This browser's clock minus the server's, from the last view. */
	clockOffsetMs: Schema.Number,
	/** This browser's clock at the last tick or view. */
	nowMs: Schema.Number,
	isLive: Schema.Boolean,
	/** A critter pick is on its way to the room. */
	isPicking: Schema.Boolean,
	peek: Peek,
});
export type Arena = typeof Arena.Type;

export const Screen = UiSchema.TaggedEnum({
	Home: {},
	Arena: { arena: Arena },
});
export type Screen = typeof Screen.Type;

// MODEL

export const Notice = Schema.Struct({ id: Schema.Number, text: Schema.String });
export type Notice = typeof Notice.Type;

export const Model = Schema.Struct({
	profile: Profile,
	/** The room code typed on the home screen, or the one in the link. */
	codeInput: Schema.String,
	isCreatingRoom: Schema.Boolean,
	/** Finished battles, newest first. */
	recent: Schema.Array(GameResult),
	screen: Screen,
	maybeNotice: Schema.Option(Notice),
	/** How many notices this page showed. The next notice takes it as its id. */
	noticeCount: Schema.Number,
	/** The sound effects. Music has its own switch. */
	isSoundOn: Schema.Boolean,
	isMusicOn: Schema.Boolean,
	/** The viewer pressed a key or a pointer on the page, so the browser allows audio. */
	hasInteracted: Schema.Boolean,
});
export type Model = typeof Model.Type;

export const maybeArenaOf = (model: Model): Option.Option<Arena> =>
	model.screen._tag === "Arena" ? Option.some(model.screen.arena) : Option.none();

export const newArena = (code: string, role: Role): Arena => ({
	code,
	role,
	maybeView: Option.none(),
	maybeHand: Option.none(),
	clockOffsetMs: 0,
	nowMs: 0,
	isLive: false,
	isPicking: false,
	peek: Peek.Idle(),
});

// SELECTORS

/** Milliseconds left in the current phase, on the server's clock. */
export const remainingMs = (arena: Arena, view: RoomView) =>
	view.deadlineAt === null ? 0 : Math.max(0, view.deadlineAt - (arena.nowMs - arena.clockOffsetMs));

/** Who is drawn near, from the back: you, or the first seat for a spectator. */
export const sidesOf = (view: RoomView, role: Role, playerId: string) => {
	const me: FighterView | undefined =
		role === "player" ? view.fighters.find((fighter) => fighter.id === playerId) : view.fighters[0];
	const them = view.fighters.find((fighter) => fighter.id !== me?.id);
	return { me, them };
};

/** The hand of the current turn, if this tab has it. */
export const currentHand = (arena: Arena, view: RoomView) =>
	Option.filter(arena.maybeHand, (hand) => hand.turn === view.turn);
