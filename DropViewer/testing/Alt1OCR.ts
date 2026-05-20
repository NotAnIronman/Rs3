import { ImageData, ImgRef, Rect, RectLike } from "alt1";
import { ImageDetect } from "alt1";
import * as OCR from "alt1/ocr";

const rightclickfont = require("./imgs/rightclick.fontmeta.json");

const imgs = ImageDetect.webpackImages({
	topleft: require("./imgs/topleft.data.png"),
	botleft: require("./imgs/botleft.data.png"),
	topright: require("./imgs/topright.data.png")
});

type HoveredTextResult = {
	text: string;
	confidence: number;
	raw: ReturnType<typeof OCR.readLine> | null;
};

export type RightClickReadResult = {
	hovered: HoveredTextResult | null;
	nlines: number;
	pos: RectLike;
};

const CONFIG = {
	// Expected colors (approximate) for RS3 default theme
	hoverColor: { r: 40, g: 89, b: 112 },
	bgColor: { r: 10, g: 29, b: 38 },

	// Tolerances for color matching
	hoverTolerance: 40,
	bgTolerance: 40,
	blackMaxSum: 80, // allow anti-aliased dark text

	// Geometry assumptions (tuned but not brittle)
	lineHeight: 16,
	topPadding: 18,
	bottomPadding: 3,
	lineBoxHeight: 19,
	lineBoxXOffset: 3,
	lineBoxWidthPadding: 6,

	// Hover detection
	hoverLumThreshold: 200, // sum over small area, not single pixel
	hoverSampleWidth: 20,
	hoverSampleHeight: 6,

	// OCR
	// We map text to white (255) on dark background, so we tell OCR to look for white.
	ocrTextColor: [255, 255, 255] as [number, number, number],
	ocrMinSpacing: 0,
	ocrMaxSpacing: 14,
	ocrInvert: false // we already map text to white
};

/**
 * Compute Manhattan distance between a pixel and a target color.
 */
function colorDiff(
	r: number,
	g: number,
	b: number,
	target: { r: number; g: number; b: number }
): number {
	return Math.abs(r - target.r) + Math.abs(g - target.g) + Math.abs(b - target.b);
}

/**
 * Map a region of the right-click menu into a simplified color space:
 * - 0   = black/dark text
 * - 128 = hover/background region
 * - 255 = everything else
 *
 * This version is more tolerant to noise and anti-aliasing.
 */
export function mapRightclickColorSpace(src: ImageData, rect: RectLike): ImageData {
	const dest = new ImageData(rect.width, rect.height);
	const srcdata = src.data;
	const destdata = dest.data;

	for (let dy = 0; dy < rect.height; dy++) {
		for (let dx = 0; dx < rect.width; dx++) {
			const sx = rect.x + dx;
			const sy = rect.y + dy;

			if (sx < 0 || sy < 0 || sx >= src.width || sy >= src.height) {
				const idest = (dy * rect.width + dx) * 4;
				destdata[idest + 0] = 255;
				destdata[idest + 1] = 255;
				destdata[idest + 2] = 255;
				destdata[idest + 3] = 255;
				continue;
			}

			const isrc = (sy * src.width + sx) * 4;
			const r = srcdata[isrc + 0];
			const g = srcdata[isrc + 1];
			const b = srcdata[isrc + 2];

			const hoverdiff = colorDiff(r, g, b, CONFIG.hoverColor);
			const bgdiff = colorDiff(r, g, b, CONFIG.bgColor);
			const blacksum = r + g + b;

			let col: number;

			if (blacksum <= CONFIG.blackMaxSum) {
				// Dark text
				col = 0;
			} else if (hoverdiff <= CONFIG.hoverTolerance || bgdiff <= CONFIG.bgTolerance) {
				// Hover or background region
				col = 128;
			} else {
				// Everything else
				col = 255;
			}

			const idest = (dy * rect.width + dx) * 4;
			destdata[idest + 0] = col;
			destdata[idest + 1] = col;
			destdata[idest + 2] = col;
			destdata[idest + 3] = 255;
		}
	}

	return dest;
}

/**
 * Sample a small rectangle and return the sum of pixel values (brightness proxy).
 */
function sampleLuminanceArea(buf: ImageData, x: number, y: number, w: number, h: number): number {
	const data = buf.data;
	let sum = 0;
	let count = 0;

	for (let dy = 0; dy < h; dy++) {
		const sy = y + dy;
		if (sy < 0 || sy >= buf.height) continue;

		for (let dx = 0; dx < w; dx++) {
			const sx = x + dx;
			if (sx < 0 || sx >= buf.width) continue;

			const i = (sy * buf.width + sx) * 4;
			const r = data[i + 0];
			const g = data[i + 1];
			const b = data[i + 2];
			sum += r + g + b;
			count++;
		}
	}

	return count > 0 ? sum / count : 0;
}

/**
 * Compute number of lines based on menu height and configured geometry.
 * Uses floor to avoid overshooting.
 */
function computeLineCount(pos: RectLike): number {
	const usableHeight = pos.height - CONFIG.topPadding - CONFIG.bottomPadding;
	if (usableHeight <= 0) return 0;
	return Math.max(0, Math.floor(usableHeight / CONFIG.lineHeight));
}

export default class RightClickReader {
	pos: RectLike | null = null;

	/**
	 * Find the right-click menu rectangle on the screen.
	 */
	find(img: ImgRef): RectLike | null {
		const locs = img.findSubimage(imgs.topleft);
		if (!locs || locs.length === 0) {
			this.pos = null;
			return null;
		}

		const topleft = locs[0];

		const toprightMatches = img.findSubimage(
			imgs.topright,
			topleft.x,
			topleft.y,
			img.width - topleft.x,
			imgs.topright.height
		);

		const botleftMatches = img.findSubimage(
			imgs.botleft,
			topleft.x,
			topleft.y,
			imgs.botleft.width,
			img.height - topleft.y
		);

		if (!toprightMatches || toprightMatches.length === 0 || !botleftMatches || botleftMatches.length === 0) {
			this.pos = null;
			return null;
		}

		const topright = toprightMatches[0];
		const botleft = botleftMatches[0];

		// Slightly adjusted offsets, but kept minimal and consistent.
		const x = topleft.x;
		const y = topleft.y - 1;
		const width = topright.x - topleft.x + imgs.topright.width;
		const height = botleft.y - topleft.y + imgs.botleft.height;

		this.pos = { x, y, width, height };
		return this.pos;
	}

	/**
	 * Read the hovered line from the right-click menu.
	 * Expects a full-screen ImageData buffer (same coordinate space as ImgRef).
	 */
	read(buf: ImageData): RightClickReadResult {
		if (!this.pos) {
			throw new Error("RightClickReader.read called before find() or menu not found.");
		}

		const pos = this.pos;
		const nlines = computeLineCount(pos);

		let bestHovered: HoveredTextResult | null = null;

		const line0y = pos.y + CONFIG.topPadding;
		const linex = pos.x + CONFIG.lineBoxXOffset;
		const lineWidth = pos.width - CONFIG.lineBoxWidthPadding;

		for (let lineIndex = 0; lineIndex < nlines; lineIndex++) {
			const liney = line0y + CONFIG.lineHeight * lineIndex;

			// Sample a small area where the hover background should be.
			const hoverLum = sampleLuminanceArea(
				buf,
				linex,
				liney,
				CONFIG.hoverSampleWidth,
				CONFIG.hoverSampleHeight
			);

			if (hoverLum < CONFIG.hoverLumThreshold) {
				continue;
			}

			// Map the line region into simplified color space.
			const lineRect = new Rect(linex, liney, lineWidth, CONFIG.lineBoxHeight);
			const subbuf = mapRightclickColorSpace(buf, lineRect);

			const ocrResult = OCR.readLine(
				subbuf,
				rightclickfont,
				CONFIG.ocrTextColor,
				CONFIG.ocrMinSpacing,
				CONFIG.ocrMaxSpacing,
				CONFIG.ocrInvert
			);

			if (!ocrResult || !ocrResult.text || !ocrResult.text.trim()) {
				continue;
			}

			const text = ocrResult.text.trim();
			const confidence = typeof ocrResult.confidence === "number" ? ocrResult.confidence : 1;

			// Keep the best hovered line (highest confidence).
			if (!bestHovered || confidence > bestHovered.confidence) {
				bestHovered = {
					text,
					confidence,
					raw: ocrResult
				};
			}
		}

		return {
			hovered: bestHovered,
			nlines,
			pos
		};
	}
}
