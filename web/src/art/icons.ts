//! Pixel icons drawn from text grids in the game's palette. Symmetric icons
//! store their left half, mirrored at draw time.
import { pixelSvgDataUrl } from "./pixel-svg.ts";

/** The colors of the icons. */
const PALETTE = {
	ink: "#1b1230",
	plum: "#3a2a5e",
	mauve: "#7a63a8",
	cloud: "#f6efe2",
	white: "#ffffff",
	sky: "#86cdf5",
	skyDeep: "#5aa3e8",
	grass: "#86d27a",
	grassDeep: "#4e9f5a",
	sun: "#ffd23f",
	orange: "#ff8a3d",
	red: "#ec4a5a",
	pink: "#ff86b0",
	teal: "#4fd8d0",
	sand: "#f4c890",
	sandDeep: "#d9935b",
	blue: "#4f9cff",
	blueDeep: "#3567d6",
	night: "#120c26",
	nightSky: "#2b1f55",
} as const;

const P = PALETTE;

type Grid = ReadonlyArray<string>;
type Colors = Readonly<Record<string, string>>;

const mirror = (half: Grid): Grid => half.map((row) => row + [...row].reverse().join(""));

const toDataUrl = (grid: Grid, colors: Colors) =>
	pixelSvgDataUrl(grid[0]?.length ?? 0, grid.length, (x, y) => colors[grid[y]?.[x] ?? ""] ?? null);

// ICONS (12x12)

const ICON_ART = {
	hit: {
		half: [
			"......",
			".....k",
			"....ky",
			"..k.ky",
			"...kyy",
			".kkyyw",
			"...kyy",
			"..k.ky",
			"....ky",
			".....k",
			"......",
			"......",
		],
		colors: { k: P.ink, y: P.sun, w: P.white },
	},
	smash: {
		half: [
			".k...k",
			"..k.kr",
			"...kro",
			"kk.roo",
			".kroyy",
			".kroyw",
			".kroyw",
			".kroyy",
			"kk.roo",
			"...kro",
			"..k.kr",
			".k...k",
		],
		colors: { k: P.ink, r: P.red, o: P.orange, y: P.sun, w: P.white },
	},
	guard: {
		half: [
			".kkkkk",
			"kttttt",
			"kthttw",
			"kthttw",
			"kthwww",
			"kttttw",
			".ktttw",
			".ktttw",
			"..kttt",
			"...ktt",
			"....kk",
			"......",
		],
		colors: { k: P.ink, t: P.teal, h: P.cloud, w: P.white },
	},
	snack: {
		half: [
			"......",
			".....G",
			"...ggG",
			"..kkkk",
			".krrrr",
			"krhrrr",
			"krhrrr",
			"krrrrr",
			"krrrrr",
			".krrrr",
			"..kkkk",
			"......",
		],
		colors: { k: P.ink, r: P.red, h: P.pink, g: P.grass, G: P.grassDeep },
	},
	lock: {
		half: [
			"......",
			"...kkk",
			"..k...",
			"..k...",
			".kkkkk",
			".kyyyy",
			".kyhyy",
			".kyyyk",
			".kyyyk",
			".kyyyy",
			".kkkkk",
			"......",
		],
		colors: { k: P.ink, y: P.sun, h: P.cloud },
	},
	crown: {
		half: [
			"......",
			"......",
			".k....",
			".kk..k",
			".kyk.k",
			".kyykyk",
			".kyyyy",
			".kypyy",
			".kyyyy",
			".kkkkk",
			"......",
			"......",
		].map((row) => row.slice(0, 6)),
		colors: { k: P.ink, y: P.sun, p: P.pink },
	},
	eye: {
		half: [
			"......",
			"......",
			"......",
			"...kkk",
			"..kwww",
			".kwwkk",
			"kwwkek",
			".kwwkk",
			"..kwww",
			"...kkk",
			"......",
			"......",
		],
		colors: { k: P.ink, w: P.white, e: P.skyDeep },
	},
	heart: {
		half: [
			"......",
			"......",
			".kk...",
			"krrk.k",
			"krhrkr",
			"krrrrr",
			".krrrr",
			"..krrr",
			"...krr",
			"....kr",
			".....k",
			"......",
		],
		colors: { k: P.ink, r: P.red, h: P.pink },
	},
	clock: {
		half: [
			"......",
			"...kkk",
			"..kwww",
			".kwwwk",
			".kwwwk",
			"kwwwwk",
			"kwwwwk",
			".kwwww",
			".kwwww",
			"..kwww",
			"...kkk",
			"......",
		],
		colors: { k: P.ink, w: P.cloud },
	},
} as const;

/** Icons that are not symmetric, drawn as full 12x12 grids. */
const FULL_ICON_ART = {
	sound: {
		grid: [
			"............",
			".....k......",
			"....kk...y..",
			"..kkwk.y..y.",
			".kwwwk..y.y.",
			".kwwwk..y..y",
			".kwwwk..y..y",
			".kwwwk..y.y.",
			"..kkwk.y..y.",
			"....kk...y..",
			".....k......",
			"............",
		],
		colors: { k: P.ink, w: P.cloud, y: P.sun },
	},
	music: {
		grid: [
			"............",
			"......kkkkk.",
			"......kyyyk.",
			"......kkkkk.",
			"......k...k.",
			"......k...k.",
			"......k...k.",
			"...kkkk.kkkk",
			"..kyyyk.kyyk",
			"..kyyyk.kkkk",
			"...kkk......",
			"............",
		],
		colors: { k: P.ink, y: P.sun },
	},
	musicOff: {
		grid: [
			"...........r",
			"......kkkkr.",
			"......kwwrk.",
			"......kkrkk.",
			"......kr..k.",
			"......r...k.",
			".....rk...k.",
			"...krkk.kkkk",
			"..krwwk.kwwk",
			"..rwwwk.kkkk",
			".r.kkk......",
			"r...........",
		],
		colors: { k: P.ink, w: P.cloud, r: P.red },
	},
	muted: {
		grid: [
			"............",
			".....k......",
			"....kk......",
			"..kkwk.r...r",
			".kwwwk..r.r.",
			".kwwwk...r..",
			".kwwwk..r.r.",
			".kwwwk.r...r",
			"..kkwk......",
			"....kk......",
			".....k......",
			"............",
		],
		colors: { k: P.ink, w: P.cloud, r: P.red },
	},
} as const;

export type Icon = keyof typeof ICON_ART | keyof typeof FULL_ICON_ART;

const iconUrls = Object.fromEntries([
	...Object.entries(ICON_ART).map(([name, art]) => [name, toDataUrl(mirror(art.half), art.colors)] as const),
	...Object.entries(FULL_ICON_ART).map(([name, art]) => [name, toDataUrl(art.grid, art.colors)] as const),
]) as Record<Icon, string>;

export const iconUrl = (icon: Icon) => iconUrls[icon];
