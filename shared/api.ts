// The contracts. The server implements them and the browser calls them.
import { Action, Actor, Event } from "@rivetkit/effect";
import { Schema } from "effect";

export const MAX_NAME_LENGTH = 16;
export const MAX_HP = 20;
export const HAND_SIZE = 3;

export const Critter = Schema.Literals(["zip", "blub", "sprig", "cinder", "sus"]);
export type Critter = typeof Critter.Type;

/**
 * `hit` deals 3, or 1 into a `guard`. `smash` deals 6, but a `guard` stops it
 * and the smasher takes 2. `snack` heals 4. Both players play at once.
 */
export const Card = Schema.Literals(["hit", "smash", "guard", "snack"]);
export type Card = typeof Card.Type;

// ROOM

export const Role = Schema.Literals(["player", "spectator"]);
export type Role = typeof Role.Type;

/**
 * A player keeps one `playerId` in the browser, so a reload rejoins the same
 * seat. The id is the only credential in this demo.
 */
export const JoinParams = Schema.Struct({
	role: Role,
	playerId: Schema.String,
	name: Schema.String,
});
export type JoinParams = typeof JoinParams.Type;

export class RoomRefused extends Schema.TaggedError<RoomRefused>()(
	"RoomRefused",
	{ reason: Schema.Literals(["started", "full", "name"]) },
) {}

export class MoveRejected extends Schema.TaggedError<MoveRejected>()(
	"MoveRejected",
	{
		reason: Schema.Literals([
			"not_a_player",
			"wrong_phase",
			"not_in_hand",
			"already_done",
			"scheduled_only",
		]),
	},
) {}

const seconds = Schema.Number.check(Schema.isBetween({ minimum: 0.5, maximum: 120 }));

/** Chosen by the player who opens the room. */
export const Settings = Schema.Struct({
	maxTurns: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 30 })),
	/** How long a turn waits for both cards. Then the timer plays a random card. */
	turnSeconds: seconds,
	/** How long the played cards stay up. */
	revealSeconds: seconds,
	/** How long the result stays up before the room destroys itself. */
	closeSeconds: seconds,
	/** A computer trainer takes the second seat. */
	solo: Schema.Boolean,
});
export type Settings = typeof Settings.Type;

export const DEFAULT_SETTINGS: Settings = {
	maxTurns: 12,
	turnSeconds: 12,
	revealSeconds: 3.6,
	closeSeconds: 12,
	solo: false,
};

export const Phase = Schema.Literals(["lobby", "pick", "reveal", "over"]);
export type Phase = typeof Phase.Type;

export const FighterView = Schema.Struct({
	id: Schema.String,
	name: Schema.String,
	/** `null` until the player picks one in the lobby. */
	critter: Schema.NullOr(Critter),
	hp: Schema.Number,
	online: Schema.Boolean,
	/** Played a card this turn. Which card stays hidden until the reveal. */
	locked: Schema.Boolean,
	/** The computer trainer of a solo room. */
	isCpu: Schema.Boolean,
});
export type FighterView = typeof FighterView.Type;

export const PlayView = Schema.Struct({
	playerId: Schema.String,
	card: Card,
	/** The timer played it. */
	auto: Schema.Boolean,
	damage: Schema.Number,
	healed: Schema.Number,
});
export type PlayView = typeof PlayView.Type;

/**
 * What everyone in the room sees, spectators too. It never holds a hand. The
 * cards of a turn show only in its reveal.
 */
export const RoomView = Schema.Struct({
	code: Schema.String,
	/** Goes up with every change. A client keeps the view with the highest `seq`. */
	seq: Schema.Number,
	/** Unix milliseconds on the server when it read this view, to correct clock skew. */
	sentAt: Schema.Number,
	phase: Phase,
	turn: Schema.Number,
	maxTurns: Schema.Number,
	/** Unix milliseconds when the current phase ends. */
	deadlineAt: Schema.NullOr(Schema.Number),
	/** Milliseconds the current phase lasts in total. */
	phaseMs: Schema.Number,
	/** Seats in join order. At most two. */
	fighters: Schema.Array(FighterView),
	spectators: Schema.Number,
	/** The cards of the current turn, in the reveal and after the last turn. */
	plays: Schema.Array(PlayView),
	/** In `over`: the winner, or `null` for a draw. */
	winnerId: Schema.NullOr(Schema.String),
});
export type RoomView = typeof RoomView.Type;

/** The cards one player holds this turn. */
export const HandView = Schema.Struct({
	turn: Schema.Number,
	cards: Schema.Array(Card),
	/** The card played from this hand, if any. */
	played: Schema.NullOr(Card),
});
export type HandView = typeof HandView.Type;

/** Public: every connection may subscribe. */
export const RoomChanged = Event.make("RoomChanged", { payload: RoomView });

/** Player-only: `canSubscribe` refuses spectators. */
export const Hand = Event.make("Hand", { payload: HandView });

export const GetRoom = Action.make("GetRoom", { success: RoomView });

/** The caller's hand for the current turn, after a reconnect. */
export const GetHand = Action.make("GetHand", {
	success: Schema.NullOr(HandView),
	error: MoveRejected,
});

/** Picks a critter in the lobby. The fight starts when both seats have one. */
export const PickCritter = Action.make("PickCritter", {
	payload: { critter: Critter },
	error: MoveRejected,
});

/** Plays one card of the caller's hand. */
export const Play = Action.make("Play", {
	payload: { card: Card },
	error: MoveRejected,
});

/** Called by the timer only. It ends `phase` of `turn`. */
export const EndPhase = Action.make("EndPhase", {
	payload: { turn: Schema.Number, phase: Phase },
	error: MoveRejected,
});

/** Called by the schedule only: the computer trainer plays its card for `turn`. */
export const CpuPlay = Action.make("CpuPlay", {
	payload: { turn: Schema.Number },
	error: MoveRejected,
});

/** Called by the timer after the fight. The room destroys itself. */
export const Close = Action.make("Close", { error: MoveRejected });

export const Room = Actor.make("Room", {
	actions: [GetRoom, GetHand, PickCritter, Play, EndPhase, CpuPlay, Close],
	events: [RoomChanged, Hand],
	input: Settings,
	connection: { params: JoinParams, error: RoomRefused },
});

// LEADERBOARD

export const FighterResult = Schema.Struct({
	name: Schema.String,
	critter: Critter,
	hp: Schema.Number,
});

export const GameResult = Schema.Struct({
	code: Schema.String,
	finishedAt: Schema.Number,
	turns: Schema.Number,
	/** The winner's name, or `null` for a draw. */
	winner: Schema.NullOr(Schema.String),
	fighters: Schema.Array(FighterResult),
});
export type GameResult = typeof GameResult.Type;

export const RecordResult = Action.make("RecordResult", { payload: GameResult });

export const RecentResults = Action.make("RecentResults", {
	success: Schema.Array(GameResult),
});

export const ResultRecorded = Event.make("ResultRecorded", { payload: GameResult });

export const Leaderboard = Actor.make("Leaderboard", {
	actions: [RecordResult, RecentResults],
	events: [ResultRecorded],
});

export const LEADERBOARD_KEY = "main";
