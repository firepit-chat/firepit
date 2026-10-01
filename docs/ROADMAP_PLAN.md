# Firepit Roadmap — Implementation Plan

> Companion to [../ROADMAP.md](../ROADMAP.md). That document decides **what**
> ships and **when**. This one covers **how**, in what order, behind which
> flags, and how each release is rolled back.

## How to use this document

- Each release lists scope, the mobile line, feature flags, and exit criteria.
- Exit criteria are the definition of done for a release. A release that misses
  its exit criteria ships the stable subset and defers the rest — it does not
  ship a canary that hasn't proven itself.
- The **Critical Path** section is the part worth reading before scheduling
  anything. Most of the plan is independent; the chain below is not.

## Critical Path

Most of the plan is parallelizable. These dependencies are not:

```
lint + typecheck gate (2.2) ──> everything below

channel_permission_overrides (2.2) ──> forum (2.3) ──> voice un-hide (2.5) ──> stage (2.5)
        │
        └──> bots permissions (2.3)

channel-type consolidation (2.2) ──> forum (2.3) ──> voice un-hide (2.5)

A/V canary (2.3, own lane) ──> A/V stable (2.4) ──> mobile A/V (2.5)
                                    │
                                    └──> stage channels (2.5)

theme system (2.2) ──> per-server themes (2.3) ──> ScopedTheme consumer

federation schema decisions (2.2) ──> federation v1 (2.6) ──> v2 beta (2.7) ──> stable (3.0)
bots signing primitive (2.3) ────────^

API contract enforcement (2.2) ──> UI/API separation (post-3.0)
```

**2.2 phasing.** Phase 0 (the lint and typecheck gate) gates everything else —
it is the reason a ~30-site refactor and a 37-route spec pass are safe to land.
After Phase 0, five tracks are independent and parallelizable: the
`channel_permission_overrides` fix, the channel-type consolidation, themes, the
member viewer, and OpenAPI completion (which needs Phase 0's gate and Phase 1's
schema fix). Mobile themes is the single longest item and the most likely to
slip.

**The voice chain is the long one.** Starting the canary in 2.3 means three
releases of soak before mobile is viable, because React Native's WebRTC support
is the binding constraint and that risk should not be discovered twice. Stage
sits at the end of the chain deliberately — building it before voice is stable
guarantees rework. Note that `voice` channels already exist at the type level;
this chain is about un-hiding them and building the media layer, not about
adding a channel type.

**The federation chain is gated on decisions, not code.** The specification
exists and is thorough, but it contradicts the current schema in ways that
require choices, not documentation edits. Those choices are a one-day task in
2.2 — reserve the nullable columns, ship no behaviour. Leaving them until 2.6
turns a build release into a design release.

---

## 2.2 — Interface and Identity

### Unblockers (do these first)

**0. Hold TypeScript at 6.x.**

`typescript-eslint` does not yet support TS 7.0, so a TS 7 web build made
`bun run lint` fail before linting anything. Both apps now pin
`typescript: ~6.0.3` and lint clean. Do not bump to 7 until
`@typescript-eslint/parser` supports it. The 7.1 line ships the API
typescript-eslint needs and is expected to stabilise around late October
2026; 7.0 beta lands 2026-10-06, which is worth a look at but is not a
bump signal. Bumping either app alone leaves the workspace resolving two
copies of TypeScript, which is what produced the failure.

Note for whoever hits this next: `bun install` does not prune replaced
versions out of `node_modules/.bun`. After a TypeScript change, verify with
`find . -name typescript -type l` that every link points at one version, and
`rm -rf node_modules && bun install` if any stale peer-links remain.

Both lint scripts pass `--cache`; a warm web lint runs in ~1s versus ~29s
cold, which makes the gate cheap enough to actually run. oxlint was measured
as a replacement and rejected: it is also sub-second, but it reported none of
the 61 errors ESLint finds (no `curly`, no `no-floating-promises`, no
type-aware import rules) and exits 0, so it would not gate anything.
Revisit only as a fast pre-pass, not as the gate.

**1. Provision `channel_permission_overrides`.**

The collection is read at runtime in six places and created by none:

- `apps/web/src/lib/appwrite-core.ts` (declaration only, via `COLLECTION_DEFS`)
- `apps/web/src/lib/server-channel-access.ts` (hardcoded)
- `apps/web/src/app/api/channel-permissions/route.ts` (hardcoded)
- `apps/web/src/app/api/channels/route.ts` (hardcoded)
- `apps/web/src/app/api/servers/[serverId]/permissions/route.ts` (hardcoded)
- `apps/web/src/app/api/messages/[messageId]/pin/route.ts` (**already correct**
  — reads `env.collections.channelPermissionOverrides`)

So the env plumbing exists and works; four sites simply bypass it. That makes
this smaller than it looks: four constant swaps, not a new config surface. The
`APPWRITE_CHANNEL_PERMISSION_OVERRIDES_COLLECTION_ID` variable is absent from
`.env.local.example` and from `validate-env.ts`, which is why the bypass was
never noticed.

Schema, derived from the call sites: `channelId`, `roleId`, `userId` as
required strings (the writer always sends both role and user, using `""` as the
sentinel for the one that does not apply), `allow` and `deny` as string arrays,
and four indexes — `idx_channelId`, `idx_userId`, `idx_roleId`, and a unique
composite on `(channelId, roleId, userId)`. That composite also lets the
hand-rolled check-then-create in `channel-permissions/route.ts` go away in
favour of the 409-retry pattern `role_assignments` already uses.

Note that `src/__tests__/scripts/setup-appwrite.test.ts` is not a real guard:
it never imports the script and asserts tautologies like
`expect(attr).toBeTruthy()`. Do not extend it. If a guard is wanted, export the
collection list from the script and assert against that.

**2. Enforce the API contract.**

The spec is at `apps/web/docs/openapi-doc.yml` (not `docs/openapi-doc.yml`) and
it is **camelCase and accurate** — it describes the real `/api/*` routes, with
zero phantom paths. A stale second copy lives at `apps/mobile/docs/openapi-doc.yml`
at `info.version: 1.8.0` against web's `1.9.0`; pick one as canonical.

The real gap was coverage. Counting method-level operations rather than paths
(98 paths carry 146 operations, 3 of which are debug endpoints the spec
intentionally omits), the spec started at **92 of 143 in-scope operations
documented**, leaving 54 undocumented across 41 paths. There were zero phantom
paths and zero method-level mismatches: every operation the spec did declare
matched a real handler, so the spec was incomplete rather than wrong.

Count paths and operations separately — the two numbers were previously
conflated, and the resulting "37 missing" figure was wrong.

**This phase is done.** `bun run check:openapi` now reports
**143/143 operations across 95 paths**, and runs as a CI gate.

Two consumers made this more than internal bookkeeping:

- `apps/web/src/lib/docs.ts` renders the spec as the **in-app API Reference
  page**, so every undocumented operation was a route missing from shipped
  product documentation. 54 operations are now visible there for the first
  time.
- Nothing validated the spec against reality. `apps/web/scripts/check-openapi-sync.ts`
  (new, wired to `bun run check:openapi` and to CI) walks the handlers,
  normalizes `[param]` to `{param}` and route groups, and fails on drift in
  either direction. It deliberately ignores `OPTIONS`, whose only handlers are
  CORS origin-guard preflights on the upload routes.

The stale mobile copy was **not** safe to delete as-is: it was web@v1.8.0 plus
`/api/typing`, but it also declared a `bearerAuth` security scheme on 84
operations that web's copy omitted entirely. `auth-server.ts:337-357` really does
accept a Bearer token (and `x-firepit-token`) before falling back to the session
cookie, so that was genuine missing documentation rather than cruft. Its unique
content — the `/api/typing` route and the `bearerAuth` scheme — was merged into
the canonical copy first; the copy is now deleted, and
`apps/web/docs/openapi-doc.yml` is the single source of truth.

`apps/mobile/docs/mobile-api-route-structures.md` is a *third* hand-maintained
route inventory. It is kept because it carries contract prose the spec does not
(the `Authorization: Bearer` plus `x-firepit-token` rule, and the
`contextKind`/`contextId` pairing), but it is the most likely thing to drift
now. Prefer the spec and the check.

Steps, in this order:

- **Fix the `ChannelPermissionOverride` schema first.** As written
  (`openapi-doc.yml:689`) it declares `allow`/`deny` as `type: object` maps and
  omits `userId`, which is the opposite of what the runtime does. Generating
  types from it mistypes the exact collection unblocker 1 is fixing.
- Add `openapi-typescript` as a dev dependency and a generate script.
- Document the 37 missing routes.
- Point both clients at the generated types instead of hand-copied shapes. On
  mobile, convert the highest-traffic endpoints first rather than all 84 types
  at once — `firepitRequest<T>` takes an unverified `T` today, so generated
  types only fix the shapes you actually point them at.
- Add a CI check that fails when the spec and the routes disagree. This does not
  need a dependency: extract paths from the YAML, diff against
  `find apps/web/src/app/api -name route.ts`, exit non-zero on mismatch.

**A gate is a prerequisite, not an afterthought.** `typecheck` currently runs in
no CI workflow at all, and `build:web.yml` typechecks web only — so mobile,
where 84 of ~146 hand-copied shapes live, is unguarded. Generated types are
worthless without a gate that reads them. Add it in Phase 0.

**3. Settle the federation schema decisions.**

Four decisions, one day, no implementation. Each is a nullable column or a
format choice that is cheap now and expensive after launch. Reserve the columns
now; no behaviour ships with them.

| Decision | Current state | Spec requires |
| --- | --- | --- |
| `username` on profiles | Does not exist; display name only | Required by `GET /api/federation/user/:id` |
| `sequence` + `sender_instance` on DMs | Neither column exists | Per-conversation per-instance sequence for pagination and dedup |
| Participant ID format | Bare user IDs | `IIID:uuid` for remote participants |
| Conversation ID scheme | Appwrite `ID.unique()` | Deterministic `dm_<sha256 of sorted participants>` |

Plus two smaller ones: `dmEncryptionEnabled` currently lives on
`notification_settings` rather than `profiles`, and the **federation spec**
(`docs/specs/firepit-messaging.md`) defines a snake_case client API —
`/api/messages` with `conversation_id`/`content`/`media_id` — against 98
existing camelCase handlers.

**These are two different contracts, and only one of them is a mismatch to fix.**
`openapi-doc.yml` correctly documents the existing camelCase routes. The real
two-contract conflict is federation-spec vs OpenAPI-spec: the federation spec
models a message flat as `{id, conversation_id, sender_id, created_at}` where
the web app nests an Appwrite document as `{$id, $createdAt, content}`. Resolving
that belongs to federation work, not to the contract unblocker.

**On the API shape: build an adapter, do not rewrite.** 98 handlers is too much
surface to throw away, and mobile talks to those routes through its own
622-line client. The adapter maps federation spec shapes onto existing handlers.
Note that the federation spec's own ordering rule (§4.5.1) makes `created_at`
primary and `sequence` a pagination cursor only, which means a
per-(conversation, sender-instance) counter document is sufficient — no atomic
counter primitive is needed.

### Features

2.2 ships **themes and the member viewer**. Forum channels, OAuth, and the
voice/video canary moved to 2.3 — see "Deferred out of 2.2" below for why.

**Themes.** Two independent pieces of work.

*Web — the palette axis.* `index.css` has 31 OKLCH tokens in exactly two blocks,
`:root` and `.dark`, selected by `attribute="class"`. Four Catppuccin palettes
cannot be expressed that way: one class, one selector. Use `data-theme` for the
palette and widen the `@custom-variant dark` at `index.css:4` to match all
three dark variants — otherwise the 89 `dark:` utility occurrences across 22
`.tsx` files render in light mode. Then 4 blocks × 31 tokens, 4 `THEME_ICONS`
entries (`header.tsx:44-48`), both hardcoded theme arrays (`header.tsx:513-518`
and `:611`), a theme row in Settings (there is none today — "Appearance" is
profile background only), and the `ToasterProps["theme"]` cast at
`sonner.tsx:19` which will silently mis-apply a fourth value.

*Web — the library swap.* `next-themes` → `@teispace/next-themes`. **Four**
production call sites (`theme-provider.tsx`, `header.tsx`, `mode-toggle.tsx`,
`sonner.tsx`) and 4 `vi.mock` files, plus an 11-line provider. There is no
codemod to run.

*Why swap at all:* `ScopedTheme` has **zero users and is not installed** — the
original justification was wrong. The real reasons are cookie-authoritative
storage, which removes a visible launch flash, and unblocking per-server theming
in 2.3. The migration behaviours that actually bite are **ESM-only** (breaks
the 4 `vi.mock` files) and **default storage becoming `hybrid`**. Two concerns
in the original draft do not apply: no `onChange` is passed anywhere, and there
is exactly one provider instance, so neither the signature change nor nested
providers are reachable.

*Delete `mode-toggle.tsx` and its test.* It is dead code — nothing in production
imports it — and it asserts the literal strings `Light`/`Dark`/`System`, so a
fourth theme breaks it regardless.

*Mobile — a separate system, and the library does nothing here.* 40 hex tokens
per mode (not ~45) in `apps/mobile/src/constants/theme.ts`, a 14-line
`useColorScheme()` hook, and **no theming dependency at all** — the file's header
comment names Nativewind, Tamagui and unistyles as the alternatives
deliberately not taken.

The design constraint that makes this cheap: **keep `useTheme()` returning the
same flat token shape**, so all 66 call sites stay untouched. What changes is
what is behind it. `Colors` goes from 2 modes × 40 to 4 palettes × 40 (Latte
replaces `light`; Frappé, Macchiato and Mocha replace `dark`), and a preference
store has to be created — none exists. Copy `providers/cache-settings-context.tsx`,
which is already `useState` + `AsyncStorage` + `createContext`.

Then fix the consumers that bypass the hook: `app/_layout.tsx:39`,
`components/app-tabs.tsx:10`, and `components/app-tabs.web.tsx:48` and `:72` all
import `Colors` directly. `app-tabs.web.tsx:132` hardcodes
`Colors.light.sidebarBorder` inside a `StyleSheet.create` block and cannot react
to any theme — a live bug, not cleanup. Finally, `settings/appearance.tsx` exists
and is 429 lines of profile background with no app-theme controls; the route and
nav entry are already there.

**Role and member viewer.** Right-rail member list sorted by role rank then
username.

The permission model is already live. `roles` carries `color`, `position`,
`memberCount`, `defaultOnJoin` and `mentionable`, all confirmed in
`setup-appwrite.ts:1293-1315`, and `memberCount` is actively maintained by
`api/role-assignments/route.ts:183-222`. The 8-member `Permission` union
(`types.ts:510-518`) is unchanged by this release. This release builds the
surface, not the model.

The rail **already exists** — `chat/page.tsx:2406` is a 320px `<aside>` with
`lg:border-l` styling, currently holding Pinned Messages and Thread. No layout
work is needed; add a third panel.

**One blocker the original plan missed:** `/api/servers/[serverId]/members`
requires `manageRoles` (`route.ts:63-65`), so a member rail would 403 for every
non-admin. Add a new read-only endpoint gated on `access.isMember` returning only
viewer-relevant fields, and leave the admin endpoint's `manageRoles` gate
intact — role-management dialogs currently read from it. Compute the highest role
server-side so the client never needs the full role list.

`getEffectivePermissions` (`permissions.ts:40-142`) resolves in this order, which
the original summary got from the function's own incomplete docstring: `isOwner`
bypass, then any role with `administrator`, then OR-merged base roles, then
**channel role overrides applied in `position` order**, then the channel user
override, then default deny. The `isOwner` bypass and the position ranking of
role overrides are both absent from the docstring and matter for how a
rank-sorted list reads.

**Mobile is net-new work.** The original plan said `server/[serverId]/roles.tsx`
made it "rank sorting plus parity styling". That file is a 952-line role CRUD
**editor** — mobile has no member list at all. The parity backlog already lists
"server stats and member list views" as outstanding. Note that `/api/roles`
already returns `Query.orderDesc("position")`, so roles arrive pre-sorted; the
new work is the member list and its rank-then-name sort.

Both `docs/mobile-web-parity-backlog.md` and the root `ROADMAP.md` were
corrected to reflect that this is a new mobile screen.

### Deferred out of 2.2

These three moved to 2.3 so 2.2 can actually ship. Each note records what the
research changed, so 2.3 planning does not inherit the old assumptions.

**Forum channels.** The original claim — "`CHANNEL_TYPE_VALUES` is a clean union
and adding `forum` is one union member plus UI" — is wrong in a way that changes
the estimate. `CHANNEL_TYPE_VALUES` has **zero consumers**; the union is
restated literally in 13 other places and `normalizeChannelType` exists in **4
hand-copied versions** that have already drifted. Miss one copy and `forum`
silently degrades to `text` on the write path. Real cost is ~30 sites across 16
files: 3 `normalizeChannelType` copies, 13 unions, 2 hardcoded error strings, 5
OpenAPI enums, ~10 UI branch points, 6 test files.

`channels.type` is indexed (`idx_type`, `setup-appwrite.ts:1016`) and is a plain
32-char string with no Appwrite enum, so there is no schema change.

What *is* reusable: threads are already **flattened to one level**
(`api/messages/[messageId]/thread/route.ts:220-221`), which is exactly Discord's
model, and mobile's thread screen **already exists** at
`app/thread/[serverId]/[channelId]/[messageId].tsx`, already wired to
`fetchChannelThreadMessages`. Only the post list is new. And no `thread` boolean
is needed — `threadId !== undefined` already is the post/reply marker; a
separate flag would be a second source of truth for a fact already in the row.

Two real problems to solve: channel messages are queried with **no `threadId`
filter** (`api/messages/route.ts:171-175`), so replies currently sit inline in
the timeline and a post list must add `Query.isNull("threadId")` gated on channel
type or it paginates over reply noise. And `ChannelAccess` exposes a single
`canSend` boolean, which cannot separate create-a-post from reply-in-a-post —
that needs a third flag plus a check in the thread POST route.

Also plan for `thread_reads`: `reads` is a single JSON blob per
`(userId, contextType, contextId)` capped around 65KB, roughly 1000 thread ids
per channel. A popular forum channel will exceed it.

**OAuth.** The original framing — "Appwrite handles the provider side
server-side" — understates this substantially.

- `getOrCreateUserProfile` is at `apps/web/src/lib/appwrite-profiles.ts:424`, not
  in `login/actions.ts`. It takes a bare `userId` and writes only
  `{ userId, displayName }`.
- `loginAction` is **dead to the web UI** — its only production caller is
  `registerAction`. The real path is `login-form.tsx:103-116` →
  `POST /api/auth/session`. OAuth must hook the route.
- `listProviders` was **removed** from both SDKs in Appwrite 1.6.0, so the
  provider list must be a hardcoded constant or env allowlist.
- `createOAuth2Session` is renamed `createOAuth2Token` in node-appwrite 27.1.0,
  and despite the name it is a **two-step handshake**: it returns a redirect
  URL, Appwrite redirects to `success?userId=…&secret=…`, and a second
  `createSession({userId, secret})` call establishes the session. That second
  step must go through a new same-origin route — the browser cannot set the
  existing httpOnly cookie. `/api/auth/session` is the template.
- `profiles` has **no email and no username**; avatar is `avatarFileId`, a file
  ID, not a URL. Google returns a URL, so avatar mapping needs a new
  SSRF-guarded remote-fetch-to-buffer path.
- There is dead `userName` code in `editableProfileKeys` and
  `api/profile/route.ts:173` referencing an attribute that does not exist. Any
  `updateUserProfile({userName})` would be rejected by Appwrite. Delete it.
- The tombstone guard is **bypassed for OAuth users**. `tombstoneUserProfile`
  exists so a deleted account's ID can never be reused, but its only caller is
  inside `registerAction`. An OAuth user who deleted their account would
  silently get a fresh one with their old messages orphaned. Fix alongside.

**Merge policy, decided:** auto-link when Appwrite reports the provider email as
verified and it matches an existing account, gated strictly on the verified flag
— that flag is the only thing standing between this and an account-takeover
path. `Users.listIdentities` can filter on both `providerUid` and
`providerEmail`, so this is an afternoon of work, not a design cycle.

**Mobile OAuth is new work, not a reroute.** The original plan claimed it
"rides the existing pattern" used by password reset. It does not:
`expo-linking` is **never imported** anywhere in mobile `src`, and
`forgot-password.tsx` just calls `requestPasswordReset` and shows "check your
email". There is no in-app browser, no deep link, and no session handoff to
reuse. Both deps are installed, so the mechanism is available — but it has to be
built. Reuse the result for SAML/OIDC in 2.5.

### Canary: voice and video, web only

Feature flag `canary_voice_calls`, shipping in 2.3 as **its own release lane**.
This is the correction to the original plan: a canary that shares a release with
other features cannot be reverted without reverting them, which makes it not a
canary.

**Nothing exists today.** No `webrtc`, `getUserMedia`, `RTCPeerConnection`,
`livekit`, `jitsi`, `agora` or `twilio` anywhere outside this document, and no
streaming dependency in either app. There is no partial or dead implementation
to reuse. This is a greenfield build.

**Two things the original plan got wrong:**

*The flag is not a flag flip.* "Exposed to a small percentage of opted-in servers"
assumes infrastructure that does not exist. `feature_flags` is a flat global
table (`key`, `enabled`, and an unused `value` string(64)); `servers` has no
rollout column; `getFeatureFlag` returns `Promise<boolean>` and is used in ~10
places; the one public client endpoint is hardcoded to a single key. Either
build the rollout helper and a per-server flag function, or simplify the gate to
a single global admin toggle. Decide before writing the flag.

*`voice` channels already exist.* `voice` is already in `CHANNEL_TYPE_VALUES`,
already validated in both channel routes, and already rendered on mobile. Web
**hides it deliberately** (`category-settings-panel.tsx:831-833`) and there is a
test asserting the hiding (`admin-server-management.test.tsx:93-104`:
`expect(optionValues).not.toContain("voice")`). So 2.4's "voice channels" is
un-hiding a suppressed type plus the media work, not a new type. The original
framing inverted the actual cost distribution.

There is also **no call permission** on roles. The 2.4 exit criterion
"permission gating verified against the role matrix" needs a new role flag and a
new branch in `getEffectivePermissions`; neither exists.

Media transport sits behind a `CallProvider` interface from the first commit,
with the selected provider as a per-instance admin setting. This is the one
place a premature abstraction is correct, because a second implementation is
already scheduled and forced: 2.6 adds a self-hosted backend so voice is not
permanently dependent on a third party.

The interface must be expressed in firepit's own terms — join, leave, mute,
camera, screen share, subscribe to participant streams — not the vendor's SDK
types. If vendor types leak into the UI, the abstraction is decorative and the
2.6 swap becomes the rewrite it was meant to avoid.

**Exit criteria for 2.4 promotion:** connection success rate above a set
threshold over two releases, no open P0 defects, call teardown leak-free under
load, and permission gating verified against the role matrix.

**Rollback:** kill the flag. No migrations, no data changes.

### Flags

`oauth_login` and `canary_forum_channels` in 2.3; `canary_voice_calls` follows in
its own lane. Neither of the first two requires a migration, so rollback is a
flag flip — but note the `canary_voice_calls` caveat above about the flag system
not yet supporting per-server rollout.

---

## 2.3 — Server Identity and Ecosystem Beta

2.3 absorbs the three features deferred out of 2.2: **forum channels**,
**OAuth**, and the **A/V canary** in its own release lane. All three are
detailed under "Deferred out of 2.2" in the 2.2 section above — read those
notes before estimating, because the original assumptions in each were wrong
and the corrected numbers are larger.

### Forum channels

Depends on the 2.2 `channel_permission_overrides` fix and the 2.2 channel-type
consolidation. Roughly 30 sites across 16 files, with two design decisions to
make first: how `ChannelAccess` separates create-a-post from
reply-in-a-post, and what happens when `thread_reads.reads` exceeds its ~65KB
cap. Reuses the existing flattened thread model and both existing thread
screens; only the post list is new.

### OAuth and Google sign-in

Merge policy is decided: auto-link on a verified provider-email match, gated
strictly on Appwrite's verified flag. The build is larger than it first appears
— a new same-origin callback route for the `createSession` step, a hardcoded
provider allowlist (`listProviders` no longer exists in the SDKs), a new
SSRF-guarded avatar fetch, and a brand-new mobile deep-link plus session handoff
that has no existing mechanism to reuse.

### 2.2 exit criteria

The gate, which gates the gate:

- `bun run lint` and `bun run typecheck` pass in both workspaces with zero
  errors, and `test:web.yml` fails on a type error in either one.

Infrastructure:

- A clean `setup-appwrite.ts` run provisions `channel_permission_overrides`,
  and channel permission overrides demonstrably work on a fresh environment.
- `rg '"text", "voice", "announcement"'` returns only the canonical
  `CHANNEL_TYPE_VALUES` definition.
- `bun run check:openapi` reports all 143 in-scope operations documented with
  zero missing and zero phantom (done), `ChannelPermissionOverride` matches the
  runtime (done), the `bearerAuth` path is documented alongside `sessionCookie`
  (done), generated types exist, and CI fails when a route is added or changed
  without a spec update (done — the gate is wired; only client generation
  remains).
- The four federation columns are reserved and documented, with no behaviour
  shipped against them.

User-facing:

- Four Catppuccin palettes are selectable and persist across reload on both
  platforms, with no launch flash on web.
- A non-admin server member sees the right-rail member list sorted by rank then
  name; a non-member gets a 403.
- Mobile ships a member list screen. It is net-new, not a port.

Explicitly not exit criteria for 2.2: forums, OAuth, or any calling. If those
appear, they have leaked from 2.3.

### Per-server profiles

A `serverProfiles` collection keyed `(userId, serverId)` with server nickname
and display-name/avatar override, resolved in the existing batch endpoints.
The global profile stays canonical — it is what federation's profile endpoint
serves, so a per-server profile is a local overlay and must not leak into
`GET /api/federation/user/:id`.

### Theme scoping

`ScopedTheme` from 2.2 makes this mostly configuration. Verify that a scoped
theme inside a modal and inside a server channel do not fight over the page
root.

### Bots and webhooks (beta)

The real cost is not the two new collections. It is that 98 route handlers
currently emit no domain events. This release needs an event bus retrofit
across the write paths, and that should be scoped as its own item rather than
folded into "the beta."

Reuse the announcement dispatcher's lease-and-retry pattern
(`announcement_deliveries` with `attemptCount`, `nextAttemptAt`,
`failureReason`) for delivery tracking — it is already built and already
handles retry and failure reporting.

**Extract the signing primitive in this release, not 2.6.** Federation already
specifies exactly what bots need: Ed25519 JWTs, `scope` claims, five-minute
expiry, `jti` replay protection. If bots build their own auth in 2.3 and
federation invents its own in 2.6, 2.7 reconciles two auth systems. One
primitive, built once, adopted by both.

### Shared types package

~1,600 lines of hand-copied types become one workspace package. Zero runtime
cost — types compile away — so the justification is purely drift prevention.
It is worth doing early for that reason.

Worth stating plainly: this will not make the apps lighter. Measured against
mobile's ~36,000 lines, a core package is under 5%, and types contribute
nothing to a bundle. The value is that the two clients stop being able to
silently disagree.

### Flags

`beta_bots`, `beta_webhooks`, `per_server_profiles`

---

## 2.4 — Voice and Reach

### Calling stabilization

Promote from canary using 2.3 data against the exit criteria above. Expect
this release to be dominated by defect work rather than features.

### Voice channels

Not a new type. `voice` is already in `CHANNEL_TYPE_VALUES`, already validated
in both channel routes, and already rendered on mobile. Web hides it
deliberately (`category-settings-panel.tsx:831-833`) and
`admin-server-management.test.tsx:93-104` asserts the hiding
(`expect(optionValues).not.toContain("voice")`). This is un-hiding a suppressed
type and wiring it to the stable calling stack. There is also no call
permission on roles yet — the exit criterion above requires a new role flag
and a branch in `getEffectivePermissions`.

### PWA hardening

**Gated on a security fix.** `apps/mobile/src/lib/storage/secure-store.ts`
falls back to plaintext `localStorage` on any non-native platform — that is the
bearer token *and* the E2EE private keys. A PWA is exactly that fallback path.
Fix the storage shim before or with this work, never after.

Also: `apps/web/src/app/manifest.ts` sets `start_url: "/new"`, and there is no
`/new` route. Fix it as part of this.

### Flags

`voice_channels`, `pwa_install_prompt`

---

## 2.5 — Enterprise Identity and Stable Ecosystem

### SAML / OIDC / AD

Instance-admin configuration, not a per-user feature. An admin enables a
provider; users get a button. Appwrite supports SAML and OIDC server-side, so
this is an admin settings surface plus login-page rendering. Mobile uses the
same in-app browser handoff as OAuth.

### Stage channels

Scheduled talks with a voice stage. Positioned after voice stabilizes
specifically so the stage layout is not built on a moving foundation.

### Bots and webhooks stable

Freeze the API surface. Integration authors should be able to build without
expecting breakage.

### Mobile calling (beta)

Web calling has now soaked for two releases. `CallProvider` moves to a shared
package here rather than being copied into mobile.

The React Native constraint is real and it is why this is late rather than
early: the Stream React Native SDK depends on `react-native-webrtc`, a bare
native module, and this project is on React Native 0.86 with a prebuild
workflow, reanimated 4.5, and worklets 0.10. New Architecture compatibility is
genuinely uncertain. Discovering that after shipping would be far worse than
scheduling around it.

Note that the mobile leg is where the provider preference may invert — the
native constraint that pushes toward the hosted provider on web does not apply
the same way to a self-hosted backend.

### Call transport extraction

Move the `CallProvider` interface to a shared package so web and mobile
implement the same contract.

### Flags

`saml_oidc`, `stage_channels`, `beta_mobile_calling`

---

## 2.6 — Federation v1.0

The largest release, and the one most likely to move. Deferred to here on
purpose: v1.0 is DM-only, so federation gates none of the work above and there
was no case for holding any of it back.

### Build order

1. **Instance identity.** IIID generation, Ed25519 keypair, key rotation with a
   24-hour grace period, `/.well-known/firepit/instance.json`, domain
   verification. Node's built-in `crypto` handles Ed25519 — no new dependency.
2. **Routing tables.** Fetch, conditional requests, merge with first-table
   precedence, entry removal, hour-interval refresh.
3. **Federation auth.** JWT issue and verify, scope enforcement, `jti` replay
   protection, the five-minute expiry, and the re-fetch-on-signature-mismatch
   path for key rotation. Reuses the 2.3 signing primitive.
4. **Federation endpoints.** Conversation init, message delivery, edit, delete,
   reaction, user fetch, media fetch, message history.
5. **Conversation lifecycle.** Deterministic `dm_<hash>` IDs, lexicographic
   owner selection, idempotent concurrent init.
6. **Dual-source DM read path.** See below — this is the expensive part.
7. **Offline queue.** Durable, per-conversation, exponential backoff from 30
   seconds capped at 10 minutes, 1,000-message cap, 7-day expiry.
8. **Cross-instance E2EE.** X25519 key agreement using the remote user's
   published key, matching the existing local scheme.
9. **Self-hosted media backend.** Selectable per instance.
10. **Mobile parity.** The same feature set, plus the duplicated E2EE and DM
    read-path implementations collapse into shared packages here.

### The dual-source read path

This is the real cost of federation and it is not the endpoints. The spec
requires that an instance MUST NOT store a remote user's messages. Today
`/api/direct-messages` is a single local query; under federation it becomes a
merge of locally-stored messages and a proxied remote fetch, cached
opportunistically.

This is the only item in the plan with a forced web-plus-mobile coordinated
change, and it is why the mobile line is not optional here.

### Shared packages

`firepit-crypto` — one E2EE implementation, replacing web's 1,019 lines
(`libsodium-wrappers`, IndexedDB wrapping) and mobile's 384 lines
(`react-native-libsodium`, SecureStore). Same wire format, two divergent
implementations, and mobile's version refuses the plaintext fallback that
web's version takes. Platform storage stays per-app; the crypto core is shared.

`firepit-protocol` — IIID parsing, conversation-ID derivation, JWT claim shapes,
the wire types from the spec.

### Specification work

Revise `docs/specs/firepit-messaging.md` against the implementation and publish
it as a public standard. The cryptography in the spec is already correct
against the code — X25519 via `crypto_scalarmult`, BLAKE2b via
`crypto_generichash(32, …)`, XChaCha20-Poly1305, `xchacha20poly1305-v1`,
`firepit-dm-v1` — so the protocol is grounded in working code rather than
aspiration. Most of the revision is the schema decisions settled in 2.2 plus
filling in the gaps they expose.

### Flags

`beta_federation_v1`, `federation_enabled`

Rollback: disabling federation stops outbound delivery and inbound acceptance.
Locally-stored remote messages are retained but hidden. **No message deletion
on rollback** — a federated message has exactly one authoritative copy, on the
sender's instance, and deleting a local mirror because a feature was turned off
would destroy data that cannot be recovered.

---

## 2.7 — Integrations and Federation Hardening

- **Discord and Stoat integrations.** Message bridging. Stoat is the closer
  architectural analogue to Firepit — self-hosted, non-monetized — and is the
  better primary comparison even though Discord drives the feature requests.
- **Federation v1 stabilization.** Interop against independently implemented
  instances. This is the only real test of a protocol and cannot be
  substituted for.
- **Federation v2 beta.** Group DMs across instances, thread federation,
  presence federation, cross-instance push, cross-instance block and report.

---

## 2.8 and 2.9 — Parity Catch-Up

Scope from a written gap list at the start of each release. "Features we lack
compared to Discord" without a list is a backlog, not a release, and it will
absorb whatever capacity exists while committing to nothing.

2.9 also completes the preparatory work for separating the API from the UI:
contract enforcement tightened, shared packages finished, and the server
action surface either converted to route handlers or explicitly documented as a
Next-only affordance.

---

## 3.0 — Federation Stable

Promote v1 and v2 with an interop suite and published conformance criteria.

---

## Post-3.0 — Separating the API from the UI

Deliberately after federation stabilizes. Large mechanical refactors, and doing
them while the protocol is still settling means touching the same files twice.

### Target structure

```
packages/
  firepit-types      zero runtime, extracted 2.3
  firepit-crypto     extracted 2.6
  firepit-protocol   extracted 2.6
apps/
  web                UI only, after the split
  mobile             UI only
  server             route handlers, permission enforcement,
                    federation endpoints, dispatchers, bootstrap script
```

There is deliberately no `firepit-core` grab-bag. One artifact per concern,
each extracted when it has a second consumer. A shared core holding a bit of
everything is the shape that stays tiny and never earns its build complexity.

### What moves cleanly

The 98 route handlers. They are real HTTP, already documented, and mostly pure
functions over Appwrite. `setup-appwrite.ts` and the server-only libraries move
with them.

### The actual project

**The nine `"use server"` modules are the friction** (3,747 lines total). Server actions are a
Next-specific RPC mechanism, not an HTTP API surface. Each must either become a
route handler the client calls over HTTP, or stay in the Next app — which means
the Next app is still the API. And `docs/openapi-doc.yml` does not cover them,
so part of today's surface is undocumented and therefore not part of the
contract.

Resolving that seam is the work. It is worth knowing now rather than
discovering it at 3.0.

`src/proxy.ts` also splits: CORS and rate limiting move to the server, the
auth-redirect half stays in the UI.

### Why 2.2's contract enforcement matters here

If the API contract is enforced by CI and consumed as generated types, this
refactor is a mechanical move. If it stays documentation, it is archaeology
through 98 handlers and a fuzzy server-action boundary. That is the entire
argument for spending a day on it in 2.2.

---

## Risk Register

| Risk | Impact | Mitigation |
| --- | --- | --- |
| React Native WebRTC incompatibility | Mobile calling cannot ship | Already mitigated — mobile A/V is 2.5, after web soak. Validate early in 2.5 even though shipping is late |
| Third-party media dependency contradicts decentralization | Instance operators cannot offer voice without a vendor | `CallProvider` abstraction in 2.2, per-instance setting, self-hosted option in 2.6 |
| Federation schema decisions deferred to 2.6 | 2.6 becomes a design release and slips | Settle in 2.2, one day, no implementation |
| API drift across eight releases | Client/server field mismatches, integration breakage | `openapi-typescript` + CI drift check in 2.2 |
| Duplicated E2EE implementations drift further | Federation E2EE built on an unverified base | Collapse in 2.6 into `firepit-crypto` |
| A/V canary cannot be independently reverted | A canary failure forces rolling back OAuth, forum, and themes | Own release lane, own flag |
| Stage channels built on unstable voice | Guaranteed rework | Stage moved to 2.5 |
| Mobile version drift from web | Users on different capability tiers | Every release carries an explicit mobile line |
| Unbounded parity catch-up releases | 2.8/2.9 absorb everything, commit to nothing | Written gap list at the start of each |

## Known Documentation Debt

Tracked here rather than silently fixed, since these are separate jobs:

- `docs/mobile-web-parity.md` claims 20/20 parity. It is wrong on at least four
  counts: status is polled on a 10-second interval rather than realtime, there
  is no register route, there is no reset-password deep-link route, and
  `components/app-tabs.web.tsx` is a stale four-tab variant of a five-tab
  layout.
- `apps/web/docs/FEATURE_FLAGS.md` documents three flags that do not exist
  (`enable_per_message_unread`, `enable_inbox_digest`, `enable_inbox_digest_v1_5`).
  The real set is `allow_user_servers`, `enable_audit_logging`,
  `enable_email_verification`.
- `docs/inbox-push-plan.md` describes shipped work.
- `apps/web/docs/ROADMAP_IMPLEMENTATION_SPEC.md` documents 1.6/1.7, both
  shipped. Retained as history.
