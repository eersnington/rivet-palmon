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
	return h.div.class(`breath ${info.idle}`).children(
		Option.match(art.maybePart, {
			onNone: () => null,
			onSome: (part) =>
				pixelImg(part, "", `part ${info.motion}`, h).style({ transformOrigin: `${pivot.x}% ${pivot.y}%` }),
		}),
		pixelImg(art.body, info.name, "body", h),
		Option.match(art.maybeBlink, { onNone: () => null, onSome: (blink) => pixelImg(blink, "", `blink ${info.idle}`, h) }),
		armed &&
			pixelImg(art.weapon, "", `weapon ${side} ${motionKind}`, h).style({
				transformOrigin: `${gripX}% ${grip.y}%`,
				animationDelay: ms(motionDelayMs),
			}),
	);
};

/** A creature's front view without animation or weapon, for menus and the home screen. */
export const miniSprite = (critter: Critter, className: string, h: H) => {
	const art = creatureArt(critter, "front");
	return h.span
		.class(`mini ${className}`)
		.attr("aria-label", creatureInfo(critter).name)
		.children(
			Option.match(art.maybePart, { onNone: () => null, onSome: (part) => pixelImg(part, "", "", h) }),
			pixelImg(art.body, "", "", h),
		);
};

const PARTICLES = 12;

/** Pixel bits that burst from the point of impact. */
export const burst = (key: string, colors: readonly [string, string], delayMs: number, isBig: boolean, h: H) => {
	const count = isBig ? PARTICLES + 6 : PARTICLES;
	return h.div
		.key(key)
		.class(`burst ${isBig ? "big" : ""}`)
		.attr("aria-hidden", "true")
		.children(
			Array.from({ length: count }, (_, index) => {
				const angle = (index / count) * Math.PI * 2 + (index % 3) * 0.3;
				const distance = (isBig ? 70 : 48) + (index % 4) * 10;
				return h.span.class("bit").style({
					"--dx": `${Math.round(Math.cos(angle) * distance)}px`,
					"--dy": `${Math.round(Math.sin(angle) * distance)}px`,
					background: colors[index % 2] ?? colors[0],
					animationDelay: ms(delayMs + (index % 3) * 20),
				});
			}),
		);
};
