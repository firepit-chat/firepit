# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### ✨ Features

- **Spoilers.** Wrap any part of a message in `[spoiler]...[/spoiler]` to hide
  it behind a click-to-reveal control. Formatting, links and images inside a
  spoiler still render once it is revealed, and a message can contain several.
  Collapsed content is kept out of the page entirely rather than blurred, so
  screen readers do not announce it and hidden links are not keyboard-reachable.
  An unmatched `[spoiler]` renders as literal text rather than hiding the rest
  of the message.

- **Member list in the chat right rail.** A new Members panel sits above pinned
  messages, listing everyone in the server with their highest-ranked role
  colour. Members are ordered by role rank and then by name, with anyone
  holding no role at the bottom. The role is resolved on the server, so the
  panel loads instantly and never needs the full role list.
  - Backed by a new read-only endpoint, `GET /api/servers/{id}/viewer/members`,
    that any member can call. The existing `/members` endpoint still requires
    **Manage Roles**, because the role-management screens read full role
    assignments and moderation flags from it. The viewer endpoint returns only
    what a member row renders, and never exposes role ids, ban state, or mute
    state.
- **Custom themes.** Light/dark is replaced by six palettes — the four
  Catppuccin flavours (**Latte**, **Frappé**, **Macchiato**, **Mocha**) plus the
  **two original Firepit themes** (**Classic Light** and **Classic Dark**) — and
  a choice of twelve accent colours used for highlights, links, buttons, and
  charts. Pick a palette and accent from the header menu or **Settings → Theme**
  on the web, and from **Settings → Appearance** in the mobile app. Your choice
  is remembered and neither palette nor accent flashes on launch.
  - The original orange themes are preserved exactly: their primary lives in the
    default accent slot, so selecting one with no accent chosen reproduces the
    pre-Catppuccin look. Picking an explicit accent still overrides it.
  - Catppuccin accent colours are adjusted per palette so that text on an
    accent-coloured button always clears WCAG AA (4.5:1). Latte's stock accents
    cannot be used unmodified as button fills — six of the twelve fall below
    3:1 — so they are lightened to pair with Latte's dark text. The dark
    palettes already clear 5.3:1 and are used as published.

### 📚 Documentation

- **Updated to node-appwrite 29.** The realtime WebSocket token is now minted
  with `users.createJWT()`, which replaces the removed `account.createJWT()`.
  Because the new call runs with the server API key rather than the user's own
  session, **self-hosted instances must add the user JWT scope to their API
  key** or the realtime connection will fail to authenticate. The user id is
  resolved by verifying the session cookie against Appwrite rather than decoding
  it, so a tampered cookie cannot mint a token for another account.
- **The API reference now covers every public route.** All 143 operations
  across 95 paths are documented, up from 89 operations across 54 paths. The
  in-app API Reference page under Docs renders this spec directly, so the
  account, session, friends, blocks, profile, admin, announcements, reports,
  moderation, polls, typing, push notification, and GIF/sticker endpoints are
  now visible there for the first time.
- **Bearer-token authentication is now documented.** The spec only described
  the session cookie, but the server has long accepted an Appwrite session
  secret as `Authorization: Bearer <token>` (and `x-firepit-token` for Appwrite
  Cloud) before falling back to the cookie. Authenticated operations now list
  both schemes. The five `/api/status` operations were also missing a
  `security` block entirely despite requiring a session.
- New shared schemas: `SignupPolicy`, `SessionInfo`, `UserPreferences`,
  `Friendship`, `BlockedUser`, `MessagePoll`, `MessagePollOption`,
  `Announcement`, and `AnnouncementListResponse`.
- Removed the stale `apps/mobile/docs/openapi-doc.yml` (v1.8.0). Its only
  unique content — the `/api/typing` route and the `bearerAuth` scheme — is now
  in the canonical `apps/web/docs/openapi-doc.yml`, and nothing referenced the
  copy. `apps/web/docs/openapi-doc.yml` is the single source of truth.

### 🐛 Bug Fixes

- **Fixed "Origin is not allowed" rejecting sign-in behind a reverse proxy.**
  The CSRF origin check on `POST /api/session` (and the direct-messages and
  upload routes) decided same-origin with `new URL(request.url).origin`. Behind a
  proxy that forwards the public hostname but not `X-Forwarded-Proto`, that
  evaluates to `http://yourdomain` while the browser sends
  `Origin: https://yourdomain`, so the comparison failed and the request was
  rejected. The check now compares the `Origin` header against every plausible
  spelling of the request's own origin. `ALLOWED_ORIGINS` — previously
  undocumented — is now described in `.env.local.example` and is only needed for
  genuinely cross-origin callers, not for normal single-origin deployments.


- **Per-channel permission overrides now work on a fresh instance.** The
  `channel_permission_overrides` collection was never created by the setup
  script, so a new deployment had no table for the feature to write to. It is
  now provisioned with its attributes, lookup indexes, and a unique
  `(channelId, roleId, userId)` index.
- Creating a permission override no longer races. Two concurrent requests for
  the same channel/role/user pair could both pass the "does this already
  exist?" check and each write a row. Existence is now enforced by the unique
  index, and a conflict returns the same "already exists" message as before.
- Corrected the `ChannelPermissionOverride` schema in the API reference, which
  described `allow`/`deny` as objects of booleans rather than arrays of
  permission names, and omitted `userId` entirely.
- The mobile tab bar no longer hardcodes the light-mode border colour, so it
  matches the selected palette instead of staying light in every dark theme.
- Mobile views and text no longer pick their light/dark variants from the
  device's system appearance. Three of the four palettes are dark, so choosing
  Latte on a dark-mode device previously applied dark-only styling on top of a
  light palette.

### ⚙️ Improvements

- **API client types are now generated from the spec.** `bun run
  generate:api-types` produces TypeScript types directly from the documented
  API, and CI fails if they drift from the spec. Combined with the existing
  spec-versus-routes check, the documented API can no longer quietly disagree
  with either the server or the clients compiling against it.
- **Fixed client-side analytics and error reporting.** The browser PostHog SDK
  was never initialized, so every client event — sign-in, registration,
  onboarding, invitations, and the opt-in/opt-out toggle — was queued against an
  SDK with no credentials and silently dropped. The same gap left the
  client-side logger and error reporter as no-ops, since both read a
  `window.posthog` that only exists once the SDK is initialized.
  Anonymous visitors are captured by default, so the pre-auth funnel — landing,
  sign-in, registration, onboarding — is recorded; those events are only
  observable before an account exists. Consent is still enforced per account:
  turning telemetry off in Settings opts out persistently, which also suppresses
  anonymous capture on later visits, and an opted-out user is never identified.
  **Server-side telemetry now honours the same preference**: API-call metrics,
  forwarded application logs, and error reports attributed to a user are dropped
  when that account has telemetry disabled. Telemetry with no identifiable user
  is still sent, since there is no person whose consent applies.
- **Dark mode is respected again on both platforms.** Choosing a palette no
  longer overrides it: on a first visit the app follows the operating system's
  light or dark setting, and an explicit choice is remembered from then on. This
  had regressed when the fixed palette list replaced automatic detection, which
  would have handed every existing dark-mode user a light app.
- **The palette pickers show real colours.** The swatch previews in Settings
  were rendering with no background at all, because the build produced no CSS
  for the utility syntax they used. They now sample the actual palette.
- **Per-channel permission overrides are resolved from a single place.** The
  read-only member rail and the role-management screen now share one server-side
  helper, so they cannot disagree about a member's roles, ban state, or
  ordering.
- **The DM encryption preference moved to where it belongs.** It now lives on the
  profile beside the public key it depends on, rather than among notification
  preferences. Accounts that enabled encryption before the move are unaffected:
  reads prefer the new location and fall back to the old one, so nobody's DMs
  silently fall back to plaintext. As a side effect the message send path is
  slightly cheaper, since the profiles it already loaded now answer the question.
- Theme and accent choices are stored in a cookie on the web, so the first paint
  already uses the right colours and the old light/dark launch flash is gone.
- The member list is fetched through one shared server-side helper, so the
  read-only viewer and the role-management endpoint can never disagree about a
  member's roles, ban state, or ordering.
- The selected palette is no longer written as a React-owned attribute on
  `<html>`. It used to be rendered server-side as a placeholder, which the theme
  library also writes — so any re-render of the root layout could overwrite the
  palette you had chosen. The default palette is now defined in CSS on `:root`
  instead, which means the page is never unstyled and the choice cannot be
  clobbered.
- The theme library moved from `next-themes` to `@teispace/next-themes`, which
  supports several palettes on one page and is what per-server themes in a future
  release will build on.
- **The OpenAPI spec can no longer drift from the code.** `bun run
  check:openapi` walks the route handlers and fails if the spec and the
  handlers disagree in either direction — a route that exists but is
  undocumented, or a documented operation with no handler. It runs in CI, so
  adding or renaming a route without updating the spec now breaks the build
  instead of failing silently until a generated client called a route that
  isn't there. It skips the three debug endpoints and the CORS preflight
  `OPTIONS` handlers on the upload routes.
- **Type checking now runs in CI.** `bun run typecheck` covers both the web and
  mobile workspaces and fails the build on a type error in either. Previously
  no workflow ran it, and the only implicit check was the web build — so a type
  error in the mobile app could not fail CI.
- Pinned TypeScript to 6.x across the workspace. A TypeScript 7 install made
  `bun run lint` fail before linting anything, because `typescript-eslint` does
  not support it yet. Bump when 7.1 lands.
- Fixed a handful of lint errors that were masking real issues, including two
  unhandled promises in the blocked-users and notification-settings hooks.
- The permission-override collection ID is now configurable via
  `APPWRITE_CHANNEL_PERMISSION_OVERRIDES_COLLECTION_ID` instead of being
  hardcoded in four places, so it can be renamed without editing source.
- **One channel-type normalizer instead of four.** Coercing a channel's type to
  a known value was copy-pasted into four modules, one of which had drifted to a
  different implementation, and the accepted-values array was duplicated a fourth
  time. All 14 call sites now share a single function, so adding a channel type
  is a one-line change instead of a scavenger hunt. The old copies cast the input
  rather than validating it, so a malformed `type` could surface as something
  other than `"text"`.


## [2.1.0] - 2026-09-27

### ✨ Features

- **NSFW channels** - Server managers can mark a channel as 18+ from the channel settings dialog. 18+ channels show a badge in the channel list and header, and require an age-confirmation step before messages load. Users can skip the warning for all channels from Settings → Interface
- **Mobile app parity for 2.1** - The 2.1 account and moderation features are now available in the mobile app: password reset from the sign-in screen, change email, a Devices screen to review/revoke sessions, account deactivation and permanent deletion from a new Danger Zone, email-verification resend, admin signup controls (policy + approvals), and per-server message moderation (remove/restore/permanently delete). Powering these, the web server now exposes authenticated API routes for account management, sessions, signup control, and moderation
- **Password reset** - Request a reset link from the sign-in page and set a new password from a secure email link
- **Change email** - Update your account email from Settings (with current-password confirmation and re-verification when enabled)
- **Session management** - View all signed-in devices in Settings and revoke any of them (or sign out everywhere except the current device)
- **Remember me** - Optional persistent sign-in; uncheck to use a session-only cookie that clears when the browser closes
- **Signup control** - Admins can set the instance policy to open, individual approval, or no signups, and approve/reject pending signups from the admin panel
- **Deactivate & delete account** - Temporarily deactivate your account (auto-reactivates on next sign-in) or permanently delete it from a new Danger Zone section
- **Deleted User tombstones** - Deleted accounts show as "Deleted User" and their user ID is permanently reserved so it can never be reused
- **Server-scoped moderation workspace** - The Moderation panel now works per server: pick a server and channel from the sidebar to review its messages. Anyone with the Manage Messages permission (or a global moderator) can soft-delete/restore, and server owners/admins (or global admins) can permanently delete. The redundant Moderation tab inside the server admin panel was replaced with a link into this workspace

### ⚙️ Improvements

- Sign-in now refuses accounts awaiting approval and reactivates deactivated accounts automatically on success
- Admin panel exposes the current signup policy and a pending-approvals queue
- **Telemetry simplified to PostHog only** - Removed all New Relic plumbing, dependencies, and config; server and client telemetry now route exclusively to PostHog (smaller installs, less startup overhead)
- Added `z.compile()` to one usage of zod in codebase to improve performance
- Updated `bun test` wiring to improve passing tests to 818 up from 717 previously. (Part of bun dep bump)
- **Account safety polish** - Deleting your account now opens a confirmation dialog with a full consequences summary and password confirmation; a persistent warning (with one-click resend) reminds you to confirm a new email before signing out; the remember-me checkbox preference and password-reset resend (with a 30s cooldown) are new conveniences on the sign-in page
- **Unified server admin panel** - The separate "Role Settings" dialog was folded into the server admin panel: Roles and Categories now live alongside Overview, Settings, Members, Invites, Moderation, and Audit under the single server-admin button
- **Calmer, denser UI pass** - Cut decorative surfaces (gradient orbs, glass panels, card shadows) from the app shell, landing, login, chat workspace, settings, notifications, docs, admin, moderation, friends, onboarding, invite, and profile pages. Panels are flat bordered surfaces, server/channel/DM rows are dense list rows, the card primitive is border-only (no card-on-card nesting), the server admin panel's inner audit/member rows are flat dividers, and the header is a single compact row — tighter spacing without losing hierarchy

### 🐛 Fixes

- **Session devices now identified** - The session list showed "Unknown device" and "signed in by unknown" because it read nested fields the Appwrite API doesn't return. It now maps the real device, browser, OS, and sign-in date
- Fix TDZ in `setup-appwrite.ts` (`[error] Cannot access 'now' before initalization`).
- Bumped zod to `4.5.4`, and bumped bun to `1.4.0` for performance improvements

## [2.0.3] - 2026-08-15

### 🐛 Fixes

- **Offline banner** - When your connection drops, a clear banner now appears instead of requests failing silently
- **More reliable API handling** - Reworked response parsing and error handling across API routes for consistent, clearer error messages

### ⚙️ Improvements

- **Connectivity-aware loading** - Screens show clearer loading states while data fetches
- **Faster profile loads** - Improved profile prefetching so profiles appear sooner
- **Better observability** - Added New Relic instrumentation for faster monitoring and issue diagnosis
- **Stronger reliability** - Added integration tests for auth/session and core API routes to prevent regressions

## [2.0.0] - 2026-05-21

### ✨ Features

- **Monorepo migration** - Split the project into `apps/web` and `apps/mobile` workspaces with shared tooling
- **Mobile-ready APIs** - Added and reworked endpoints (message listing, sessions) to power the React Native app
- **Improved auth sessions** - Session handling changes to reduce unnecessary re-authentication

### Build and Infrastructure

- **Web CI** - GitHub Actions for web build and test
- **PostHog logging** - Enhanced event logging across API routes
- **Repo Relocation** - Relocate Repo to new github organization for future work.

### Bug Fixes

- Various API bugs surfaced during the mobile build-out

## [1.9.0] - 2026-05-13

### ✨ Features

- **UI overhaul** - Redesigned and polished core chat UI
- **Faster DM loading** - Performance improvements in direct message loading
- **Realtime improvements** - Better subscription lifecycle management
- **Cursor-based pagination** - Public server listing now paginates with cursors

### Build and Infrastructure

- **Mobile app prerequisites** - API groundwork for the upcoming mobile app

### Bug Fixes

- **Rate limit & CORS handling** - Improved middleware error handling and response management

## [1.8.1] - 2026-05-06

### Bug Fixes

- Updated dependencies to latest versions for improved stability and performance

## [1.8.0] - 2026-05-05

### ✨ Features

- **GIF & sticker support** - Share GIFs and stickers with improved file naming and MIME type inference
- **System announcements** - Instance-wide announcements with dispatching and caching
- **Email verification** - Verify email addresses during and after signup
- **Polls in messages** - Create and vote on polls in channels
- **Server discovery & customization** - Improved public server browsing and customization
- **Markdown support** - Basic Markdown rendering in messages
- **Channel deletion** - Delete channels with proper permission and error handling

### Bug Fixes

- **Notification settings cache invalidation** - Fixed stale notification preferences
- **Conversation caching** - Fixed duplicate idempotency key handling and improved DM caching
- Various error-handling and API response structure improvements

## [1.7.0] - 2026-03-29

### ⚠️ Breaking Changes

- **Node.js 20.9.0 minimum** - Enforced via the engines field in package.json.
- **Next.js 16.2.x** - Updated Next.js ecosystem packages; align your app/runtime and CI accordingly.
- **Appwrite TablesDB** - Added TablesDB client for transaction support (notably report resolution flow), which may affect Appwrite API behavior assumptions in custom integrations.

### ✨ Features

#### Profile Backgrounds and Avatar Frames

- **Custom profile backgrounds** - Solid colors, gradients, or uploaded images with a 24-hour cooldown per user
- **Preset avatar frames** - Seasonal and themed frames with admin-configurable assets
- **Profile appearance settings** - In-app UI for selecting backgrounds, frames, and previewing changes

#### User Reporting System

- **Report users** - Report users for inappropriate profile content with required justification
- **Admin reports dashboard** - Instance admins can review, resolve, or dismiss reports with audit logging
- **Rate limiting** - DB-backed rate limiting prevents report spam (5 per hour per user)
- **Atomic report resolution** - Transaction-based resolution prevents double-processing of reports

#### Onboarding Improvements

- **Safe form validation** - Type-guarded formData parsing with proper fallbacks
- **Notification settings** - Onboarding now correctly sets notification preferences

### Build and Infrastructure

- **Runtime/tooling alignment** - CI and production runtime checks now enforce the upgraded framework/runtime baseline
- **Transaction-backed moderation flow** - Report resolution path now uses Appwrite transactions to prevent double-processing

### Bug Fixes

- **Profile background clearing** - Fixed clearing not working for color/gradient backgrounds
- **Background type switching** - Fixed image file ID not being cleared when switching to color/gradient
- **Moderation toast grammar** - Fixed "Successfully kickned" → "Successfully kicked"
- **Fixed upload endpoints leaking raw exceptions to clients** - Generic error messages returned to clients instead of raw exceptions
- **File ownership on delete** - Upload delete endpoints now verify file ownership before deletion
- **Inbox query fix** - Fixed `Query.equal` on array attribute `participants` → `Query.contains`
- **PostHog deduplication** - Removed duplicate initialization in `instrumentation-client.ts` and the PostHog provider component to prevent "already initialized" warnings

## [1.0.0] - 2025-11-02

### 🎉 Initial Release

Firepit 1.0.0 is the first production-ready release of our Discord-inspired chat platform built with Next.js 15, Appwrite, and modern web technologies.

### ✨ Features

#### Core Chat Functionality

- **Real-time Messaging** - WebSocket-based instant messaging with typing indicators
- **Server & Channel System** - Discord-like server organization with multiple text channels
- **Direct Messages** - Private 1-on-1 conversations between users
- **Message Replies** - Thread-style replies to maintain conversation context
- **Message Reactions** - React to messages with standard and custom emojis
- **Message Search** - Full-text search across channels and DMs with advanced filters
- **@Mentions** - Mention users in messages with autocomplete support

#### User Management

- **User Profiles** - Customizable profiles with avatar upload support
- **User Status** - Online/offline/away/DND presence with custom status messages
- **Authentication** - Secure email/password authentication via Appwrite

#### Moderation & Administration

- **Role-Based Permissions** - Server-specific roles with granular permissions
- **Channel Permissions** - Per-channel permission overrides for roles and users
- **Message Moderation** - Soft delete, restore, and hard delete with full audit trails
- **User Moderation** - Kick, ban, and timeout features for server administrators
- **Audit Logging** - Complete audit trail of all moderation actions

#### Media & Customization

- **Image Uploads** - Share images in channels and DMs (up to 10MB)
- **File Attachments** - Upload and share files (up to 50MB)
- **Custom Emojis** - Upload server-specific custom emojis (up to 10MB)
- **Emoji Picker** - Searchable emoji picker with standard and custom emoji support

#### Performance & Developer Experience

- **99.3%+ Performance Improvement** - Optimized bundle size, caching, and rendering
- **Virtual Scrolling** - Efficient rendering of large message lists
- **Response Compression** - 60-70% bandwidth reduction on large payloads
- **Debounced Typing Indicators** - 70-80% reduction in typing status updates
- **Turbopack Support** - 87% faster development, 49% faster production builds
- **PWA Ready** - Progressive Web App support with offline capabilities
- **Service Worker** - Multi-tier caching strategy for optimal performance

#### Infrastructure & Monitoring

- **New Relic APM** - Full application performance monitoring and error tracking
- **OpenAPI 3.1.0 Documentation** - Complete API documentation with 20+ endpoints
- **Comprehensive Testing** - 992 passing tests with extensive coverage
- **CI/CD Pipeline** - Automated testing and builds via GitHub Actions
- **TypeScript** - Full type safety across the entire codebase
- **ESLint Configuration** - Strict linting with accessibility, performance, and React best practices

### 🏗️ Technical Stack

- **Frontend**: Next.js 15.5.6 (App Router), React 18, TailwindCSS 4.1, shadcn/ui
- **Backend**: Appwrite 20.x (Database, Auth, Storage, Realtime)
- **State Management**: React Query (TanStack Query) with optimistic updates
- **Styling**: TailwindCSS with custom theme system
- **Testing**: Vitest with Testing Library
- **Build Tool**: Turbopack (default), Webpack (fallback)
- **Runtime**: Bun 1.3.0 (recommended), Node.js 18+ (supported)

### 🔒 Security

- Global error boundaries for graceful error recovery
- Rate limiting on file uploads and API endpoints
- Secure session management with HTTP-only cookies
- Input validation and sanitization across all forms
- CSRF protection on all state-changing operations
- Comprehensive permission checks on all routes

### 📚 Documentation

- Complete deployment guide (DEPLOYMENT.md)
- Performance optimization documentation (PERFORMANCE.md)
- Turbopack configuration guide (TURBOPACK_CONFIG.md)
- New Relic integration guide (NEW_RELIC.md)
- Admin and moderator handbook (ADMIN_GUIDE.md)
- Contributing guidelines (CONTRIBUTING.md)
- Detailed roadmap (ROADMAP.md)

### 🎯 Known Limitations

- Server invites not yet implemented (planned for v1.1)
- Message threading not yet implemented (planned for v1.2)
- Message pinning not yet implemented (planned for v1.2)
- Voice/video calls not supported
- Mobile apps not yet available (PWA supported)

### 🚀 Performance Metrics

- **Bundle Size**: Optimized with code splitting and tree shaking
- **Load Time**: <2s on 3G connections
- **Time to Interactive**: <3s average
- **Real-time Latency**: <200ms for message delivery
- **Development Build**: 87% faster with Turbopack
- **Production Build**: 49% faster with Turbopack
- **Memory Usage**: 56% reduction in development

### 🙏 Acknowledgments

Built with ❤️ using:

- Next.js by Vercel
- Appwrite for backend services
- shadcn/ui for beautiful components
- TailwindCSS for styling
- React Query for state management
- Vitest for testing

[2.0.3]: https://github.com/firepit-chat/firepit/releases/tag/v2.0.3
[2.0.0]: https://github.com/firepit-chat/firepit/releases/tag/v2.0.0
[1.9.0]: https://github.com/acarlson33/firepit/releases/tag/v1.9.0
[1.8.1]: https://github.com/acarlson33/firepit/releases/tag/v1.8.1
[1.8.0]: https://github.com/acarlson33/firepit/releases/tag/v1.8.0
[1.7.0]: https://github.com/acarlson33/firepit/releases/tag/v1.7.0
[1.0.0]: https://github.com/acarlson33/firepit/releases/tag/v1.0.0
