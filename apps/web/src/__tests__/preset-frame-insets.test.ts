import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { inflateSync } from "node:zlib";

import { getAllPresetFrames, getPresetFrameById } from "../lib/preset-frames";

/**
 * `avatarInsetPercent` decides whether the portrait lines up with a frame's
 * opening, so a wrong value is visible in the UI. These tests measure the
 * artwork in `assets/` and hold the shipped values to it.
 *
 * Two frames are deliberately measured a different way, documented in
 * OVERRIDES below.
 */

/** Minimal 8-bit RGBA PNG reader — enough for these non-interlaced assets. */
function decodeAlpha(buffer: Buffer) {
    let pos = 8;
    let width = 0;
    let height = 0;
    let bitDepth = 0;
    let colorType = 0;
    const idat: Buffer[] = [];
    while (pos < buffer.length) {
        const length = buffer.readUInt32BE(pos);
        const type = buffer.toString("ascii", pos + 4, pos + 8);
        const data = buffer.subarray(pos + 8, pos + 8 + length);
        if (type === "IHDR") {
            width = data.readUInt32BE(0);
            height = data.readUInt32BE(4);
            bitDepth = data.readUInt8(8);
            colorType = data.readUInt8(9);
        } else if (type === "IDAT") idat.push(data);
        else if (type === "IEND") break;
        pos += 12 + length;
    }
    if (bitDepth !== 8) throw new Error(`unsupported bit depth ${bitDepth}`);
    const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
    if (!channels) throw new Error(`unsupported colour type ${colorType}`);

    const raw = inflateSync(Buffer.concat(idat));
    const stride = width * channels;
    const out = Buffer.alloc(height * stride);
    for (let y = 0; y < height; y++) {
        const filter = raw[y * (stride + 1)];
        const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
        for (let x = 0; x < stride; x++) {
            const a = x >= channels ? out[y * stride + x - channels] : 0;
            const b = y > 0 ? out[(y - 1) * stride + x] : 0;
            const c =
                x >= channels && y > 0
                    ? out[(y - 1) * stride + x - channels]
                    : 0;
            let v = line[x];
            if (filter === 1) v += a;
            else if (filter === 2) v += b;
            else if (filter === 3) v += (a + b) >> 1;
            else if (filter === 4) {
                const p = a + b - c;
                const pa = Math.abs(p - a);
                const pb = Math.abs(p - b);
                const pc = Math.abs(p - c);
                v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
            }
            out[y * stride + x] = v & 0xff;
        }
    }
    return {
        width,
        height,
        alphaAt: (x: number, y: number) =>
            colorType === 6 ? out[y * stride + x * 4 + 3] : 255,
    };
}

/** Largest circle, centred, that fits in the frame's transparent opening. */
function measuredHoleInsetPercent(assetFile: string): number {
    const { width, height, alphaAt } = decodeAlpha(
        readFileSync(join(process.cwd(), "assets", assetFile)),
    );
    const cx = width / 2;
    const cy = height / 2;
    const isArt = (x: number, y: number) => alphaAt(x, y) > 24;
    const fits = (r: number) => {
        const steps = Math.max(360, Math.round((2 * Math.PI * r) / 1.2));
        for (let i = 0; i < steps; i++) {
            const t = (2 * Math.PI * i) / steps;
            const x = Math.round(cx + r * Math.cos(t));
            const y = Math.round(cy + r * Math.sin(t));
            if (x < 0 || y < 0 || x >= width || y >= height) return false;
            if (isArt(x, y)) return false;
        }
        return true;
    };
    let lo = 0;
    let hi = Math.min(width, height) / 2;
    for (let i = 0; i < 40; i++) {
        const mid = (lo + hi) / 2;
        if (fits(mid)) lo = mid;
        else hi = mid;
    }
    return ((cx - lo) / width) * 100;
}

/**
 * Frames whose opening is not the largest empty circle.
 *
 * The spring flowers draw a solid pink disc with faint decoration inside it.
 * The disc is the opening: the portrait covers it and hides what is inside, so
 * the empty circle measures smaller than the intended edge. The two overlay
 * frames have no centred opening at all.
 */
const OVERRIDES: Record<string, { insetPercent: number; reason: string }> = {
    "seasonal-spring-2025": {
        insetPercent: 24,
        reason: "covers the 135px centre disc",
    },
    "seasonal-spring-2026": {
        insetPercent: 25,
        reason: "covers the 126px centre disc",
    },
    "seasonal-fall-2025": {
        insetPercent: 0,
        reason: "overlay: art crosses the centre",
    },
    "seasonal-winter-2025": {
        insetPercent: 0,
        reason: "overlay: art crosses the centre",
    },
};

describe("preset frame insets match the artwork", () => {
    const frames = getAllPresetFrames();

    it("has an asset for every preset frame", () => {
        for (const frame of frames) {
            expect(
                () =>
                    readFileSync(
                        join(
                            process.cwd(),
                            "assets",
                            `${frame.storageFileId}.png`,
                        ),
                    ),
                `${frame.id} has no asset in assets/`,
            ).not.toThrow();
        }
    });

    for (const frame of frames) {
        const override = OVERRIDES[frame.id];

        it(`${frame.id} has the inset its artwork needs`, () => {
            expect(frame.avatarInsetPercent).toBeDefined();
            const shipped = frame.avatarInsetPercent as number;

            if (override) {
                expect(shipped, override.reason).toBe(override.insetPercent);
                return;
            }

            // Allow a point of rounding; anything larger is a real mismatch.
            const measured = measuredHoleInsetPercent(
                `${frame.storageFileId}.png`,
            );
            expect(
                Math.abs(shipped - measured),
                `${frame.id} ships inset ${shipped}% but the artwork measures ${measured.toFixed(1)}%. ` +
                    `Run \`bun run scripts/measure-avatar-frames.ts\` to check.`,
            ).toBeLessThanOrEqual(1);
        });
    }

    it("marks exactly the frames with no opening as overlays", () => {
        const overlays = frames
            .filter((f) => f.frameStyle === "overlay")
            .map((f) => f.id)
            .sort();
        expect(overlays).toEqual(
            Object.entries(OVERRIDES)
                .filter(([, v]) => v.insetPercent === 0)
                .map(([id]) => id)
                .sort(),
        );
    });

    it("never asks for an inset past what the components allow", () => {
        // The Avatar components clamp at 45%; a frame needing more would be
        // silently rendered wrong.
        for (const frame of frames) {
            expect(frame.avatarInsetPercent ?? 0).toBeLessThanOrEqual(45);
        }
    });

    it("gives every frame a positive opening unless it is an overlay", () => {
        for (const frame of frames) {
            if (frame.frameStyle === "overlay") continue;
            expect(
                frame.avatarInsetPercent ?? 0,
                `${frame.id} would render with no opening`,
            ).toBeGreaterThan(0);
        }
    });

    it("keeps getPresetFrameById consistent with the list", () => {
        for (const frame of frames) {
            expect(getPresetFrameById(frame.id)?.avatarInsetPercent).toBe(
                frame.avatarInsetPercent,
            );
        }
    });
});
