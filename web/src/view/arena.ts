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
	return h.keyed("div")(
		`result-${view.code}`,
		[h.Class("result")],
		[
			h.div(
				[h.Class("result-card px")],
				[
					h.div([h.Class("crown-big")], [icon("crown", "", h)]),
					h.div(
						[h.Class("result-mons")],
						shown.flatMap((fighter) =>
							fighter.critter === null ? [] : [h.div([h.Class("result-mon")], [creatureView(fighter.critter, "front", false, h)])],
						),
					),
					h.div([h.Class("shout")], [winner === undefined ? "Draw!" : `${winner.name} wins!`]),
					h.div(
						[h.Class("result-sub")],
						[resultLine(view.fighters, winner)],
					),
				],
			),
			burst("confetti-a", ["#ffd23f", "#ff86b0"], 300, true, h),
			burst("confetti-b", ["#4fd8d0", "#86d27a"], 650, true, h),
			burst("confetti-c", ["#ff8a3d", "#ffffff"], 1000, true, h),
		],
	);
};

const battleView = (model: Model, arena: Arena, view: RoomView, h: H) => {
	const { me, them } = sidesOf(view, arena.role, model.profile.playerId);
	const beats = view.phase === "reveal" ? revealBeats(view, me?.id) : [];
	const bigHit = beats.find((beat) => beat.play.card === "smash" && view.plays.some((play) => play.playerId !== beat.play.playerId));
	const quakeDelay = { "animation-delay": ms(bigHit?.impactMs ?? 0) };
	// The computer trainer always wears its tag, so spectators can tell too.
	const tagOf = (fighter: FighterView | undefined, tag: string) =>
		fighter?.isCpu === true ? "CPU" : arena.role === "spectator" ? "" : tag;
	return h.div(
		[h.Class(`battle phase-${view.phase}`)],
		[
			h.keyed("div")(
				`stage-${view.code}`,
				[h.Class("stage px"), h.Style(sceneStyle)],
				[
					h.div([h.Class("sky")], []),
					h.div([h.Class("clouds")], []),
					// The hills shake by different amounts on a big hit, for a little parallax.
					h.keyed("div")(`far-${view.turn}-${view.phase}`, [h.Class(`hills far ${bigHit ? "quake-far" : ""}`), h.Style(quakeDelay)], []),
					h.keyed("div")(`near-${view.turn}-${view.phase}`, [h.Class(`hills near ${bigHit ? "quake-near" : ""}`), h.Style(quakeDelay)], []),
					h.keyed("div")(
						`shake-${view.turn}-${view.phase}`,
						[h.Class(`arena-field ${bigHit ? "quake" : ""}`), h.Style(quakeDelay)],
						[
							fighterView(them, "far", view, beats, h),
							fighterView(me, "near", view, beats, h),
							...shotsView(view, beats, me, h),
							hpBoxView(them, "far", view, beats, tagOf(them, "Rival"), h),
							hpBoxView(me, "near", view, beats, tagOf(me, "You"), h),
						],
					),
					...(bigHit === undefined
						? []
						: [h.keyed("div")(`flash-${view.turn}`, [h.Class("flash"), h.Style({ "animation-delay": ms(bigHit.impactMs) })], [])]),
					...(view.phase === "over" ? [resultView(view, h)] : []),
				],
			),
			consoleView(arena, view, me, them, beats, h),
		],
	);
};

const barView = (model: Model, arena: Arena, h: H) =>
	h.header(
		[h.Class("bar")],
		[
			h.button(
				[h.Type("button"), h.Class("tag px code-tag"), h.OnClick(Message.ClickedCopyLink()), h.Title("Copy link")],
				[arena.code],
			),
			...Option.match(arena.maybeView, {
				onNone: () => [],
				onSome: (view) => [
					...(view.phase === "lobby" ? [] : [h.span([h.Class("tag px")], [`Turn ${view.turn}`])]),
					...(view.spectators > 0 || arena.role === "spectator"
						? [h.span([h.Class("tag px")], [icon("eye", "", h), `${Math.max(1, view.spectators)}`])]
						: []),
				],
			}),
			h.span([h.Class(`live ${arena.isLive ? "on" : ""}`), h.Title(arena.isLive ? "live" : "connecting")], []),
			soundButtons(model, h),
			h.button([h.Type("button"), h.Class("btn small leave"), h.OnClick(Message.ClickedLeave())], ["Leave"]),
		],
	);

/** A pixel wipe plays each time the screen changes between lobby, battle and result. */
const wipeKey = (arena: Arena) =>
	Option.match(arena.maybeView, {
		onNone: () => "loading",
		onSome: (view) => (view.phase === "lobby" ? "lobby" : view.phase === "over" ? "over" : "battle"),
	});

export const view = (model: Model, arena: Arena, h: H) =>
	h.main(
		[h.Class("arena-screen")],
		[
			h.keyed("div")(`wipe-${wipeKey(arena)}`, [h.Class("wipe"), h.AriaHidden(true)], []),
			barView(model, arena, h),
			Option.match(arena.maybeView, {
				onNone: () => h.div([h.Class("loading")], [h.span([h.Class("bob")], ["…"])]),
				onSome: (view) => battleView(model, arena, view, h),
			}),
		],
	);
