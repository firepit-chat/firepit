/**
 * Measures each preset frame's artwork in `assets/` and reports the inset the
 * avatar needs to sit inside the frame's opening.
 *
 * Run this instead of eyeballing the numbers: `avatarInsetPercent` in
 * `src/lib/preset-frames.ts` is consumed by both clients, and a wrong value
 * either overlaps the frame art or leaves a visible gap.
 *
 *   bun scripts/measure-avatar-frames.ts
 *
 * For a frame drawn as a ring, the avatar is the largest circle that fits
 * entirely inside the transparent opening. A frame whose art crosses the centre
 * (a snowflake, a wreath) has no such circle; it is reported as `overlay`,
 * meaning the portrait should be full-bleed with the art drawn on top.
 *
 * This is a diagnostic, not an oracle: it reports what the artwork measures,
 * and `src/lib/preset-frames.test.ts` asserts the shipped values against it
 * with a documented override list for frames drawn differently (the spring
 * flowers cover their opening with a solid disc rather than leaving it empty).
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { inflateSync } from "node:zlib";

type Frame = {
    file: string;
    width: number;
    height: number;
    /** Largest circle, centred on the frame, that fits in the opening. */
    avatarRadius: number;
    insetPercent: number;
    /** True when the art crosses the centre, so no centred avatar fits. */
    overlay: boolean;
    /** True when the artwork reaches the canvas edge. */
    artTouchesEdge: boolean;
};

/** Minimal 8-bit RGBA PNG reader: enough for these non-interlaced assets. */
function decodePng(buffer: Buffer) {
    let pos = 8; // skip signature
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
            if (data.readUInt8(12) !== 0) {
                throw new Error("interlaced PNGs are not supported");
            }
        } else if (type === "IDAT") {
            idat.push(data);
        } else if (type === "IEND") {
            break;
        }
        pos += 12 + length;
    }

    if (bitDepth !== 8) {
        throw new Error(`unsupported bit depth ${bitDepth}`);
    }
    const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
    if (!channels) {
        throw new Error(`unsupported colour type ${colorType}`);
    }

    const raw = inflateSync(Buffer.concat(idat));
    const stride = width * channels;
    const out = Buffer.alloc(height * stride);

    // Undo the per-scanline filters.
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
            let value = line[x];
            switch (filter) {
                case 1:
                    value += a;
                    break;
                case 2:
                    value += b;
                    break;
                case 3:
                    value += (a + b) >> 1;
                    break;
                case 4: {
                    const p = a + b - c;
                    const pa = Math.abs(p - a);
                    const pb = Math.abs(p - b);
                    const pc = Math.abs(p - c);
                    value += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
                    break;
                }
                default:
                    break;
            }
            out[y * stride + x] = value & 0xff;
        }
    }

    const alphaAt = (x: number, y: number) =>
        colorType === 6 ? out[y * stride + x * 4 + 3] : 255; // no alpha channel: fully opaque
    return { width, height, alphaAt };
}

function measure(file: string, assetDir: string): Frame {
    const { width, height, alphaAt } = decodePng(
        readFileSync(join(assetDir, file)),
    );
    const isArt = (x: number, y: number) => alphaAt(x, y) > 24;

    const artTouchesEdge =
        Array.from({ length: width }, (__, x) => isArt(x, 0)).some(Boolean) ||
        Array.from({ length: width }, (__, x) => isArt(x, height - 1)).some(
            Boolean,
        ) ||
        Array.from({ length: height }, (__, y) => isArt(0, y)).some(Boolean) ||
        Array.from({ length: height }, (__, y) => isArt(width - 1, y)).some(
            Boolean,
        );

    const cx = width / 2;
    const cy = height / 2;
    const fits = (r: number) => {
        const steps = Math.max(240, Math.round((2 * Math.PI * r) / 1.5));
        for (let i = 0; i < steps; i++) {
            const t = (2 * Math.PI * i) / steps;
            const x = Math.round(cx + r * Math.cos(t));
            const y = Math.round(cy + r * Math.sin(t));
            if (x < 0 || y < 0 || x >= width || y >= height) {
                return false;
            }
            if (isArt(x, y)) {
                return false;
            }
        }
        return true;
    };

    let lo = 0;
    let hi = Math.min(width, height) / 2;
    for (let i = 0; i < 40; i++) {
        const mid = (lo + hi) / 2;
        if (fits(mid)) {
            lo = mid;
        } else {
            hi = mid;
        }
    }

    const radius = lo;
    // A tiny "largest circle" means the centre is covered by art: there is no
    // opening for a portrait to sit in.
    const overlay = radius < Math.min(width, height) * 0.02;

    return {
        file,
        width,
        height,
        avatarRadius: radius,
        insetPercent: overlay
            ? 0
            : Math.round(((cx - radius) / width) * 1000) / 10,
        overlay,
        artTouchesEdge,
    };
}

const assetDir = join(process.cwd(), "assets");
const frames = readdirSync(assetDir)
    .filter((f) => f.endsWith(".png"))
    .sort()
    .map((f) => measure(f, assetDir));

console.log(
    `${"asset".padEnd(28)}${"canvas".padStart(10)}${"inset%".padStart(8)}  notes`,
);
for (const f of frames) {
    const notes: string[] = [];
    if (f.overlay) {
        notes.push("OVERLAY (art crosses centre)");
    }
    if (f.artTouchesEdge) {
        notes.push("art touches canvas edge");
    }
    console.log(
        `${
            f.file.padEnd(28) +
            `${f.width}x${f.height}`.padStart(10) +
            `${f.insetPercent.toFixed(1)}`.padStart(8)
        }  ${notes.join(", ")}`,
    );
}
