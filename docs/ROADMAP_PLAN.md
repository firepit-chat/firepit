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
channel_permission_overrides ──> forum (2.2) ──> voice (2.4) ──> stage (2.5)
        │
        └──> bots permissions (2.3)

A/V canary (2.2) ──> A/V stable (2.4) ──> mobile A/V (2.5)
                              │
                              └──> voice channels (2.4)
                                    └──> stage channels (2.5)

theme system (2.2) ──> per-server themes (2.3)

federation schema decisions (2.2) ──> federation v1 (2.6) ──> v2 beta (2.7) ──> stable (3.0)
bots signing primitive (2.3) ────────^

API contract enforcement (2.2) ──> UI/API separation (post-3.0)
```

Two chains drive most of the schedule risk:

**The voice chain is the long one.** Canary in 2.2 means four releases of soak
before mobile is viable, because React Native's WebRTC support is the binding
constraint and that risk should not be discovered twice. Stage sits at the end
of the chain deliberately — building it before voice is stable guarantees
rework.

**The federation chain is gated on decisions, not code.** The specification
exists and is thorough, but it contradicts the current schema in ways that
require choices, not documentation edits. Those choices are a one-day task in
2.2. Leaving them until 2.6 turns a build release into a design release.

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

The collection is read at runtime in five places and created by none:

- `apps/web/src/lib/appwrite-core.ts`
- `apps/web/src/lib/server-channel-access.ts`
- `apps/web/src/app/api/channel-permissions/route.ts` (hardcoded, not
  env-driven)
- `apps/web/src/app/api/channels/route.ts`
- `apps/web/src/app/api/servers/[serverId]/permissions/route.ts`

`scripts/setup-appwrite.ts` has no `ensureCollection` call for it, so every
clean deploy has non-functional channel permission overrides. Forum, voice,
stage, and bot permissions all depend on it. Add the `ensureCollection` call
and make the route read the ID from the environment like every other
collection.

**2. Enforce the API contract.**

`docs/openapi-doc.yml` is maintained by discipline and required to be updated
by `docs/FEATURE_FLAGS.md`, but nothing checks it and the only consumer is the
first-party web client. Three steps:

- Generate response types from the spec with `openapi-typescript`. One dev
  dependency, one script, zero runtime.
- Point both clients at the generated types instead of hand-copied shapes.
- Add a CI check that fails when the spec and the routes disagree.

This is the highest-leverage item in the plan. It stops API drift across all
eight releases, and it is what makes the post-3.0 UI/API separation mechanical
rather than archaeological.

**3. Settle the federation schema decisions.**

Four decisions, one day, no implementation. Each is a nullable column or a
format choice that is cheap now and expensive after launch.

| Decision | Current state | Spec requires |
| --- | --- | --- |
| `username` on profiles | Does not exist; display name only | Required by `GET /api/federation/user/:id` |
| `sequence` + `sender_instance` on DMs | Neither column exists | Per-conversation per-instance sequence for pagination and dedup |
| Participant ID format | Bare user IDs | `IIID:uuid` for remote participants |
| Conversation ID scheme | Appwrite `ID.unique()` | Deterministic `dm_<sha256 of sorted participants>` |

Plus two smaller ones: `dmEncryptionEnabled` currently lives on
`notification_settings` rather than `profiles`, and the spec's client API is
snake_case `/api/messages` with `conversation_id`/`content`/`media_id` against
98 existing camelCase handlers.

**On the API shape: build an adapter, do not rewrite.** 98 handlers is too much
surface to throw away, and mobile talks to those routes through its own
622-line client. The adapter maps spec shapes onto existing handlers. Note that
the spec's own ordering rule (§4.5.1) makes `created_at` primary and `sequence`
a pagination cursor only, which means a per-(conversation, sender-instance)
counter document is sufficient — no atomic counter primitive is needed.

### Features

**Themes.** Swap `next-themes` for `@teispace/next-themes`. Five call sites and
an 11-line provider; a codemod exists for the imports. Migration behavior
changes to check: default storage becomes `hybrid` rather than localStorage,
`onChange` now receives `(theme, resolvedTheme)`, nested providers are no
longer no-ops, and the package is ESM-only. Four test files already cover this
surface and will surface any breakage.

The swap is not for custom palettes — that is CSS custom properties against the
existing OKLCH tokens, with no library involvement. It is for `ScopedTheme`,
which per-server theming and the picker preview both need, and for
cookie-authoritative storage, which removes a visible launch flash. Bundle size
is not a factor: the package is roughly the same size as what it replaces.

Mobile theming is a separate system — ~45 hardcoded tokens per mode in
`apps/mobile/src/constants/theme.ts` and a 14-line `useColorScheme()`. The
library does nothing here. Porting four Catppuccin palettes is manual work and
is the largest mobile item in this release.

**Role and member viewer.** Right-rail member list sorted by role rank then
username. The permission model is already live — `getEffectivePermissions`
(`apps/web/src/lib/permissions.ts`) resolves admin bypass, then channel user
override, then channel role override, then base role. The `roles` collection
already carries `color`, `position`, `memberCount`, `defaultOnJoin`, and the
`mentionable` flag. This release builds the surface, not the model. Mobile
already has `server/[serverId]/roles.tsx`, so the mobile line is rank sorting
plus parity styling.

**Forum channels.** `CHANNEL_TYPE_VALUES` is a clean union and `channels.type`
is already indexed, so adding `forum` is one union member plus UI. Post
enforcement rides the unblocker from item 1. Mobile has no forum surface at
all — this is a new post-list and thread-per-post screen, and it is the
second-largest mobile item in this release.

**OAuth.** Appwrite handles the provider side server-side, so the work is a
provider list on the login screen, `providerUserId` plumbing through
`getOrCreateUserProfile` at `apps/web/src/app/(auth)/login/actions.ts`, and
avatar/name mapping. The open question is how provider identities merge with
existing profiles — decide it before writing code.

Mobile rides the existing pattern: `expo-web-browser` opens the web `/login`,
`expo-linking` hands the session back. Both are already dependencies and this
is the same mechanism the password-reset flow uses. Reuse it for SAML/OIDC in
2.5 too.

### Canary: voice and video, web only

Feature flag `canary_voice_calls`. **Its own release lane** — this is the
correction to the original plan. A canary that shares a release with four
other features cannot be reverted without reverting them, which makes it not a
canary. Exposed to a small percentage of opted-in servers first.

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

`canary_voice_calls`, `canary_forum_channels`, `oauth_login`

Rollback for all three is a flag flip. None of them require a migration.

---

## 2.3 — Server Identity and Ecosystem Beta

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

Promote from canary using 2.2–2.3 data against the exit criteria above. Expect
this release to be dominated by defect work rather than features.

### Voice channels

First-class channel type. Depends on the calling stack being stable, which is
why it is here and not 2.2.

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

**The eight `"use server"` modules are the friction.** Server actions are a
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
