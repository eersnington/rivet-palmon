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
			h.div
				.key(`shot-${view.turn}-${beat.play.playerId}-${index}`)
				.class(`shot ${direction} ${weapon.sound}`)
				.style({ "--c1": weapon.trail[0], "--c2": weapon.trail[1], animationDelay: ms(at) })
				.children(h.span.class("bolt").style({ animationDelay: ms(at) })),
		);
	});

const emptySlotView = (side: Side, h: H) =>
	h.div.class(`slot ${side}`).children(h.div.class("platform"), h.div.class("mon").children(pixelImg(EGG_URL, "Egg", "egg", h)));

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

	return h.div
		.key(`slot-${fighter.id}`)
		.class(`slot ${side} ${fighter.online ? "" : "offline"}`)
		.children(
			h.div.class("platform"),
			// Turn 1 starts with a send-out: a pop of light, then the creature.
			h.div
				.key(`send-${view.code}`)
				.class(`mon ${view.turn <= 1 && view.phase === "pick" ? "send-out" : ""}`)
				.children(
					h.div
						.key(`act-${step}`)
						.class(`act ${actClass} ${ending}`)
						.style({ animationDelay: ms(own?.startMs ?? 0) })
						.children(
							h.div
								.key(`hurt-${step}`)
								.class(`hurt-wrap ${hurtAt === undefined ? "" : "hurt"}`)
								.style({ animationDelay: ms(hurtAt ?? 0) })
								.children(creatureView(critter, side === "near" ? "back" : "front", isArmed, h, maybeMotion)),
						),
				),
			view.phase === "pick" && fighter.locked && h.div.key(`lock-${view.turn}`).class("ready pop-in").children("Ready"),
			attacks &&
				own !== undefined &&
				shotTimes(own).map((at, index) =>
					h.div
						.key(`muzzle-${step}-${index}`)
						.class("muzzle")
						.style({
							left: `${side === "near" ? 100 - weapon.tip.x : weapon.tip.x}%`,
							top: `${weapon.tip.y}%`,
							animationDelay: ms(at),
						})
						.children(icon("hit", "", h)),
				),
			own !== undefined &&
				own.play.card === "guard" &&
				h.div.key(`shield-${step}`).class("shield-ring").style({ animationDelay: ms(own.startMs + 150) }),
			own !== undefined && own.play.card === "snack" && burst(`heal-${step}`, ["#86d27a", "#ffffff"], own.startMs + 200, false, h),
			hurtAt !== undefined &&
				theirs !== undefined &&
				burst(`hit-${step}`, particleColors[attackerCritter], hurtAt, theirs.play.card === "smash", h),
			hurtAt !== undefined &&
				play !== undefined &&
				h.div.key(`dmg-${step}`).class("float damage").style({ animationDelay: ms(hurtAt) }).children(`-${play.damage}`),
			view.phase === "reveal" &&
				play !== undefined &&
				play.healed > 0 &&
				own !== undefined &&
				h.div.key(`healed-${step}`).class("float heal").style({ animationDelay: ms(own.impactMs) }).children(`+${play.healed}`),
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
	if (maybeFighter === undefined) return h.div.class(`hpbox ${side} px empty`).children(h.span.class("dim").children("Waiting…"));
	const fighter = maybeFighter;
	const info = fighter.critter === null ? undefined : creatureInfo(fighter.critter);
	const delay = view.phase === "reveal" ? hpChangeMs(beats, fighter) : 0;
	const ratio = fighter.hp / MAX_HP;
	const tone = ratio > 0.5 ? "ok" : ratio > 0.25 ? "mid" : "low";
	return h.div
		.key(`hp-${fighter.id}`)
		.class(`hpbox ${side} px`)
		.children(
			h.div
				.class("hp-top")
				.children(
					h.span.class("mon-name").children(info?.name ?? "?"),
					info !== undefined && h.span.class("type").style({ background: info.typeColor }).children(info.type),
				),
			h.div.class("hp-owner").children(h.span.children(fighter.name), tag !== "" && h.span.class("you").children(tag)),
			h.div.class("hp-row").children(
				h.span.class("hp-label").children("HP"),
				h.div
					.class("hp-track")
					.children(
						h.div.class("hp-ghost").style({ transform: `scaleX(${ratio})`, transitionDelay: ms(delay + 350) }),
						h.div.class(`hp-fill ${tone}`).style({ transform: `scaleX(${ratio})`, transitionDelay: ms(delay) }),
					),
				h.span.class("hp-num").style({ "--hp": `${fighter.hp}`, transitionDelay: ms(delay) }),
			),
		);
};
