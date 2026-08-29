# Telemetry

Firepit sends all telemetry to PostHog.

- Server helpers: `src/lib/posthog-utils.ts`
- Client helpers: `src/lib/client-logger.ts`

## Server-side capture

Server-side capture (`posthog-node`) prefers:

- `POSTHOG_PROJECT_API_KEY`
- `POSTHOG_HOST`

Fallback compatibility keys:

- `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN`
- `NEXT_PUBLIC_POSTHOG_HOST`

Structured logs are also forwarded through the OTLP log pipeline to the
PostHog logs endpoint (`POSTHOG_LOGS_HOST`, defaults to the ingest host).

Process-level hooks (uncaught exceptions, unhandled rejections, flush on
shutdown) are registered in `instrumentation.ts`.

## Client-side capture

Client capture (`posthog-js`) uses existing browser initialization in
`instrumentation-client.ts`.

## PostHog Privacy And Bandwidth Controls

- `NEXT_PUBLIC_POSTHOG_AUTOCAPTURE` (recommended `false`)
- `NEXT_PUBLIC_POSTHOG_SESSION_RECORDING` (recommended `false`)
- `NEXT_PUBLIC_POSTHOG_CAPTURE_PAGEVIEW` (recommended `true`)
- `NEXT_PUBLIC_POSTHOG_REQUEST_BATCHING` (recommended `true`)

These defaults reduce ingestion frequency and prevent automatic UI text capture
from clicks (for example DM display names on buttons).

## PostHog Error Tracking

Firepit captures client exceptions for PostHog error tracking via:

- `capture_exceptions` in client PostHog initialization
- `posthog.captureException(...)` in explicit client error paths

To enable readable (symbolicated) production stack traces in PostHog, configure
Next.js source map upload with these env vars:

- `POSTHOG_PROJECT_ID`
- `POSTHOG_API_KEY` (personal API key)
- optional `POSTHOG_HOST` (defaults to US PostHog host)

When `POSTHOG_PROJECT_ID` and `POSTHOG_API_KEY` are present, `next.config.ts`
automatically enables PostHog source map uploads during production builds.

## Message Lifecycle Events

Server routes emit explicit message lifecycle events:

- `message_sent`
- `message_edited`
- `message_deleted`

Event payloads intentionally exclude message content and include only metadata:

- `actorUserId`
- `messageType` (`channel` or `dm`)
- contextual IDs (`channelId` or `conversationId`, `messageId`, optional `serverId`)
- `totalQueryTimeMs`

## Optional Next.js Rewrite Configuration

If you use Next.js rewrites as a PostHog proxy path, configure:

- `POSTHOG_REWRITE_ENABLED` (default `true`)
- `POSTHOG_REWRITE_PATH` (default `/ingest`)
- `POSTHOG_REWRITE_INGEST_HOST` (default `https://us.i.posthog.com`)
- `POSTHOG_REWRITE_STATIC_HOST` (default `https://us-assets.i.posthog.com`)

If you set `NEXT_PUBLIC_POSTHOG_HOST` directly to your own reverse-proxy domain,
you can disable rewrites with `POSTHOG_REWRITE_ENABLED=false`.

## Server Events

Events emitted by `src/lib/posthog-utils.ts`:

| Helper                               | PostHog output                                                                     |
| ------------------------------------ | ---------------------------------------------------------------------------------- |
| `recordEvent(eventType, attributes)` | capture event `eventType` with `attributes`                                        |
| `recordMetric(name, value)`          | capture event `metric_recorded` with `{ metricName: name, value }`                 |
| `recordError(error, attrs)`          | `captureException` with normalized error fields plus attrs                         |
| `logger.info/warn/error/debug`       | capture event `application_log` plus OTLP log record                               |

Client helpers emit `log_info`, `log_warn`, `log_error`, `client_error` events
and use `captureException` for rich client errors.

## Digest Telemetry Example

Digest generation in `src/lib/inbox.ts` emits:

- Event: `InboxDigestGenerated`
- Metrics: `Custom/InboxDigest/DurationMs`, `Custom/InboxDigest/ReturnedItems`, `Custom/InboxDigest/TotalUnread`