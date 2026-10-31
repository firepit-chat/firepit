import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const setTheme = vi.fn();
const setAccent = vi.fn();

vi.mock("@teispace/next-themes", () => ({
    useTheme: () => ({
        theme: "latte",
        resolvedTheme: "latte",
        setTheme,
    }),
}));

vi.mock("@/components/accent-provider", () => ({
    useAccent: () => ({ accent: "blue", setAccent }),
}));

import { ThemeSettings } from "@/components/theme-settings";

describe("ThemeSettings", () => {
    beforeEach(() => {
        setTheme.mockClear();
        setAccent.mockClear();
    });

    it("renders a control for every palette and accent", () => {
        render(<ThemeSettings />);
        expect(screen.getAllByRole("radio")).toHaveLength(6 + 12);
    });

    it("calls setTheme with the palette id when a palette is picked", async () => {
        const user = userEvent.setup();
        render(<ThemeSettings />);
        await user.click(screen.getByRole("radio", { name: "Frappé" }));
        expect(setTheme).toHaveBeenCalledWith("frappe");
    });

    it("offers the original Firepit themes as options", async () => {
        const user = userEvent.setup();
        render(<ThemeSettings />);
        await user.click(screen.getByRole("radio", { name: "Classic Light" }));
        expect(setTheme).toHaveBeenCalledWith("classicLight");
        await user.click(screen.getByRole("radio", { name: "Classic Dark" }));
        expect(setTheme).toHaveBeenCalledWith("classicDark");
    });

    it("calls setAccent with the accent id when an accent is picked", async () => {
        const user = userEvent.setup();
        render(<ThemeSettings />);
        await user.click(screen.getByRole("radio", { name: "Teal" }));
        expect(setAccent).toHaveBeenCalledWith("teal");
    });
});
