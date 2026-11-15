/**
 * Next.js client instrumentation entry point.
 *
 * This file used to statically import and `init()` posthog-js itself, while
 * `PostHogProvider` did the same thing again with a different config — the
 * second `init()` silently won, so this file's settings (cookieless mode,
 * exception capture, config snapshot) were being discarded, and the ~95 KB gzip
 * SDK sat in the critical path of every route.
 *
 * `initPostHogClient` is now the single initializer. It loads the SDK through a
 * dynamic `import()` and replays anything captured in the meantime, so calling
 * it here — before hydration, which is the right place — keeps every event
 * without blocking first paint.
 */
import { initPostHogClient } from "@/lib/posthog-client";

void initPostHogClient();
