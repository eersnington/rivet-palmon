//! The sounds of a change in the room, timed like the animations they go with.
import { Option } from "effect";
import type { RoomView } from "../../shared/api.ts";
import { creatureInfo } from "./art/creatures.ts";
import { type Arena, remainingMs } from "./model.ts";
import { hpChangeMs, isAttack, revealBeats } from "./reveal.ts";
import { type Cue, cue } from "./sound.ts";

/** The id drawn as "you": your own seat, or the first seat for a spectator. */
const viewerId = (arena: Arena, playerId: string, view: RoomView) =>
	arena.role === "player" ? playerId : view.fighters[0]?.id;

/**
 * The sounds for the change from `before` to `view`. The first view after a
 * load plays nothing. With music on, the music plays the ending instead of
 * the fanfare or the sad slide.
 */
export const roomChangeCues = (
	arena: Arena,
	playerId: string,
	before: RoomView,
	view: RoomView,
	isMusicOn: boolean,
): ReadonlyArray<Cue> => {
	if (before.code !== view.code) return [];
	const meId = viewerId(arena, playerId, view);
	const isNewTurn = before.turn !== view.turn;

	const joined = view.phase === "lobby" && view.fighters.length > before.fighters.length ? [cue("join")] : [];

	const dealt =
		view.phase === "pick" && (before.phase !== "pick" || isNewTurn) ? [cue(before.phase === "lobby" ? "join" : "deal")] : [];

	const rivalLocked =
		view.phase === "pick" &&
		before.phase === "pick" &&
		!isNewTurn &&
		view.fighters.some(
			(fighter) =>
				fighter.id !== meId && fighter.locked && !before.fighters.some((old) => old.id === fighter.id && old.locked),
		)
			? [cue("lock")]
			: [];

	const revealed = view.phase === "reveal" && (before.phase !== "reveal" || isNewTurn) ? revealCues(view, meId) : [];

	const ended = view.phase === "over" && before.phase !== "over" && !isMusicOn ? [endCue(arena, playerId, view)] : [];

	return [...joined, ...dealt, ...rivalLocked, ...revealed, ...ended];
};

/** How long the music stays ducked around an attack, from the shot to just after the impact. */
const DUCK_MS = 700;

/** Each beat's weapon and impact, with the music ducked under it, then the HP bars draining and filling. */
const revealCues = (view: RoomView, meId: string | undefined): ReadonlyArray<Cue> => {
	const beats = revealBeats(view, meId);
	const moves = beats.flatMap((beat) => {
		const user = view.fighters.find((fighter) => fighter.id === beat.play.playerId);
		if (isAttack(beat.play.card) && user?.critter != null) {
			const heavy = beat.play.card === "smash" ? 2 : 1;
			return [
				cue("duck", DUCK_MS, beat.startMs),
				cue(creatureInfo(user.critter).weapon.sound, heavy, beat.startMs),
				cue("impact", heavy, beat.impactMs),
			];
		}
		return beat.play.card === "guard" || beat.play.card === "snack" ? [cue(beat.play.card, 0, beat.startMs)] : [];
	});
	const bars = view.fighters.flatMap((fighter) => {
		const play = view.plays.find((entry) => entry.playerId === fighter.id);
		if (play === undefined) return [];
		const own = beats.find((beat) => beat.play.playerId === fighter.id);
		return [
			...(play.damage > 0 ? [cue("drain", play.damage, hpChangeMs(beats, fighter) + 60)] : []),
			...(play.healed > 0 && own !== undefined ? [cue("heal", play.healed, own.impactMs + 120)] : []),
		];
	});
	return [...moves, ...bars];
};

/** A spectator always hears the fanfare. A player hears it only for a win. */
const endCue = (arena: Arena, playerId: string, view: RoomView) => {
	const isWin = view.winnerId !== null && (arena.role === "spectator" || view.winnerId === playerId);
	return cue(isWin ? "victory" : "lose", 0, 300);
};

/** The countdown ticks once a second in the last 5 seconds, twice a second in the last 3. */
const tickStep = (leftMs: number) =>
	leftMs <= 0 || leftMs > 5000 ? null : leftMs > 3000 ? `s${Math.ceil(leftMs / 1000)}` : `h${Math.ceil(leftMs / 500)}`;

/** The countdown tick between the clock at `before` and at `after`, if one falls in between. */
export const countdownCue = (before: Arena, after: Arena): Option.Option<Cue> =>
	Option.flatMap(
		Option.filter(after.maybeView, (view) => view.phase === "pick"),
		(view) => {
			const leftMs = remainingMs(after, view);
			const step = tickStep(leftMs);
			return step !== null && step !== tickStep(remainingMs(before, view))
				? Option.some(cue(leftMs <= 3000 ? "tickUrgent" : "tick"))
				: Option.none();
		},
	);
