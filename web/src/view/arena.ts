import { Option } from "effect";
import type { FighterView, RoomView } from "../../../shared/api.ts";
import { creatureInfo } from "../art/creatures.ts";
import { sceneStyle } from "../art/scenery.ts";
import { Message } from "../message.ts";
import { type Arena, type Model, sidesOf } from "../model.ts";
import { revealBeats } from "../reveal.ts";
import { consoleView } from "./console.ts";
import { burst, creatureView } from "./creature.ts";
import { fighterView, hpBoxView, shotsView } from "./fighter.ts";
import { type H, icon, ms, soundButtons } from "./shared.ts";

type Fighter = RoomView["fighters"][number];

/** The line under the shout: the winner's HP, or why the fight was a draw. */
const resultLine = (fighters: ReadonlyArray<Fighter>, winner: Fighter | undefined) => {
	if (winner?.critter != null) return `${creatureInfo(winner.critter).name} · ${winner.hp} HP left`;
	const bothFainted = fighters.length > 0 && fighters.every((fighter) => fighter.hp <= 0);
	return bothFainted ? "Both fainted!" : "Even on HP after the last turn.";
};

/** The winner takes a bow over the stage: crown, name and confetti. A draw gets both. */
const resultView = (view: RoomView, h: H) => {
	const winner = view.fighters.find((fighter) => fighter.id === view.winnerId);
	const shown = winner === undefined ? view.fighters : [winner];
	return h.div
		.key(`result-${view.code}`)
		.class("result")
		.children(
			h.div.class("result-card px").children(
				h.div.class("crown-big").children(icon("crown", "", h)),
				h.div
					.class("result-mons")
					.children(
						shown.flatMap((fighter) =>
							fighter.critter === null ? [] : [h.div.class("result-mon").children(creatureView(fighter.critter, "front", false, h))],
						),
					),
				h.div.class("shout").children(winner === undefined ? "Draw!" : `${winner.name} wins!`),
				h.div.class("result-sub").children(resultLine(view.fighters, winner)),
			),
			burst("confetti-a", ["#ffd23f", "#ff86b0"], 300, true, h),
			burst("confetti-b", ["#4fd8d0", "#86d27a"], 650, true, h),
			burst("confetti-c", ["#ff8a3d", "#ffffff"], 1000, true, h),
		);
};

const battleView = (model: Model, arena: Arena, view: RoomView, h: H) => {
	const { me, them } = sidesOf(view, arena.role, model.profile.playerId);
	const beats = view.phase === "reveal" ? revealBeats(view, me?.id) : [];
	const bigHit = beats.find((beat) => beat.play.card === "smash" && view.plays.some((play) => play.playerId !== beat.play.playerId));
	const quakeDelay = { animationDelay: ms(bigHit?.impactMs ?? 0) };
	// The computer trainer always wears its tag, so spectators can tell too.
	const tagOf = (fighter: FighterView | undefined, tag: string) =>
		fighter?.isCpu === true ? "CPU" : arena.role === "spectator" ? "" : tag;
	return h.div.class(`battle phase-${view.phase}`).children(
		h.div
			.key(`stage-${view.code}`)
			.class("stage px")
			.style(sceneStyle)
			.children(
				h.div.class("sky"),
				h.div.class("clouds"),
				// The hills shake by different amounts on a big hit, for a little parallax.
				h.div.key(`far-${view.turn}-${view.phase}`).class(`hills far ${bigHit ? "quake-far" : ""}`).style(quakeDelay),
				h.div.key(`near-${view.turn}-${view.phase}`).class(`hills near ${bigHit ? "quake-near" : ""}`).style(quakeDelay),
				h.div
					.key(`shake-${view.turn}-${view.phase}`)
					.class(`arena-field ${bigHit ? "quake" : ""}`)
					.style(quakeDelay)
					.children(
						fighterView(them, "far", view, beats, h),
						fighterView(me, "near", view, beats, h),
						shotsView(view, beats, me, h),
						hpBoxView(them, "far", view, beats, tagOf(them, "Rival"), h),
						hpBoxView(me, "near", view, beats, tagOf(me, "You"), h),
					),
				bigHit !== undefined && h.div.key(`flash-${view.turn}`).class("flash").style({ animationDelay: ms(bigHit.impactMs) }),
				view.phase === "over" && resultView(view, h),
			),
		consoleView(arena, view, me, them, beats, h),
	);
};

const barView = (model: Model, arena: Arena, h: H) =>
	h.header.class("bar").children(
		h.button
			.attrs({ type: "button", title: "Copy link" })
			.class("tag px code-tag")
			.on("click", Message.ClickedCopyLink())
			.children(arena.code),
		Option.match(arena.maybeView, {
			onNone: () => null,
			onSome: (view) => [
				view.phase !== "lobby" && h.span.class("tag px").children(`Turn ${view.turn}`),
				(view.spectators > 0 || arena.role === "spectator") &&
					h.span.class("tag px").children(icon("eye", "", h), `${Math.max(1, view.spectators)}`),
			],
		}),
		h.span.class(`live ${arena.isLive ? "on" : ""}`).attr("title", arena.isLive ? "live" : "connecting"),
		soundButtons(model, h),
		h.button.attr("type", "button").class("btn small leave").on("click", Message.ClickedLeave()).children("Leave"),
	);

/** A pixel wipe plays each time the screen changes between lobby, battle and result. */
const wipeKey = (arena: Arena) =>
	Option.match(arena.maybeView, {
		onNone: () => "loading",
		onSome: (view) => (view.phase === "lobby" ? "lobby" : view.phase === "over" ? "over" : "battle"),
	});

export const view = (model: Model, arena: Arena, h: H) =>
	h.main.class("arena-screen").children(
		h.div.key(`wipe-${wipeKey(arena)}`).class("wipe").attr("aria-hidden", "true"),
		barView(model, arena, h),
		Option.match(arena.maybeView, {
			onNone: () => h.div.class("loading").children(h.span.class("bob").children("…")),
			onSome: (view) => battleView(model, arena, view, h),
		}),
	);
