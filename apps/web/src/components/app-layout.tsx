"use client";

import { useGlobalSearch } from "@/hooks/useGlobalSearch";
import Header from "@/components/header";
import { lazy, Suspense } from "react";

// Lazy load GlobalSearch since it's only needed when user clicks search
const GlobalSearch = lazy(() =>
    import("@/components/global-search").then((mod) => ({
        default: mod.GlobalSearch,
    })),
);

type AppLayoutProps = {
    children: React.ReactNode;
};

export function AppLayout({ children }: AppLayoutProps) {
    const globalSearch = useGlobalSearch();

    return (
        <>
            <Suspense fallback={null}>
                <Header onSearchClick={globalSearch.open} />
            </Suspense>
            <main className="relative flex-1 overflow-hidden">
                <div className="relative min-h-full">{children}</div>
            </main>
            {globalSearch.isOpen && (
                <Suspense fallback={null}>
                    <GlobalSearch
                        open={globalSearch.isOpen}
                        onOpenChange={globalSearch.setIsOpen}
                    />
                </Suspense>
            )}
        </>
    );
}
