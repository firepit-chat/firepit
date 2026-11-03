"use client";

import { useTheme } from "@teispace/next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";

import { isDarkTheme } from "@/lib/themes";

const Toaster = ({ ...props }: ToasterProps) => {
    const { resolvedTheme } = useTheme();

    return (
        <Sonner
            className="toaster group"
            style={
                {
                    "--normal-bg": "var(--popover)",
                    "--normal-text": "var(--popover-foreground)",
                    "--normal-border": "var(--border)",
                } as React.CSSProperties
            }
            // Sonner only understands "light" and "dark", so the four palettes
            // have to be collapsed onto that axis instead of cast through.
            theme={isDarkTheme(resolvedTheme) ? "dark" : "light"}
            {...props}
        />
    );
};

export { Toaster };
