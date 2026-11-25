//! The battle scene: tileable pixel strips for clouds and hills, and the two
//! grass platforms. Day and night share shapes and swap colors.

import { type ColorAt, pixelSvgDataUrl } from "./pixel-svg.ts";

/** A CSS `url(...)` of the pixel grid, for a background image. */
const svgUrl = (width: number, height: number, colorAt: ColorAt) => `url("${pixelSvgDataUrl(width, height, colorAt)}")`;

const TILE = 128;

/** Puffy clouds that tile left to right. */
const clouds = (body: string, shade: string) => {
	const puffs = [
		[14, 9, 9, 4],
		[24, 7, 7, 5],
		[33, 10, 8, 3.5],
		[78, 17, 7, 3],
		[86, 15, 6, 4],
		[94, 18, 6, 2.5],
	] as const;
	return svgUrl(TILE, 28, (x, y) => {
		let inside = false;
		let low = false;
		for (const [cx, cy, rx, ry] of puffs) {
			const nx = (x - cx) / rx;
			const ny = (y - cy) / ry;
			if (nx * nx + ny * ny <= 1) {
				inside = true;
				if (ny > 0.45) low = true;
			}
		}
		return inside ? (low ? shade : body) : null;
	});
};

/** A hill line that repeats every tile, so the strip can repeat. */
const hills = (height: number, base: number, amplitude: number, top: string, body: string, seed: number) =>
	svgUrl(TILE, height, (x, y) => {
		const wave = Math.sin((x / TILE) * Math.PI * 2 * 2 + seed) * amplitude + Math.sin((x / TILE) * Math.PI * 2 * 5 + seed * 3) * (amplitude / 3);
		const surface = Math.round(base - wave);
		if (y < surface) return null;
		return y < surface + 2 ? top : body;
	});

/** An oval of grass with a dirt rim, seen from a little above. */
const platform = (width: number, height: number, grass: string, grassLight: string, edge: string, dirt: string) =>
	svgUrl(width, height, (x, y) => {
		const cx = width / 2 - 0.5;
		const top = height * 0.62;
		const nx = (x - cx) / (width / 2);
		const ny = (y - top / 2) / (top / 2);
		if (nx * nx + ny * ny <= 1) {
			if (ny < -0.2 && nx < 0.1 && (x + y) % 5 === 0) return grassLight;
			return ny > 0.55 ? edge : grass;
		}
		const below = y > top / 2 && y < height && nx * nx <= 1 - ((y - top) / (height - top)) ** 2 * 0.6;
		return below && y >= top / 2 ? dirt : null;
	});

const SCENE = {
	day: {
		clouds: clouds("#ffffff", "#d8eefc"),
		far: hills(40, 18, 6, "#7fc6a4", "#a8dcc0", 1),
		near: hills(32, 14, 5, "#4e9f5a", "#86d27a", 4),
		nearPlatform: platform(64, 16, "#b2e69c", "#e2f8d4", "#4e9f5a", "#b8774a"),
		farPlatform: platform(48, 12, "#b2e69c", "#e2f8d4", "#4e9f5a", "#b8774a"),
	},
	night: {
		clouds: clouds("#4a3a82", "#3a2a6a"),
		far: hills(40, 18, 6, "#4a3a82", "#3a2a6a", 1),
		near: hills(32, 14, 5, "#2f6b44", "#3f8a55", 4),
		nearPlatform: platform(64, 16, "#3f8a55", "#86d27a", "#2f6b44", "#5a3a2a"),
		farPlatform: platform(48, 12, "#3f8a55", "#86d27a", "#2f6b44", "#5a3a2a"),
	},
};

/** CSS variables that hand the scene art to the stylesheet. */
export const sceneStyle: Record<string, string> = {
	"--clouds-day": SCENE.day.clouds,
	"--far-day": SCENE.day.far,
	"--near-day": SCENE.day.near,
	"--plat-near-day": SCENE.day.nearPlatform,
	"--plat-far-day": SCENE.day.farPlatform,
	"--clouds-night": SCENE.night.clouds,
	"--far-night": SCENE.night.far,
	"--near-night": SCENE.night.near,
	"--plat-near-night": SCENE.night.nearPlatform,
	"--plat-far-night": SCENE.night.farPlatform,
};
