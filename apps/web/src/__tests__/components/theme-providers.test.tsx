import { describe, expect, it, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// The real library entry is used here (not the /client subpath) so this covers
// the exact module graph the app runs. vitest.config.ts aliases the library's
// extensionless `next/navigation` import to a stub.
import { ThemeProvider } from "@teispace/next-themes";

import { AccentProvider } from "@/components/accent-provider";
import { ThemeSettings } from "@/components/theme-settings";
import { THEME_NAMES, DEFAULT_THEME, isDarkTheme } from "@/lib/themes";

function renderTree() {
    return render(
        <ThemeProvider
            attribute="data-theme"
            defaultTheme={DEFAULT_THEME}
            enableSystem={false}
            themes={[...THEME_NAMES]}
        >
            <AccentProvider>
                <ThemeSettings />
            </AccentProvider>
        </ThemeProvider>,
    );
}

describe("theme + accent settings end to end", () => {
    beforeEach(() => {
        document.documentElement.removeAttribute("data-theme");
        document.documentElement.removeAttribute("data-accent");
        document.cookie = "firepit-accent=; path=/; max-age=0";
    });

    it("applies the picked palette to <html>", async () => {
        const user = userEvent.setup();
        renderTree();
        await act(async () => {
            await user.click(screen.getByRole("radio", { name: "Frappé" }));
        });
        expect(document.documentElement.getAttribute("data-theme")).toBe("frappe");
    });

    it("applies the picked accent to <html>", async () => {
        const user = userEvent.setup();
        renderTree();
        await act(async () => {
            await user.click(screen.getByRole("radio", { name: "Teal" }));
        });
        expect(document.documentElement.getAttribute("data-accent")).toBe("teal");
    });

    it("applies the original dark theme and its dark: utilities", async () => {
        const user = userEvent.setup();
        renderTree();
        await act(async () => {
            await user.click(screen.getByRole("radio", { name: "Classic Dark" }));
        });
        expect(document.documentElement.getAttribute("data-theme")).toBe(
            "classicDark",
        );
        expect(isDarkTheme("classicDark")).toBe(true);
        expect(isDarkTheme("classicLight")).toBe(false);
    });

    it("marks the current palette and accent as selected", async () => {
        const user = userEvent.setup();
        renderTree();

        await act(async () => {
            await user.click(screen.getByRole("radio", { name: "Mocha" }));
        });
        expect(
            screen.getByRole("radio", { name: "Mocha" }).getAttribute("aria-checked"),
        ).toBe("true");
        expect(
            screen.getByRole("radio", { name: "Latte" }).getAttribute("aria-checked"),
        ).toBe("false");
    });
});
