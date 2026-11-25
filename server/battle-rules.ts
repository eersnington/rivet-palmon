//! The battle rules. Both cards of a turn resolve at the same time.
import { type Card, MAX_HP } from "../shared/api.ts";

/** Each hand is dealt from this pool, so `hit` comes up most. */
export const CARD_POOL = ["hit", "hit", "smash", "guard", "snack"] as const satisfies ReadonlyArray<Card>;

const dealt = (mine: Card, theirs: Card) => {
	switch (mine) {
		case "hit":
			return theirs === "guard" ? 1 : 3;
		case "smash":
			return theirs === "guard" ? 0 : 6;
		case "guard":
		case "snack":
			return 0;
	}
};

const recoil = (mine: Card, theirs: Card) => (mine === "smash" && theirs === "guard" ? 2 : 0);

export interface Outcome {
	readonly hp: number;
	readonly damage: number;
	readonly healed: number;
}

/** The new HP of a fighter with `hp` who played `mine` against `theirs`. A snack heals before the damage lands. */
export const resolve = (hp: number, mine: Card, theirs: Card): Outcome => {
	const healed = mine === "snack" ? Math.min(4, MAX_HP - hp) : 0;
	const damage = dealt(theirs, mine) + recoil(mine, theirs);
	return { hp: Math.max(0, hp + healed - damage), damage, healed };
};
