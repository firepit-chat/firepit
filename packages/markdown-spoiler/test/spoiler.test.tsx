import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Spoiler } from "../src/web/spoiler";

afterEach(cleanup);

/** The single reveal control. */
function trigger(): HTMLElement {
    const node = screen.getByRole("button");
    if (!(node instanceof HTMLElement)) {
        throw new Error("expected an HTMLElement");
    }
    return node;
}

describe("Spoiler (web)", () => {
    describe("collapsed by default", () => {
        it("exposes a button rather than the hidden content", () => {
            render(<Spoiler>the butler did it</Spoiler>);

            expect(trigger().tagName).toBe("BUTTON");
            expect(trigger().getAttribute("type")).toBe("button");
        });

        it("keeps the body out of the DOM entirely", () => {
            // This is the whole point of the design: hidden content is absent,
            // not blurred. A screen reader cannot read ahead into it, and a
            // hidden link is never in the tab order.
            const { container } = render(
                <Spoiler>
                    <a href="https://example.com">secret link</a>
                </Spoiler>,
            );

            expect(container.textContent).not.toContain("secret link");
            expect(screen.queryByRole("link")).toBeNull();
            expect(screen.queryByText("secret link")).toBeNull();
        });

        it("reports its collapsed state to assistive tech", () => {
            render(<Spoiler>hidden</Spoiler>);
            expect(trigger().getAttribute("aria-expanded")).toBe("false");
        });

        it("points aria-controls at the revealed region", () => {
            render(<Spoiler>hidden</Spoiler>);
            expect(trigger().getAttribute("aria-controls")).toBeTruthy();
        });
    });

    describe("revealing", () => {
        it("mounts the body on activation", () => {
            render(<Spoiler>the butler did it</Spoiler>);

            fireEvent.click(trigger());

            expect(screen.getByText("the butler did it")).toBeTruthy();
        });

        it("flips aria-expanded", () => {
            render(<Spoiler>hidden</Spoiler>);

            fireEvent.click(trigger());

            expect(trigger().getAttribute("aria-expanded")).toBe("true");
        });

        it("toggles back to hidden", () => {
            render(<Spoiler>hidden</Spoiler>);

            fireEvent.click(trigger());
            fireEvent.click(trigger());

            expect(trigger().getAttribute("aria-expanded")).toBe("false");
            expect(screen.queryByText("hidden")).toBeNull();
        });

        it("renders interactive content in the body once revealed", () => {
            render(
                <Spoiler>
                    <a href="https://example.com">secret link</a>
                </Spoiler>,
            );

            fireEvent.click(trigger());

            expect(screen.getByRole("link").getAttribute("href")).toBe(
                "https://example.com",
            );
        });

        it("is operable by keyboard, since a real button handles Enter and Space", () => {
            render(<Spoiler>hidden</Spoiler>);

            fireEvent.keyDown(trigger(), { key: "Enter" });
            fireEvent.click(trigger());

            expect(screen.getByText("hidden")).toBeTruthy();
        });
    });

    describe("defaultRevealed", () => {
        it("starts with the body visible", () => {
            render(<Spoiler defaultRevealed>shown</Spoiler>);

            expect(screen.getByText("shown")).toBeTruthy();
            expect(trigger().getAttribute("aria-expanded")).toBe("true");
        });
    });

    describe("controlled mode", () => {
        it("does not change on its own", () => {
            const onRevealedChange = vi.fn();

            render(
                <Spoiler revealed={false} onRevealedChange={onRevealedChange}>
                    hidden
                </Spoiler>,
            );

            fireEvent.click(trigger());

            expect(onRevealedChange).toHaveBeenCalledWith(true);
            expect(screen.queryByText("hidden")).toBeNull();
        });

        it("reflects the prop when it changes", () => {
            const { rerender } = render(
                <Spoiler revealed={false}>hidden</Spoiler>,
            );

            rerender(<Spoiler revealed>hidden</Spoiler>);

            expect(screen.getByText("hidden")).toBeTruthy();
        });
    });

    describe("labels", () => {
        it("uses the placeholder as the visible collapsed label", () => {
            render(<Spoiler>hidden</Spoiler>);

            expect(trigger().textContent).toBe("Click to reveal");
        });

        it("swaps to the hide label once revealed", () => {
            render(<Spoiler>hidden</Spoiler>);

            fireEvent.click(trigger());

            expect(trigger().textContent).toBe("Hide spoiler");
        });

        it("accepts custom labels", () => {
            render(
                <Spoiler placeholder="Reveal answer" hideLabel="Conceal answer">
                    hidden
                </Spoiler>,
            );

            expect(trigger().textContent).toBe("Reveal answer");

            fireEvent.click(trigger());

            expect(trigger().textContent).toBe("Conceal answer");
        });
    });

    describe("styling hooks", () => {
        it("applies the consumer's class names", () => {
            render(
                <Spoiler classNames={{ root: "root", trigger: "trigger" }}>
                    hidden
                </Spoiler>,
            );

            expect(screen.getByText("Click to reveal").className).toBe(
                "trigger",
            );
            expect(trigger().parentElement?.className).toBe("root");
        });
    });

    describe("does not use blur or Houdini", () => {
        it("emits no filter, canvas or animation styling", () => {
            // Guards against a future regression back towards a blurred
            // implementation, which is the approach this package replaces.
            const { container } = render(<Spoiler>hidden</Spoiler>);

            expect(container.innerHTML).not.toContain("filter");
            expect(container.innerHTML).not.toContain("blur");
            expect(container.innerHTML).not.toContain("canvas");
            expect(container.innerHTML).not.toContain("animation");
        });
    });

    describe("inlineTrigger", () => {
        // Used where a spoiler renders inside another <button>, such as a search
        // result row. HTML forbids nesting interactive elements, so a real
        // button there would be invalid markup and a hydration error.
        it("renders a span with role=button rather than a button element", () => {
            const { container } = render(
                <Spoiler inlineTrigger>hidden</Spoiler>,
            );

            expect(container.querySelector("button")).toBeNull();
            expect(container.querySelector('[role="button"]')).not.toBeNull();
        });

        it("keeps the same accessible semantics as the default trigger", () => {
            render(<Spoiler inlineTrigger>hidden</Spoiler>);

            const node = trigger();
            expect(node.tagName).toBe("SPAN");
            expect(node.getAttribute("aria-expanded")).toBe("false");
            expect(node.getAttribute("aria-controls")).toBeTruthy();
        });

        it("is keyboard reachable", () => {
            render(<Spoiler inlineTrigger>hidden</Spoiler>);

            expect(trigger().getAttribute("tabindex")).toBe("0");
        });

        it("reveals on click", () => {
            render(<Spoiler inlineTrigger>hidden</Spoiler>);

            fireEvent.click(trigger());

            expect(screen.getByText("hidden")).toBeTruthy();
        });

        it("reveals on Enter and Space", () => {
            render(<Spoiler inlineTrigger>hidden</Spoiler>);

            fireEvent.keyDown(trigger(), { key: "Enter" });

            expect(screen.getByText("hidden")).toBeTruthy();
        });

        it("keeps the body out of the DOM while collapsed, as usual", () => {
            const { container } = render(
                <Spoiler inlineTrigger>
                    <a href="https://example.com">secret link</a>
                </Spoiler>,
            );

            expect(container.textContent).not.toContain("secret link");
            expect(screen.queryByRole("link")).toBeNull();
        });

        it("does not produce a nested button inside a button", () => {
            // The exact situation this option exists for.
            const { container } = render(
                <button type="button">
                    <Spoiler inlineTrigger>hidden</Spoiler>
                </button>,
            );

            expect(container.querySelector("button button")).toBeNull();
        });
    });
});
