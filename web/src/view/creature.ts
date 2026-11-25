import { Option } from "effect";
import type { Critter } from "../../../shared/api.ts";
import { creatureArt, creatureInfo, type View } from "../art/creatures.ts";
import { type H, ms, pixelImg } from "./shared.ts";

/** How the gun moves in a beat: it kicks back once, or three times for a heavy attack. */
export interface WeaponMotion {
	readonly kind: "kick" | "burst";
	readonly delayMs: number;
}

/**
 * The layered creature: a tail or wings, the body, a blink and, when `armed`,
 * its weapon. Each moves on its own. The back view holds its weapon mirrored.
 * Weapons come out only in battle: menus and the home screen show creatures unarmed.
 */
export const creatureView = (
	critter: Critter,
	side: View,
	armed: boolean,
	h: H,
	maybeMotion: Option.Option<WeaponMotion> = Option.none(),
) => {
	const art = creatureArt(critter, side);
	const info = creatureInfo(critter);
	const grip = info.weapon.grip;
	const gripX = side === "front" ? grip.x : 100 - grip.x;
	const pivot = side === "front" ? info.pivot : info.backPivot;
	const motionKind = Option.match(maybeMotion, { onNone: () => "", onSome: (motion) => motion.kind });
	const motionDelayMs = Option.match(maybeMotion, { onNone: () => 0, onSome: (motion) => motion.delayMs });
	return h.div(
		[h.Class(`breath ${info.idle}`)],
		[
			...Option.toArray(
				Option.map(art.maybePart, (part) =>
					h.img([
						h.Src(part),
						h.Alt(""),
						h.Class(`pixel part ${info.motion}`),
						h.Attribute("draggable", "false"),
						h.Style({ "transform-origin": `${pivot.x}% ${pivot.y}%` }),
					]),
				),
			),
			pixelImg(art.body, info.name, "body", h),
			...Option.toArray(Option.map(art.maybeBlink, (blink) => pixelImg(blink, "", `blink ${info.idle}`, h))),
			...(armed
				? [
						h.img([
							h.Src(art.weapon),
							h.Alt(""),
							h.Class(`pixel weapon ${side} ${motionKind}`),
							h.Attribute("draggable", "false"),
							h.Style({ "transform-origin": `${gripX}% ${grip.y}%`, "animation-delay": ms(motionDelayMs) }),
						]),
					]
				: []),
		],
	);
};

/** A creature's front view without animation or weapon, for menus and the home screen. */
export const miniSprite = (critter: Critter, className: string, h: H) => {
	const art = creatureArt(critter, "front");
	return h.span(
		[h.Class(`mini ${className}`), h.AriaLabel(creatureInfo(critter).name)],
		[
			...Option.toArray(Option.map(art.maybePart, (part) => pixelImg(part, "", "", h))),
			pixelImg(art.body, "", "", h),
		],
	);
};

const PARTICLES = 12;

/** Pixel bits that burst from the point of impact. */
export const burst = (key: string, colors: readonly [string, string], delayMs: number, isBig: boolean, h: H) => {
	const count = isBig ? PARTICLES + 6 : PARTICLES;
	return h.keyed("div")(
		key,
		[h.Class(`burst ${isBig ? "big" : ""}`), h.AriaHidden(true)],
		Array.from({ length: count }, (_, index) => {
			const angle = (index / count) * Math.PI * 2 + (index % 3) * 0.3;
			const distance = (isBig ? 70 : 48) + (index % 4) * 10;
			return h.span(
				[
					h.Class("bit"),
					h.Style({
						"--dx": `${Math.round(Math.cos(angle) * distance)}px`,
						"--dy": `${Math.round(Math.sin(angle) * distance)}px`,
						background: colors[index % 2] ?? colors[0],
						"animation-delay": ms(delayMs + (index % 3) * 20),
					}),
				],
				[],
			);
		}),
	);
};
