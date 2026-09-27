import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import "../index.css";
import Providers from "@/components/providers";
import { AppLayout } from "@/components/app-layout";
import { OfflineBanner } from "@/components/offline-banner";
import { ResourceHints } from "@/components/resource-hints";
import { ServiceWorkerRegistration } from "@/components/service-worker-registration";

const geistSans = Geist({
    variable: "--font-geist-sans",
    subsets: ["latin"],
    display: "swap", // Prevent font blocking render
    preload: true, // Preload critical font
    fallback: ["system-ui", "arial"], // System font fallback for faster initial render
    adjustFontFallback: true, // Minimize layout shift
});

const geistMono = Geist_Mono({
    variable: "--font-geist-mono",
    subsets: ["latin"],
    display: "optional", // Non-critical font can be skipped if slow
    preload: false,
    fallback: ["ui-monospace", "monospace"], // Monospace fallback
});

export const metadata: Metadata = {
    title: {
        default: "firepit",
        template: "%s | firepit",
    },
    description:
        "Real-time communities, direct messages, and moderation in one workspace.",
    icons: {
        icon: [
            {
                url: "/favicon/favicon.ico",
                type: "image/x-icon",
            },
        ],
        shortcut: "/favicon/favicon.ico",
        apple: "/favicon/apple-touch-icon.png",
    },
    other: {
        "color-scheme": "light dark",
    },
};

export const viewport: Viewport = {
    width: "device-width",
    initialScale: 1,
    maximumScale: 5,
    userScalable: true,
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en" suppressHydrationWarning>
            <body
                className={`${geistSans.variable} ${geistMono.variable} overflow-x-hidden antialiased bg-background text-foreground`}
            >
                <ResourceHints />
                <ServiceWorkerRegistration />
                <OfflineBanner />
                <Providers>
                    <div className="relative min-h-screen overflow-hidden bg-background">
                        <div className="relative z-10 flex min-h-screen flex-col">
                            <AppLayout>{children}</AppLayout>
                        </div>
                    </div>
                </Providers>
            </body>
        </html>
    );
}
