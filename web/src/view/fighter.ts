import { Option } from "effect";
import { type FighterView, MAX_HP, type RoomView } from "../../../shared/api.ts";
import { creatureInfo, EGG_URL, particleColors } from "../art/creatures.ts";
import { type Beat, hpChangeMs, isAttack } from "../reveal.ts";
import { burst, creatureView } from "./creature.ts";
import { type H, icon, ms, pixelImg } from "./shared.ts";

export type Side = "near" | "far";

/** When a shot leaves the gun, before it lands at the beat's impact. A heavy attack fires three. */
const shotTimes = (beat: Beat) =>
	beat.play.card === "smash" ? [beat.startMs + 140, beat.startMs + 220, beat.startMs + 300] : [beat.startMs + 220];

/** Shots that fly from a gun to its target: a bright bolt with a tracer behind it. */
export const shotsView = (view: RoomView, beats: ReadonlyArray<Beat>, me: FighterView | undefined, h: H) =>
	beats.flatMap((beat) => {
		const shooter = view.fighters.find((fighter) => fighter.id === beat.play.playerId);
		if (shooter?.critter == null || !isAttack(beat.play.card)) return [];
		const weapon = creatureInfo(shooter.critter).weapon;
		const direction = shooter.id === me?.id ? "up" : "down";
		return shotTimes(beat).map((at, index) =>
			h.keyed("div")(
				`shot-${view.turn}-${beat.play.playerId}-${index}`,
				[
					h.Class(`shot ${direction} ${weapon.sound}`),
					h.Style({ "--c1": weapon.trail[0], "--c2": weapon.trail[1], "animation-delay": ms(at) }),
				],
				[h.span([h.Class("bolt"), h.Style({ "animation-delay": ms(at) })], [])],
			),
		);
	});

const emptySlotView = (side: Side, h: H) =>
	h.div(
		[h.Class(`slot ${side}`)],
		[h.div([h.Class("platform")], []), h.div([h.Class("mon")], [pixelImg(EGG_URL, "Egg", "egg", h)])],
	);

/**
 * A fighter on its platform, and everything its beat draws around it. Each
 * animated piece is keyed by the turn and phase, so it plays once per beat.
 */
export const fighterView = (maybeFighter: FighterView | undefined, side: Side, view: RoomView, beats: ReadonlyArray<Beat>, h: H) => {
	if (maybeFighter === undefined || maybeFighter.critter === null) return emptySlotView(side, h);
	const fighter = maybeFighter;
	const critter = maybeFighter.critter;
	const own = beats.find((beat) => beat.play.playerId === fighter.id);
	const theirs = beats.find((beat) => beat.play.playerId !== fighter.id);
	const attacks = own !== undefined && isAttack(own.play.card);
	const weapon = creatureInfo(critter).weapon;
	const play = view.plays.find((entry) => entry.playerId === fighter.id);
	const hurtAt = view.phase === "reveal" && play !== undefined && play.damage > 0 ? hpChangeMs(beats, fighter) : undefined;
	const ending = view.phase === "over" ? (fighter.hp === 0 ? "faint" : view.winnerId === fighter.id ? "cheer" : "") : "";
	const step = `${view.turn}-${view.phase}`;
	// Weapons come out when the fight starts, with the send-out.
	const isArmed = view.phase !== "lobby";
	const attacker = view.fighters.find((entry) => entry.id !== fighter.id);
	const attackerCritter = attacker?.critter ?? critter;
	const actClass = attacks ? `recoil-${side}` : "";
	const maybeMotion =
		attacks && own !== undefined
			? Option.some({
					kind: own.play.card === "smash" ? ("burst" as const) : ("kick" as const),
					delayMs: own.startMs + 200,
				})
			: Option.none();

	return h.keyed("div")(
		`slot-${fighter.id}`,
		[h.Class(`slot ${side} ${fighter.online ? "" : "offline"}`)],
		[
			h.div([h.Class("platform")], []),
			// Turn 1 starts with a send-out: a pop of light, then the creature.
			h.keyed("div")(
				`send-${view.code}`,
				[h.Class(`mon ${view.turn <= 1 && view.phase === "pick" ? "send-out" : ""}`)],
				[
					h.keyed("div")(
						`act-${step}`,
						[h.Class(`act ${actClass} ${ending}`), h.Style({ "animation-delay": ms(own?.startMs ?? 0) })],
						[
							h.keyed("div")(
								`hurt-${step}`,
								[h.Class(`hurt-wrap ${hurtAt === undefined ? "" : "hurt"}`), h.Style({ "animation-delay": ms(hurtAt ?? 0) })],
								[creatureView(critter, side === "near" ? "back" : "front", isArmed, h, maybeMotion)],
							),
						],
					),
				],
			),
			...(view.phase === "pick" && fighter.locked ? [h.keyed("div")(`lock-${view.turn}`, [h.Class("ready pop-in")], ["Ready"])] : []),
			...(attacks && own !== undefined
				? shotTimes(own).map((at, index) =>
						h.keyed("div")(
							`muzzle-${step}-${index}`,
							[
								h.Class("muzzle"),
								h.Style({
									left: `${side === "near" ? 100 - weapon.tip.x : weapon.tip.x}%`,
									top: `${weapon.tip.y}%`,
									"animation-delay": ms(at),
								}),
							],
							[icon("hit", "", h)],
						),
					)
				: []),
			...(own !== undefined && own.play.card === "guard"
				? [h.keyed("div")(`shield-${step}`, [h.Class("shield-ring"), h.Style({ "animation-delay": ms(own.startMs + 150) })], [])]
				: []),
			...(own !== undefined && own.play.card === "snack" ? [burst(`heal-${step}`, ["#86d27a", "#ffffff"], own.startMs + 200, false, h)] : []),
			...(hurtAt !== undefined && theirs !== undefined
				? [burst(`hit-${step}`, particleColors[attackerCritter], hurtAt, theirs.play.card === "smash", h)]
				: []),
			...(hurtAt !== undefined && play !== undefined
				? [h.keyed("div")(`dmg-${step}`, [h.Class("float damage"), h.Style({ "animation-delay": ms(hurtAt) })], [`-${play.damage}`])]
				: []),
			...(view.phase === "reveal" && play !== undefined && play.healed > 0 && own !== undefined
				? [h.keyed("div")(`healed-${step}`, [h.Class("float heal"), h.Style({ "animation-delay": ms(own.impactMs) })], [`+${play.healed}`])]
				: []),
		],
	);
};

/**
 * Name, type and HP. In a reveal, the bar drains when the hit lands, not when
 * the server's view arrives, and the number counts down with it.
 */
export const hpBoxView = (
	maybeFighter: FighterView | undefined,
	side: Side,
	view: RoomView,
	beats: ReadonlyArray<Beat>,
	tag: string,
	h: H,
) => {
	if (maybeFighter === undefined) return h.div([h.Class(`hpbox ${side} px empty`)], [h.span([h.Class("dim")], ["Waiting…"])]);
	const fighter = maybeFighter;
	const info = fighter.critter === null ? undefined : creatureInfo(fighter.critter);
	const delay = view.phase === "reveal" ? hpChangeMs(beats, fighter) : 0;
	const ratio = fighter.hp / MAX_HP;
	const tone = ratio > 0.5 ? "ok" : ratio > 0.25 ? "mid" : "low";
	return h.keyed("div")(
		`hp-${fighter.id}`,
		[h.Class(`hpbox ${side} px`)],
		[
			h.div(
				[h.Class("hp-top")],
				[
					h.span([h.Class("mon-name")], [info?.name ?? "?"]),
					...(info === undefined ? [] : [h.span([h.Class("type"), h.Style({ background: info.typeColor })], [info.type])]),
				],
			),
			h.div([h.Class("hp-owner")], [h.span([], [fighter.name]), ...(tag === "" ? [] : [h.span([h.Class("you")], [tag])])]),
			h.div(
				[h.Class("hp-row")],
				[
					h.span([h.Class("hp-label")], ["HP"]),
					h.div(
						[h.Class("hp-track")],
						[
							h.div([h.Class("hp-ghost"), h.Style({ transform: `scaleX(${ratio})`, "transition-delay": ms(delay + 350) })], []),
							h.div([h.Class(`hp-fill ${tone}`), h.Style({ transform: `scaleX(${ratio})`, "transition-delay": ms(delay) })], []),
						],
					),
					h.span([h.Class("hp-num"), h.Style({ "--hp": `${fighter.hp}`, "transition-delay": ms(delay) })], []),
				],
			),
		],
	);
};
