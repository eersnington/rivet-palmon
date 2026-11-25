//! Which music fits the page right now. Players and spectators of one room
//! hear the same thing, apart from the low-HP layer, which follows your own
//! creature (a spectator follows either one).
import { Option } from "effect";
import { MAX_HP } from "../../../shared/api.ts";
import type { Model } from "../model.ts";
import type { MusicMood } from "./player.ts";

/** Below this share of full HP, the battle music turns urgent. */
const DANGER_HP_SHARE = 0.25;

export const musicMoodOf = (model: Model): MusicMood => {
	if (!model.isMusicOn) return "off";
	if (model.screen._tag === "Home") return "calm";
	const { arena } = model.screen;
	return Option.match(arena.maybeView, {
		onNone: () => "calm",
		onSome: (view): MusicMood => {
			switch (view.phase) {
				case "lobby":
					return "calm";
				case "pick":
				case "reveal": {
					const watched =
						arena.role === "player" ? view.fighters.filter((fighter) => fighter.id === model.profile.playerId) : view.fighters;
					const isLow = watched.some((fighter) => fighter.hp > 0 && fighter.hp < MAX_HP * DANGER_HP_SHARE);
					return isLow ? "danger" : "battle";
				}
				case "over": {
					if (view.winnerId === null) return "draw";
					if (arena.role === "spectator") return "win";
					return view.winnerId === model.profile.playerId ? "win" : "lose";
				}
			}
		},
	});
};
