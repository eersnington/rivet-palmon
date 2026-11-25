//! The order and timing of a reveal. Both cards resolve at once on the server,
//! but the screen plays them one after the other: guards and snacks first,
//! then attacks, so a guard is up before the hit lands. The view and the sound
//! read the same timings.
import type { Card, FighterView, PlayView, RoomView } from "../../shared/api.ts";

/** Before the first beat, so the text box can clear. */
export const REVEAL_LEAD_MS = 250;
/** Each card gets this long. Two beats fit in the default reveal. */
export const BEAT_MS = 1400;
/** From a beat's start to the moment an attack connects. */
export const IMPACT_MS = 380;

export const isAttack = (card: Card) => card === "hit" || card === "smash";

export interface Beat {
	readonly play: PlayView;
	readonly startMs: number;
	readonly impactMs: number;
	readonly isLast: boolean;
}

/** The beats of the current reveal. `firstId` goes first on a tie, usually you. */
export const revealBeats = (view: RoomView, firstId: string | undefined): ReadonlyArray<Beat> => {
	const ordered = [...view.plays].sort((a, b) => {
		const rank = Number(isAttack(a.card)) - Number(isAttack(b.card));
		if (rank !== 0) return rank;
		return a.playerId === firstId ? -1 : b.playerId === firstId ? 1 : 0;
	});
	return ordered.map((play, index) => {
		const startMs = REVEAL_LEAD_MS + index * BEAT_MS;
		return { play, startMs, impactMs: startMs + IMPACT_MS, isLast: index === ordered.length - 1 };
	});
};

/**
 * When a fighter's HP visibly changes: when the rival's attack lands, or, with
 * only recoil or a snack, during the fighter's own beat.
 */
export const hpChangeMs = (beats: ReadonlyArray<Beat>, fighter: FighterView) => {
	const theirs = beats.find((beat) => beat.play.playerId !== fighter.id);
	if (theirs !== undefined && isAttack(theirs.play.card)) return theirs.impactMs;
	const mine = beats.find((beat) => beat.play.playerId === fighter.id);
	return mine === undefined ? 0 : mine.impactMs;
};
