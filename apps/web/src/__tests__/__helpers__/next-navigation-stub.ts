/**
 * Stub for `next/navigation` in the test environment.
 *
 * `@teispace/next-themes` imports `useServerInsertedHTML` from
 * `next/navigation` using an extensionless specifier, which the Vite resolver
 * cannot load. Aliasing it in `vitest.config.ts` lets tests exercise the real
 * theme provider instead of having to mock the whole library.
 *
 * The hook only injects the pre-paint anti-FOUC script during a server render,
 * so a no-op is the correct behaviour under test.
 */
export function useServerInsertedHTML(_callback: () => void): void {}

export const useRouter = () => ({
    push: () => {},
    replace: () => {},
    back: () => {},
    forward: () => {},
    refresh: () => {},
    prefetch: () => {},
});

export const usePathname = () => "/";
export const useSearchParams = () => new URLSearchParams();
export const useParams = () => ({});
export const redirect = () => {};
export const notFound = () => {};
