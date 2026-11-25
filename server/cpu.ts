//! The computer trainer of a solo room. It plays by the same rules as a
//! person and sees only what a person in its seat would see: its own hand and
//! the public state. `CpuSight` is everything it gets, and it has no field
//! for the rival's card of the turn, so the strategy cannot peek.
import { Array, Effect, Random } from "effect";
import { type Card, type Critter, MAX_HP } from "../shared/api.ts";

/** The computer trainer's seat. A person can never take it: `authorize` refuses this id. */
export const CPU_ID = "cpu";

const TRAINER_NAMES = [
	"Coach Kettle",
	"Captain Wobble",
	"Professor Fizz",
	"Big Sal",
	"Rookie Remy",
	"Granny Bolt",
	"Sir Sprocket",
	"DJ Pebble",
] as const;

const CRITTERS = ["cinder", "blub", "sprig", "zip", "sus"] as const satisfies ReadonlyArray<Critter>;

/** A trainer name and a creature, both at random. Types are cosmetic, so no creature counters another. */
export const cpuTrainer = Effect.all({
	name: Random.choice(TRAINER_NAMES),
	critter: Random.choice(CRITTERS),
});

/** What the computer trainer knows when it picks a card. */
export interface CpuSight {
	readonly hand: Array.NonEmptyReadonlyArray<Card>;
	readonly hp: number;
	readonly rivalHp: number;
	readonly turn: number;
	readonly maxTurns: number;
	/** The rival's cards from earlier turns, all already revealed to everyone. */
	readonly rivalPastPlays: ReadonlyArray<Card>;
}

/** How much the trainer wants each card. Higher is likelier; a card it does not hold is never played. */
const weightOf = (card: Card, sight: CpuSight) => {
	const recent = sight.rivalPastPlays.slice(-3);
	const rivalSmashes = recent.filter((played) => played === "smash").length;
	const isLastTurn = sight.turn >= sight.maxTurns;
	switch (card) {
		case "hit":
			return 3;
		// Goes for the finish when the rival is low.
		case "smash":
			return sight.rivalHp <= 6 ? 7 : 3;
		// Braces when the rival has been swinging hard, or when a lead only needs holding.
		case "guard":
			return 1 + rivalSmashes * 2 + (isLastTurn && sight.hp > sight.rivalHp ? 3 : 0);
		// Eats when hurt, and never at full HP.
		case "snack":
			if (sight.hp >= MAX_HP - 2) return 0;
			return sight.hp <= 7 ? 6 : sight.hp <= 12 ? 2 : 1;
	}
};

/**
 * Picks a card from the hand by weighted chance, so the trainer is sensible
 * but never certain. `roll` is a number in [0, 1).
 */
export const chooseCpuCard = (sight: CpuSight, roll: number): Card => {
	const weighted = sight.hand.map((card) => ({ card, weight: weightOf(card, sight) }));
	const total = weighted.reduce((sum, entry) => sum + entry.weight, 0);
	if (total === 0) return sight.hand[0];
	let left = roll * total;
	for (const entry of weighted) {
		left -= entry.weight;
		if (left < 0) return entry.card;
	}
	return sight.hand[0];
};

/** How long the trainer "thinks" before playing: a human-like pause, well inside the turn. */
export const cpuThinkMs = (turnMs: number) =>
	Random.nextIntBetween(1100, 3200).pipe(Effect.map((ms) => Math.min(ms, Math.round(turnMs * 0.45))));
