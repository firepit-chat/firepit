"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { AuthProvider } from "@/contexts/auth-context";
import { ThemeProvider } from "./theme-provider";
import { AccentProvider } from "./accent-provider";
import { Toaster } from "./ui/sonner";
import { initRealtimeAuth } from "@/lib/realtime-auth-init";

export default function Providers({ children }: { children: React.ReactNode }) {
    // Create a QueryClient instance per component mount to avoid sharing state between requests
    const [queryClient] = useState(
        () =>
            new QueryClient({
                defaultOptions: {
                    queries: {
                        // Realtime already pushes changes for the collections this
                        // app cares about, so refetching on window focus just
                        // duplicates work the socket is doing.
                        refetchOnWindowFocus: false,
                        // Retry failed queries once
                        retry: 1,
                        // Stale-while-revalidate: serve cached data instantly while fetching in background
                        staleTime: 5 * 60 * 1000, // Consider data fresh for 5 minutes
                        gcTime: 10 * 60 * 1000, // Keep unused data in cache for 10 minutes (formerly cacheTime)
                        // `refetchOnMount: false` combined with the 5-minute
                        // staleTime meant data older than staleTime was NEVER
                        // refetched on remount, so navigating away and back
                        // served arbitrarily old inbox/conversation data with no
                        // spinner and no network call. Leave the default (`true`)
                        // so a stale query revalidates on mount; the per-hook
                        // staleTime overrides still keep hot mounts free.
                    },
                },
            }),
    );

    // Initialize realtime WebSocket authentication from session cookie
    useEffect(() => {
        void initRealtimeAuth();
    }, []);

    return (
        <QueryClientProvider client={queryClient}>
            <ThemeProvider
                attribute="data-theme"
                defaultTheme="latte"
                disableTransitionOnChange
                enableSystem={false}
            >
                <AccentProvider>
                    <AuthProvider>
                        {children}
                        <Toaster richColors />
                    </AuthProvider>
                </AccentProvider>
            </ThemeProvider>
        </QueryClientProvider>
    );
}
