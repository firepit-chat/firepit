"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { AuthProvider } from "@/contexts/auth-context";
import { PostHogProvider } from "./posthog-provider";
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
                        // Prevent refetching on window focus in development
                        refetchOnWindowFocus: false,
                        // Retry failed queries once
                        retry: 1,
                        // Stale-while-revalidate: serve cached data instantly while fetching in background
                        staleTime: 5 * 60 * 1000, // Consider data fresh for 5 minutes
                        gcTime: 10 * 60 * 1000, // Keep unused data in cache for 10 minutes (formerly cacheTime)
                        // Reduce initial load time by preventing automatic background refetches
                        refetchOnMount: false, // Don't refetch on mount, use stale data
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
            {/* Must sit above every consumer so the browser SDK is configured
                before AuthProvider or any page captures an event. */}
            <PostHogProvider>
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
            </PostHogProvider>
        </QueryClientProvider>
    );
}
