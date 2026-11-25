//! Five original creatures, drawn as 32x32 pixel art from shaded shapes.
//! Each shape is lit from the upper left, and every layer gets a colored
//! outline, so all five share one look. A creature has a front view (the
//! rival) and a back view (yours), each split into layers that animate on
//! their own: `part` (tail or wings), `body`, and `blink` (closed eyes).
import { Option } from "effect";
import type { Card, Critter } from "../../../shared/api.ts";
import type { Gun } from "../sound.ts";
import { Canvas, type Color, SIZE, type Tone3 } from "./pixel-canvas.ts";

// One palette for every creature.
const INK = "#1b1230";
const WHITE = "#ffffff";
const PINK = "#ff86b0";

const FLAME: Tone3 = { base: "#ff8a3d", shade: "#d9572b", light: "#ffc58a" };
const CREAM: Tone3 = { base: "#fff1d6", shade: "#f2cf9e", light: "#ffffff" };
const RED: Tone3 = { base: "#ec4a5a", shade: "#b8323f", light: "#ff8a8a" };
const GOLD: Tone3 = { base: "#ffd23f", shade: "#e0a320", light: "#fff3a8" };
const AQUA: Tone3 = { base: "#6cc4f5", shade: "#3f8fd6", light: "#c6ecff" };
const GILL: Tone3 = { base: "#ff86b0", shade: "#d9608c", light: "#ffc2d8" };
const TAN: Tone3 = { base: "#e0a96d", shade: "#b8774a", light: "#f6d2a2" };
const LEAF: Tone3 = { base: "#86d27a", shade: "#4e9f5a", light: "#c6f0b4" };
const WING: Tone3 = { base: "#9b7fd1", shade: "#6b54a8", light: "#c9b8f0" };
const TEAL: Tone3 = { base: "#4fd8d0", shade: "#2fa39c", light: "#b9fff9" };

/** The rival is seen from the front, your own creature from the back. */
export type View = "front" | "back";
type Layer = "part" | "body" | "blink";

interface Design {
	readonly name: string;
	readonly type: string;
	readonly typeColor: Color;
	/** `null` for a sprite that draws its own outline. */
	readonly outline: Color | null;
	/** Where `part` turns, in % of the sprite: a tail's base or the wings' middle. */
	readonly pivot: { readonly x: number; readonly y: number };
	/** Where `part` turns in the back view, when the tail sits on the other side. */
	readonly backPivot?: { readonly x: number; readonly y: number };
	/** How `part` moves: a tail flicks, a flame flickers, wings flap. */
	readonly motion: "flick" | "flap" | "flicker";
	readonly moves: Readonly<Record<Card, string>>;
	/** `breathe` for most; `shuffle` sidles side to side and darts its eyes. */
	readonly idle: "breathe" | "shuffle";
	readonly weapon: Weapon;
	readonly draw: (canvas: Canvas, view: View, layer: Layer) => void;
}

/**
 * Every creature carries one gun, shown only in battle. A gun is drawn for the
 * front view, held on the screen's left and aimed left, and mirrored for the
 * back view. All guns hit equally hard: they change how an attack looks and
 * sounds, not its damage.
 */
interface Weapon {
	readonly sound: Gun;
	/** Colors of its tracer. */
	readonly trail: readonly [Color, Color];
	/** Where shots leave, in % of the front sprite. */
	readonly tip: { readonly x: number; readonly y: number };
	/** Where it is held, the center of its recoil, in % of the front sprite. */
	readonly grip: { readonly x: number; readonly y: number };
	readonly draw: (canvas: Canvas) => void;
}

const STEEL = "#e8eef5";
const STEEL_EDGE = "#9fb0c4";
const GUNMETAL = "#4a4a5e";
const GUN_LIGHT = "#6a6a80";
const GUN_DARK = "#2e2c40";
const OLIVE: Tone3 = { base: "#7a8a48", shade: "#55623a", light: "#a4b46a" };
const WOOD = "#8b5a2b";
/** The shadow side of a white body. */

/** Two eyes at `(x, y)` and its mirror, each 2x2 with a glint. */
const eyes = (canvas: Canvas, x: number, y: number, height = 2) => {
	canvas.rect(x, y, x + 1, y + height - 1, INK);
	canvas.set(x, y, WHITE);
	canvas.rect(SIZE - 2 - x, y, SIZE - 1 - x, y + height - 1, INK);
	canvas.set(SIZE - 2 - x, y, WHITE);
};

/** Closed eyes: skin over the eye, with a dark lash line. */
const closedEyes = (canvas: Canvas, x: number, y: number, skin: Color, height = 2) => {
	canvas.rect(x, y, x + 1, y + height - 1, skin);
	canvas.rect(SIZE - 2 - x, y, SIZE - 1 - x, y + height - 1, skin);
	canvas.line(x, y + height - 1, x + 1, y + height - 1, INK);
	canvas.line(SIZE - 2 - x, y + height - 1, SIZE - 1 - x, y + height - 1, INK);
};

/**
 * Amogus is the owner's crude meme sprite, kept as drawn: `K` ink, `.` body,
 * `C` and `B` the visor's light and dark blue, a space for nothing. It is
 * scaled up by 1.5 with nearest pixels, which keeps its wonky, uneven lines.
 */
const AMOGUS_FRONT = [
	"        KKKKK     ",
	"       KK....KK   ",
	"     KKK......KK  ",
	"    KK..KKKKK..KK ",
	"    K.KCCCCCC.K.K ",
	"    K.KBCBBBCBK.K ",
	"   KK..KBBBBBK..K ",
	"   K....KKKKK...K ",
	"   K............K ",
	"   K............K ",
	"   K.....KKK....K ",
	"   K....KK K....K ",
	"  K....K   K....K ",
	"  K....K   K....K ",
	"  K....K  KK....K ",
	" K....K   K.....K ",
	"KKKKKKK  KKKKKKKK ",
];

const AMOGUS_GLINT_LEFT = AMOGUS_FRONT.map((row, index) =>
	index === 4 ? "    K.K.CCCCCCK.K " : row,
);

const AMOGUS_BACK = AMOGUS_FRONT.map((row, index) => {
	if (index >= 3 && index <= 7) {
		const left = row.indexOf("K");
		const right = row.lastIndexOf("K");
		const edge = index === 3 || index === 6 ? 2 : 1;
		return `${row.slice(0, left + edge)}${".".repeat(right - left - edge)}${row.slice(right)}`;
	}
	return row;
});

const AMOGUS_COLORS: Readonly<Record<string, Color>> = {
	K: INK,
	".": WHITE,
	C: "#62cfe6",
	B: "#18aed0",
};

const drawAmogus = (c: Canvas, rows: ReadonlyArray<string>) => {
	const scale = 1.5;
	const left = 2;
	const top = 31 - Math.ceil(rows.length * scale);
	for (let y = 0; y < Math.ceil(rows.length * scale); y++) {
		const row = rows[Math.floor(y / scale)] ?? "";
		for (let x = 0; x < Math.ceil(row.length * scale); x++) {
			const color = AMOGUS_COLORS[row[Math.floor(x / scale)] ?? " "];
			if (color !== undefined) c.set(left + x, top + y, color);
		}
	}
};

const DESIGNS: Readonly<Record<Critter, Design>> = {
	// A ferret with a masked face, a flame for a tail and a flame tuft.
	cinder: {
		name: "Blazel",
		type: "Fire",
		typeColor: "#ff8a3d",
		outline: "#5a2412",
		pivot: { x: 72, y: 84 },
		backPivot: { x: 28, y: 84 },
		motion: "flicker",
		moves: { hit: "Tap Fire", smash: "Spray and Pray", guard: "Ash Veil", snack: "Warm Up" },
		idle: "breathe",
		// An AK-47: wood furniture and a curved magazine.
		weapon: {
			sound: "ak",
			trail: ["#ffd23f", "#ff8a3d"],
			tip: { x: 2, y: 59 },
			grip: { x: 50, y: 66 },
			draw: (c) => {
				// Barrel, front sight and gas tube.
				c.rect(0, 19, 7, 19, GUNMETAL);
				c.set(2, 18, GUNMETAL);
				c.rect(5, 18, 9, 18, GUNMETAL);
				// Wood handguard, steel receiver.
				c.rect(7, 19, 11, 20, WOOD);
				c.rect(7, 19, 11, 19, TAN.shade);
				c.rect(12, 18, 17, 20, GUNMETAL);
				c.rect(12, 18, 17, 18, GUN_LIGHT);
				// The curved magazine and the pistol grip.
				c.rect(12, 21, 13, 21, GUN_DARK);
				c.rect(11, 22, 12, 23, GUN_DARK);
				c.rect(10, 24, 11, 25, GUN_DARK);
				c.rect(15, 21, 16, 22, WOOD);
				c.set(16, 23, WOOD);
				// Wood stock, dropping to the butt.
				c.rect(18, 19, 22, 20, WOOD);
				c.rect(18, 19, 22, 19, TAN.shade);
				c.rect(20, 21, 23, 21, WOOD);
				c.rect(23, 19, 23, 22, WOOD);
			},
		},
		draw: (c, view, layer) => {
			// The tail is one flame: red tongues around an orange body and a gold core.
			const flameTail = (x: number, y: number) => {
				c.blob(x, y + 4, 4.2, 4.6, RED);
				c.blob(x + 1.5, y - 2, 3.4, 4, RED);
				c.tri(x - 0.5, y - 3, x + 3, y - 12, x + 4.5, y - 2, RED.base);
				c.tri(x + 3, y + 1, x + 6.5, y - 5, x + 4.5, y + 4, RED.base);
				c.blob(x - 0.2, y + 3.5, 2.8, 3.4, FLAME, true);
				c.blob(x + 1.3, y - 1.5, 2.2, 3, FLAME, true);
				c.tri(x + 0.5, y - 2, x + 2.8, y - 9, x + 3.3, y - 2, FLAME.base);
				c.blob(x - 0.2, y + 3, 1.4, 2.2, GOLD, true);
				c.blob(x + 1, y - 0.5, 1, 1.8, GOLD, true);
				c.set(x - 0.6, y + 2, GOLD.light);
			};
			const tuft = (y: number) => {
				c.tri(11.5, y + 6, 12.5, y + 1, 15, y + 6, RED.base);
				c.tri(16, y + 6, 18.5, y + 1, 19.5, y + 6, RED.base);
				c.tri(13, y + 6, 15.5, y - 2, 18, y + 6, RED.base);
				c.tri(14.5, y + 6, 15.5, y + 1, 16.5, y + 6, GOLD.base);
			};
			const ears = (y: number) => {
				c.blob(8.5, y, 2.4, 2.4, FLAME);
				c.blob(22.5, y, 2.4, 2.4, FLAME);
				c.set(8, y, PINK);
				c.set(23, y, PINK);
			};
			if (view === "front") {
				if (layer === "part") return flameTail(25, 15);
				if (layer === "blink") return closedEyes(c, 11, 11, RED.shade);
				// Body and paws.
				c.blob(15.5, 24, 6.5, 5.5, FLAME);
				c.blob(15.5, 25, 3.8, 3.8, CREAM);
				c.blob(11, 29.5, 2.3, 1.5, FLAME);
				c.blob(20, 29.5, 2.3, 1.5, FLAME);
				c.blob(12.5, 22.5, 1.5, 1.4, FLAME, true);
				c.blob(18.5, 22.5, 1.5, 1.4, FLAME, true);
				// Head, ears and the flame tuft.
				tuft(1);
				ears(7.5);
				c.blob(15.5, 13, 8, 6, FLAME);
				// The ferret's mask, with a pale blaze between the eyes.
				c.blob(11.5, 11.5, 3.2, 2, { ...RED, base: RED.shade }, true);
				c.blob(19.5, 11.5, 3.2, 2, { ...RED, base: RED.shade }, true);
				c.rect(15, 9, 16, 12, FLAME.light);
				c.blob(15.5, 16, 4.2, 2.6, CREAM);
				c.rect(15, 15, 16, 15, INK);
				c.set(14, 17, INK);
				c.rect(15, 18, 16, 18, INK);
				c.set(17, 17, INK);
				c.set(9, 15, PINK);
				c.set(22, 15, PINK);
				eyes(c, 11, 11);
				return;
			}
			if (layer === "part") {
				// Seen from behind, the tail is on the other side, clear of the rifle.
				flameTail(24, 14);
				return c.flipX();
			}
			if (layer === "blink") return;
			c.blob(15.5, 24, 7.5, 6, FLAME);
			c.blob(11, 29.5, 2.3, 1.5, FLAME);
			c.blob(20, 29.5, 2.3, 1.5, FLAME);
			tuft(0);
			ears(6.5);
			c.blob(15.5, 12.5, 8, 6.5, FLAME);
			// A dark stripe runs down the back, from the tuft to the tail.
			c.rect(15, 7, 16, 17, RED.shade);
			c.rect(15, 19, 16, 27, FLAME.shade);
			c.blob(10, 14, 1.6, 2, FLAME, true);
		},
	},
	// A water axolotl with frilly gills.
	blub: {
		name: "Splotl",
		type: "Water",
		typeColor: "#3f8fd6",
		outline: "#1f3a7a",
		pivot: { x: 66, y: 81 },
		motion: "flick",
		moves: { hit: "Burst Fire", smash: "Full Auto", guard: "Mist Wall", snack: "Big Gulp" },
		idle: "breathe",
		// An M4 carbine: a rail on top, a straight magazine and a tube stock.
		weapon: {
			sound: "m4",
			trail: ["#ffffff", "#6cc4f5"],
			tip: { x: 2, y: 72 },
			grip: { x: 47, y: 78 },
			draw: (c) => {
				// Barrel and the front sight post.
				c.rect(0, 23, 6, 23, GUNMETAL);
				c.rect(5, 21, 5, 22, GUNMETAL);
				// Handguard with rail slots, then the receiver with a rail on top.
				c.rect(6, 22, 11, 24, GUN_DARK);
				c.set(7, 23, GUNMETAL);
				c.set(9, 23, GUNMETAL);
				c.rect(12, 22, 17, 24, GUNMETAL);
				c.rect(11, 21, 16, 21, GUN_DARK);
				c.rect(12, 22, 17, 22, GUN_LIGHT);
				// Straight magazine and the grip.
				c.rect(12, 25, 13, 28, GUN_DARK);
				c.rect(15, 25, 16, 26, GUN_DARK);
				c.set(16, 27, GUN_DARK);
				// Buffer tube and stock.
				c.rect(18, 23, 19, 23, GUNMETAL);
				c.rect(20, 22, 23, 24, GUN_DARK);
				c.set(20, 25, GUN_DARK);
			},
		},
		draw: (c, view, layer) => {
			if (view === "front") {
				if (layer === "part") {
					c.blob(25.5, 26, 5, 2.4, AQUA);
					c.blob(26.5, 25, 3.5, 1.2, { ...AQUA, base: AQUA.light }, true);
					return;
				}
				if (layer === "blink") return closedEyes(c, 8, 14, AQUA.base);
				c.blob(15.5, 25, 6.5, 4.5, AQUA);
				c.blob(15.5, 26, 3.5, 2.5, CREAM);
				c.blob(10, 29, 2, 1.4, AQUA);
				c.blob(21, 29, 2, 1.4, AQUA);
				c.blob(15.5, 15, 10, 6.5, AQUA);
				for (const [gx, gy] of [
					[4.5, 10.5],
					[3.5, 14.5],
					[4.5, 18.5],
				] as const) {
					c.blob(gx, gy, 2.4, 1.5, GILL);
					c.blob(SIZE - 1 - gx, gy, 2.4, 1.5, GILL);
				}
				for (let x = 12; x <= 19; x++) c.set(x, x === 12 || x === 19 ? 17 : 18, INK);
				c.set(10, 17, PINK);
				c.set(21, 17, PINK);
				eyes(c, 8, 14);
				return;
			}
			if (layer === "part") {
				c.blob(15.5, 28, 3, 3, AQUA);
				c.blob(15.5, 29.5, 6, 1.6, { ...AQUA, base: AQUA.light }, true);
				return;
			}
			if (layer === "blink") return;
			c.blob(15.5, 23, 7, 6, AQUA);
			c.blob(15.5, 13, 10, 7, AQUA);
			for (const [gx, gy] of [
				[4.5, 9.5],
				[3.5, 13.5],
				[4.5, 17.5],
			] as const) {
				c.blob(gx, gy, 2.4, 1.5, GILL);
				c.blob(SIZE - 1 - gx, gy, 2.4, 1.5, GILL);
			}
			for (const [sx, sy] of [
				[12, 10],
				[19, 11],
				[14, 21],
				[18, 24],
			] as const)
				c.set(sx, sy, AQUA.light);
		},
	},
	// A fawn with a crown of leaves.
	sprig: {
		name: "Budeer",
		type: "Leaf",
		typeColor: "#4e9f5a",
		outline: "#4a2a1a",
		pivot: { x: 66, y: 69 },
		motion: "flick",
		moves: { hit: "No Scope", smash: "Quick Scope", guard: "Bark Shell", snack: "Graze" },
		idle: "breathe",
		// An AWP-style bolt-action sniper rifle: long barrel, big scope, thumbhole stock.
		weapon: {
			sound: "awp",
			trail: ["#ffffff", "#86d27a"],
			tip: { x: 2, y: 62 },
			grip: { x: 60, y: 69 },
			draw: (c) => {
				// Long thin barrel with a muzzle brake.
				c.rect(0, 19, 1, 21, GUNMETAL);
				c.rect(2, 20, 10, 20, GUNMETAL);
				// Olive body and the thumbhole stock.
				c.rect(10, 20, 24, 21, OLIVE.base);
				c.rect(10, 21, 24, 21, OLIVE.shade);
				c.rect(19, 22, 25, 23, OLIVE.base);
				c.rect(25, 19, 26, 23, OLIVE.shade);
				c.rect(21, 22, 22, 22, null);
				// Magazine, trigger grip and the bolt handle.
				c.rect(14, 22, 15, 23, GUN_DARK);
				c.rect(18, 22, 18, 24, OLIVE.shade);
				c.set(17, 19, STEEL_EDGE);
				// The scope, with a lens that catches the light.
				c.rect(11, 17, 18, 18, GUN_DARK);
				c.rect(10, 16, 10, 19, GUN_DARK);
				c.rect(19, 16, 19, 18, GUN_DARK);
				c.set(10, 17, TEAL.light);
				c.set(13, 19, GUN_DARK);
				c.set(16, 19, GUN_DARK);
			},
		},
		draw: (c, view, layer) => {
			if (view === "front") {
				if (layer === "part") {
					c.blob(22, 21.5, 1.8, 2.2, CREAM);
					return;
				}
				if (layer === "blink") return closedEyes(c, 12, 12, TAN.base);
				c.rect(11, 24, 12, 29, TAN.shade);
				c.rect(19, 24, 20, 29, TAN.shade);
				c.rect(11, 30, 12, 30, INK);
				c.rect(19, 30, 20, 30, INK);
				c.blob(15.5, 22, 6.5, 3.8, TAN);
				for (const [sx, sy] of [
					[12, 21],
					[18, 22],
					[15, 20],
				] as const)
					c.set(sx, sy, CREAM.base);
				c.blob(8, 10.5, 3.2, 1.6, TAN);
				c.blob(23, 10.5, 3.2, 1.6, TAN);
				c.set(8, 10, PINK);
				c.set(23, 10, PINK);
				c.blob(15.5, 13, 5.5, 5.5, TAN);
				c.blob(11.5, 5, 2, 3.2, LEAF);
				c.blob(19.5, 5, 2, 3.2, LEAF);
				c.rect(15, 6, 16, 8, LEAF.shade);
				c.blob(15.5, 16.5, 3, 2.2, { ...TAN, base: TAN.light }, true);
				c.rect(15, 16, 16, 16, INK);
				c.set(15, 18, INK);
				c.set(16, 18, INK);
				eyes(c, 12, 12);
				return;
			}
			if (layer === "part") {
				c.blob(15.5, 18, 1.8, 2.4, CREAM);
				return;
			}
			if (layer === "blink") return;
			c.rect(11, 25, 12, 30, TAN.shade);
			c.rect(19, 25, 20, 30, TAN.shade);
			c.blob(15.5, 22, 7, 4.5, TAN);
			for (const [sx, sy] of [
				[11, 21],
				[14, 19],
				[18, 20],
				[20, 23],
				[13, 24],
			] as const)
				c.set(sx, sy, CREAM.base);
			c.blob(8, 9.5, 3.2, 1.6, TAN);
			c.blob(23, 9.5, 3.2, 1.6, TAN);
			c.blob(15.5, 12, 5.8, 5.5, TAN);
			c.blob(11.5, 4, 2, 3.2, LEAF);
			c.blob(19.5, 4, 2, 3.2, LEAF);
			c.rect(15, 5, 16, 7, LEAF.shade);
		},
	},
	// A round, fuzzy moth with a lightning bolt on each wing.
	zip: {
		name: "Wattmoth",
		type: "Spark",
		typeColor: "#e0a320",
		outline: "#2d1f55",
		pivot: { x: 50, y: 50 },
		motion: "flap",
		moves: { hit: "Run and Gun", smash: "Rush B", guard: "Dust Veil", snack: "Nectar" },
		idle: "breathe",
		// A P90: a rounded bullpup with a clear magazine on top.
		weapon: {
			sound: "p90",
			trail: ["#4fd8d0", "#ffd23f"],
			tip: { x: 2, y: 66 },
			grip: { x: 34, y: 69 },
			draw: (c) => {
				// The rounded body: a sloped nose, the trigger loop at the front and a thumbhole at the back.
				c.rect(3, 20, 16, 24, GUN_DARK);
				c.rect(1, 21, 2, 22, GUN_DARK);
				c.set(0, 21, GUNMETAL);
				c.set(3, 24, null);
				c.set(16, 24, null);
				c.rect(5, 22, 7, 23, null);
				c.rect(12, 22, 14, 23, null);
				c.rect(3, 20, 16, 20, GUNMETAL);
				// The clear magazine on top, with rounds showing through.
				c.rect(4, 18, 15, 19, AQUA.light);
				c.rect(5, 19, 14, 19, AQUA.base);
				c.set(7, 18, GOLD.base);
				c.set(10, 18, GOLD.base);
				c.set(13, 18, GOLD.base);
			},
		},
		draw: (c, view, layer) => {
			const FUZZ = "#2d1f55";
			// Both wings on the left, then mirrored. Each upper wing carries a gold lightning bolt.
			const wings = (pattern: boolean) => {
				c.blob(7.5, 12, 6.5, 6, WING);
				c.blob(9, 21.5, 4.5, 4, WING);
				c.line(3, 8, 7, 6, WING.light);
				if (pattern) {
					c.set(8, 8, GOLD.base);
					c.rect(7, 9, 8, 9, GOLD.base);
					c.rect(6, 10, 9, 10, GOLD.base);
					c.rect(7, 11, 8, 11, GOLD.base);
					c.set(6, 12, GOLD.base);
					c.set(5, 13, GOLD.shade);
					c.blob(8.5, 21.5, 1.5, 1.5, TEAL, true);
					c.set(8, 21, TEAL.light);
				}
				c.mirror();
			};
			// Feathery antennae with a spark at each tip.
			const antennae = () => {
				c.line(13, 8, 11, 5, FUZZ);
				c.line(11, 5, 10, 3, FUZZ);
				c.set(10, 4, FUZZ);
				c.set(9, 2, TEAL.base);
				c.set(10, 2, TEAL.light);
				c.line(18, 8, 20, 5, FUZZ);
				c.line(20, 5, 21, 3, FUZZ);
				c.set(21, 4, FUZZ);
				c.set(22, 2, TEAL.base);
				c.set(21, 2, TEAL.light);
			};
			// A round striped abdomen under a fluffy cream collar.
			const body = (stripes: ReadonlyArray<number>) => {
				c.blob(15.5, 22.5, 3.8, 5, GOLD);
				for (const row of stripes) c.rect(13, row, 18, row, GOLD.shade);
				c.blob(15.5, 12, 5.5, 5, GOLD);
				c.blob(15.5, 17, 5.5, 2.2, CREAM);
				c.set(11, 18, CREAM.shade);
				c.set(20, 18, CREAM.shade);
			};
			if (view === "front") {
				if (layer === "part") return wings(true);
				if (layer === "blink") return closedEyes(c, 12, 11, GOLD.base, 3);
				antennae();
				body([22, 25]);
				eyes(c, 12, 11, 3);
				c.set(11, 14, PINK);
				c.set(20, 14, PINK);
				c.set(15, 15, INK);
				c.set(16, 15, INK);
				return;
			}
			if (layer === "part") return wings(false);
			if (layer === "blink") return;
			antennae();
			body([20, 23, 26]);
			c.rect(15, 8, 16, 15, GOLD.shade);
		},
	},
	// A lumpy white bean, drawn badly on purpose: a thick wobbly outline, googly eyes of two sizes and a smirk.
	sus: {
		name: "Amogus",
		type: "Sus",
		typeColor: "#ec4a5a",
		// The sprite carries its own wobbly ink, so it gets no extra outline.
		outline: null,
		pivot: { x: 50, y: 90 },
		motion: "flick",
		idle: "shuffle",
		moves: { hit: "Deagle Flick", smash: "Mag Dump", guard: "Act Natural", snack: "Sus Snack" },
		// A Desert Eagle, drawn as crookedly as its owner.
		weapon: {
			sound: "deagle",
			trail: ["#ffd23f", "#ffffff"],
			tip: { x: 2, y: 59 },
			grip: { x: 30, y: 69 },
			draw: (c) => {
				// The slab of a slide, with a wonky top edge.
				c.rect(1, 18, 10, 20, STEEL);
				c.rect(4, 17, 9, 17, STEEL);
				c.rect(1, 20, 10, 20, STEEL_EDGE);
				c.set(0, 19, INK);
				c.set(7, 18, WHITE);
				// Frame, trigger guard and a chunky grip.
				c.rect(5, 21, 10, 21, STEEL_EDGE);
				c.rect(5, 22, 6, 22, INK);
				c.rect(8, 22, 10, 23, GUNMETAL);
				c.rect(9, 24, 11, 25, GUNMETAL);
				c.set(11, 23, GUNMETAL);
			},
		},
		draw: (c, view, layer) => {
			if (layer === "part") return;
			if (view === "front") {
				// The other idle frame: the visor's glint slides to its left edge.
				drawAmogus(c, layer === "blink" ? AMOGUS_GLINT_LEFT : AMOGUS_FRONT);
				return;
			}
			if (layer === "blink") return;
			drawAmogus(c, AMOGUS_BACK);
		},
	},
};

/** Data URLs of one view's layers. A creature without a tail or wings has no `part`. */
export interface CreatureArt {
	readonly maybePart: Option.Option<string>;
	readonly body: string;
	readonly maybeBlink: Option.Option<string>;
	readonly weapon: string;
}

const render = (critter: Critter, view: View): CreatureArt => {
	const design = DESIGNS[critter];
	const layer = (name: Layer, outlined: boolean) => {
		const canvas = new Canvas();
		design.draw(canvas, view, name);
		if (outlined && design.outline !== null) canvas.outline(design.outline);
		return canvas;
	};
	const blink = layer("blink", false);
	const part = layer("part", true);
	const weapon = new Canvas();
	design.weapon.draw(weapon);
	if (view === "back") weapon.flipX();
	weapon.outline(INK);
	return {
		maybePart: part.isEmpty() ? Option.none() : Option.some(part.toUrl()),
		body: layer("body", true).toUrl(),
		maybeBlink: blink.isEmpty() ? Option.none() : Option.some(blink.toUrl()),
		weapon: weapon.toUrl(),
	};
};

/** A speckled egg for an empty seat. */
export const EGG_URL = (() => {
	const canvas = new Canvas();
	canvas.blob(15.5, 19, 8, 10.5, CREAM);
	for (const [x, y] of [
		[12, 14],
		[18, 17],
		[14, 22],
		[19, 24],
		[11, 20],
	] as const)
		canvas.rect(x, y, x + 1, y, GOLD.base);
	canvas.outline("#5a4a3a");
	return canvas.toUrl();
})();

export const CREATURES: ReadonlyArray<Critter> = ["cinder", "blub", "sprig", "zip", "sus"];

const ART = Object.fromEntries(
	CREATURES.map((critter) => [critter, { front: render(critter, "front"), back: render(critter, "back") }]),
) as Record<Critter, { readonly front: CreatureArt; readonly back: CreatureArt }>;

export const creatureArt = (critter: Critter, view: View) => ART[critter][view];

export const creatureInfo = (critter: Critter) => {
	const { name, type, typeColor, pivot, backPivot, motion, moves, idle, weapon } = DESIGNS[critter];
	return { name, type, typeColor, pivot, backPivot: backPivot ?? pivot, motion, moves, idle, weapon };
};

/** The type label of a move: attacks carry the creature's type. */
export const moveType = (critter: Critter, card: Card) =>
	card === "guard" ? "Guard" : card === "snack" ? "Heal" : DESIGNS[critter].type;

/** Pixel particle colors for a creature's attacks. */
export const particleColors: Readonly<Record<Critter, readonly [Color, Color]>> = {
	cinder: ["#ff8a3d", "#ffd23f"],
	blub: ["#6cc4f5", "#ffffff"],
	sprig: ["#86d27a", "#c6f0b4"],
	zip: ["#ffd23f", "#4fd8d0"],
	sus: ["#ff86b0", "#ffd23f"],
};
