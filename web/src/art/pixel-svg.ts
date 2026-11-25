//! Turns a grid of colored pixels into an SVG data URL. Every piece of art in
//! the game goes through here, so all of it shares one crisp pixel look.

/** The color at a pixel, or `null` for a transparent one. */
export type ColorAt = (x: number, y: number) => string | null;

/**
 * An SVG data URL of a `width` by `height` pixel grid. Runs of one color in a
 * row become one rect, which keeps the URLs small.
 */
export const pixelSvgDataUrl = (width: number, height: number, colorAt: ColorAt) => {
	const rects: Array<string> = [];
	for (let y = 0; y < height; y++) {
		let x = 0;
		while (x < width) {
			const color = colorAt(x, y);
			let end = x + 1;
			while (end < width && colorAt(end, y) === color) end++;
			if (color !== null) rects.push(`<rect x="${x}" y="${y}" width="${end - x}" height="1.02" fill="${color}"/>`);
			x = end;
		}
	}
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" shape-rendering="crispEdges">${rects.join("")}</svg>`;
	return `data:image/svg+xml,${encodeURIComponent(svg)}`;
};
