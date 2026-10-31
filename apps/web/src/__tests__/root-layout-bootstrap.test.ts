import { describe, expect, it, beforeEach, vi } from "vitest";

/**
 * The root layout's pre-paint script decides the palette on a first visit, and
 * it runs before React mounts. A wrong branch here is a full-page flash or a
 * dark-mode user stuck on the light palette, and neither shows up in the React
 * tree, so the script string itself is evaluated here against a fake document.
 */
async function runBootstrap(options: {
    cookies?: Record<string, string>;
    prefersDark?: boolean;
    matchMediaAvailable?: boolean;
}) {
    const {
        PREFERENCES_BOOTSTRAP_SCRIPT,
    } = await import("@/lib/theme-bootstrap");

    const cookieJar = new Map<string, string>(
        Object.entries(options.cookies ?? {}),
    );

    Object.defineProperty(document, "cookie", {
        configurable: true,
        get: () =>
            [...cookieJar].map(([k, v]) => `${k}=${v}`).join("; "),
        set: (raw: string) => {
            const [pair] = raw.split(";");
            const index = pair.indexOf("=");
            cookieJar.set(pair.slice(0, index), pair.slice(index + 1));
        },
    });

    const media = vi.fn().mockReturnValue({
        matches: options.prefersDark ?? false,
    });
    if (options.matchMediaAvailable === false) {
        // Simulates a browser without matchMedia.
        Object.defineProperty(window, "matchMedia", {
            configurable: true,
            value: undefined,
        });
    } else {
        Object.defineProperty(window, "matchMedia", {
            configurable: true,
            value: media,
        });
    }

    document.documentElement.removeAttribute("data-theme");
    document.documentElement.removeAttribute("data-accent");

    // eslint-disable-next-line no-new-func -- executing the real emitted script
    new Function(PREFERENCES_BOOTSTRAP_SCRIPT)();

    return {
        theme: document.documentElement.getAttribute("data-theme"),
        accent: document.documentElement.getAttribute("data-accent"),
        cookies: Object.fromEntries(cookieJar),
    };
}

describe("pre-paint preferences bootstrap", () => {
    beforeEach(() => {
        Object.defineProperty(document, "cookie", {
            configurable: true,
            value: "",
        });
    });

    it("seeds a dark palette when the OS prefers dark", async () => {
        const result = await runBootstrap({ prefersDark: true });
        expect(result.theme).toBe("mocha");
        expect(result.cookies.theme).toBe("mocha");
    });

    it("seeds a light palette when the OS prefers light", async () => {
        const result = await runBootstrap({ prefersDark: false });
        expect(result.theme).toBe("latte");
        expect(result.cookies.theme).toBe("latte");
    });

    it("does not overwrite an existing theme choice", async () => {
        const result = await runBootstrap({
            cookies: { theme: "classicDark" },
            prefersDark: false,
        });
        expect(result.cookies.theme).toBe("classicDark");
        // Leaves the attribute to the theme library, which reads the same cookie.
        expect(result.theme).toBeNull();
    });

    it("keeps a stored accent and replaces an unknown one", async () => {
        const kept = await runBootstrap({ cookies: { "firepit-accent": "teal" } });
        expect(kept.accent).toBe("teal");

        const replaced = await runBootstrap({
            cookies: { "firepit-accent": "chartreuse" },
        });
        expect(replaced.accent).toBe("blue");
    });

    it("still seeds a theme when matchMedia is unavailable", async () => {
        const result = await runBootstrap({
            prefersDark: true,
            matchMediaAvailable: false,
        });
        // Cannot detect dark, so falls back to light rather than throwing.
        expect(result.theme).toBe("latte");
    });
});
