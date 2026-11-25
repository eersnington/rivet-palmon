//! A 32x32 pixel canvas for drawing creatures from shaded shapes. It is a
//! mutable builder used once per sprite while the art loads, then thrown away.
import { pixelSvgDataUrl } from "./pixel-svg.ts";

export const SIZE = 32;

export type Color = string;

/** A base color with a shadow and a highlight, lit from the upper left. */
export interface Tone3 {
	readonly base: Color;
	readonly shade: Color;
	readonly light: Color;
}

export class Canvas {
	readonly px: Array<Color | null> = Array.from({ length: SIZE * SIZE }, () => null);

	/** Paints one pixel. `null` erases it, to cut a hole such as a trigger loop. */
	set(x: number, y: number, color: Color | null) {
		const ix = Math.round(x);
		const iy = Math.round(y);
		if (ix < 0 || iy < 0 || ix >= SIZE || iy >= SIZE) return;
		this.px[iy * SIZE + ix] = color;
	}

	get(x: number, y: number) {
		if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return null;
		return this.px[y * SIZE + x] ?? null;
	}

	/** A shaded ellipse: shade toward the lower right, a small highlight at the upper left. */
	blob(cx: number, cy: number, rx: number, ry: number, tone: Tone3, flat = false) {
		for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
			for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
				const nx = (x + 0.5 - (cx + 0.5)) / rx;
				const ny = (y + 0.5 - (cy + 0.5)) / ry;
				if (nx * nx + ny * ny > 1) continue;
				let color = tone.base;
				if (!flat) {
					if (nx * 0.55 + ny * 0.85 > 0.5) color = tone.shade;
					else if ((nx + 0.38) ** 2 + (ny + 0.45) ** 2 < 0.09) color = tone.light;
				}
				this.set(x, y, color);
			}
		}
	}

	rect(x0: number, y0: number, x1: number, y1: number, color: Color | null) {
		for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.set(x, y, color);
	}

	line(x0: number, y0: number, x1: number, y1: number, color: Color) {
		const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
		for (let i = 0; i <= steps; i++) {
			const t = steps === 0 ? 0 : i / steps;
			this.set(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, color);
		}
	}

	tri(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, color: Color) {
		const sign = (px: number, py: number, qx: number, qy: number, rx: number, ry: number) =>
			(px - rx) * (qy - ry) - (qx - rx) * (py - ry);
		for (let y = Math.floor(Math.min(ay, by, cy)); y <= Math.ceil(Math.max(ay, by, cy)); y++) {
			for (let x = Math.floor(Math.min(ax, bx, cx)); x <= Math.ceil(Math.max(ax, bx, cx)); x++) {
				const d1 = sign(x, y, ax, ay, bx, by);
				const d2 = sign(x, y, bx, by, cx, cy);
				const d3 = sign(x, y, cx, cy, ax, ay);
				const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
				const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
				if (!(hasNeg && hasPos)) this.set(x, y, color);
			}
		}
	}

	/** Flips the whole picture left to right. */
	flipX() {
		for (let y = 0; y < SIZE; y++) {
			const row = this.px.slice(y * SIZE, (y + 1) * SIZE).reverse();
			for (let x = 0; x < SIZE; x++) this.px[y * SIZE + x] = row[x] ?? null;
		}
	}

	/** Mirrors the left half onto the right, for symmetric views. */
	mirror() {
		for (let y = 0; y < SIZE; y++) {
			for (let x = 0; x < SIZE / 2; x++) {
				const left = this.get(x, y);
				if (left !== null) this.set(SIZE - 1 - x, y, left);
			}
		}
	}

	/** Draws `color` on every empty pixel next to a filled one. */
	outline(color: Color) {
		const filled = this.px.map((pixel) => pixel !== null);
		for (let y = 0; y < SIZE; y++) {
			for (let x = 0; x < SIZE; x++) {
				if (filled[y * SIZE + x]) continue;
				const near = [
					[1, 0],
					[-1, 0],
					[0, 1],
					[0, -1],
				].some(([dx, dy]) => {
					const nx = x + dx!;
					const ny = y + dy!;
					return nx >= 0 && ny >= 0 && nx < SIZE && ny < SIZE && filled[ny * SIZE + nx];
				});
				if (near) this.px[y * SIZE + x] = color;
			}
		}
	}

	/** An SVG data URL of the picture. */
	toUrl() {
		return pixelSvgDataUrl(SIZE, SIZE, (x, y) => this.get(x, y));
	}

	isEmpty() {
		return this.px.every((pixel) => pixel === null);
	}
}
