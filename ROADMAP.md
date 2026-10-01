# Firepit Roadmap

> Last Updated: September 2026
> Replaces the former `apps/web/ROADMAP.md`. This roadmap now covers the whole
> monorepo — web, mobile, and the federation protocol.

For per-release implementation detail — scope, mobile parity, feature flags,
rollback criteria, and the dependency order — see
[docs/ROADMAP_PLAN.md](./docs/ROADMAP_PLAN.md).

## How to read this

This document answers **what ships and when**. It answers **why** a feature is
sequenced where it is, and what it depends on. It does not contain
implementation steps.

Status legend:

- **Live** — shipped and in the current product
- **Planned** — approved, scheduled for a named version
- **Canary** — behind a flag, limited exposure, actively gathering failure data
- **Beta** — complete and functional, API/UX still expected to change
- **Investigating** — in scope, version not committed
- **Deferred** — intentionally not scheduled

Release assignment is a target, not a commitment. Federation is the main source
of schedule risk, and 2.6 is the release most likely to move.

## Current State

Web is at **2.1.0**, mobile at **2.0.3**. The two ship independently today;
from 2.2 forward every release carries an explicit mobile line.

Live and not repeated below: servers and channels with categories, invites,
public server discovery, per-server roles with per-channel permission
overrides, moderation with audit logging, channel and DM messaging, replies,
mentions, reactions, threads, pins, search, custom emoji, attachments,
file/image upload, polls, typing indicators, presence and custom status,
friends and blocking, E2EE DMs, a unified inbox with scoped unread semantics,
notification settings with quiet hours, push notifications, and PWA support.

## Strategic Direction

Three commitments shape the sequence below.

**1. Federation is the thesis, not a feature.** Firepit is a self-hostable
chat platform where instances can federate. That makes decentralization stories deployment outcomes rather than features to build —
each school or community is one instance, federated with the others.

**2. The server is the durable artifact.** The API is the product; clients are
surfaces. This drives two decisions: the OpenAPI contract gets enforced in CI
starting 2.2, and separating the API from the UI is post-3.0 work.

**3. Avoid baking in vendor dependencies where the platform thesis forbids it.**
Voice media is the one place this is genuinely hard, and 2.2's answer is a
provider abstraction with a per-instance setting rather than a hardcoded vendor.

---

## 2.2 — Interface and Identity

The cheapest release on the plan and the one that carries the most
foundational work. **Two user-facing features**, plus the foundation work that
three deferred features depend on.

Forum channels, OAuth, and the voice/video canary were scoped here originally
and have been moved to 2.3. The reasons are recorded in
`docs/ROADMAP_PLAN.md`; the short version is that research put 2.2 at 22–28 days
as originally scoped, and the plan's own argument — that a canary sharing a
release with other features cannot be reverted without reverting them — means
the A/V lane should not ride along.

**Ships**

- **Custom themes.** Full theme system replacing light/dark-only: **six**
  palettes defined in OKLCH against the existing token set — the four Catppuccin
  flavours (Latte, Frappé, Macchiato, Mocha) plus **Classic Light** and
  **Classic Dark**, which preserve the original Firepit themes — and a choice of
  twelve accent colours. Accent fills are adjusted per palette so text on an
  accent-coloured button always clears WCAG AA. Uses `@teispace/next-themes` for
  cookie-authoritative storage, which removes the launch flash, and for the
  scoped sub-themes that 2.3 per-server theming depends on. Mobile ports the
  palettes manually — its 40-token theme system has no library dependency and
  needs none.
- **Role and member viewer.** A Discord-style member list on the right rail,
  sorted by role rank then name, showing the highest applicable role per member.
  The rail itself already exists. The permissions model underneath this is
  already live — this is the surface that exposes it. Backed by a new read-only
  members endpoint, because the existing one requires `manageRoles` and would
  403 for every non-admin. Mobile ships a member list screen, which was net-new
  rather than a port.

**Carried-over unblockers** (infrastructure, not user-facing) — all done except
where noted

- Make the quality gate real: clear the remaining lint errors, and add
  `typecheck` to CI covering both workspaces. It currently runs in no workflow
  at all, and `build:web.yml` typechecks web only — mobile, where most of the
  hand-copied API shapes live, is unguarded.
- Provision the `channel_permission_overrides` collection. It is read at
  runtime by six files and created by none, so a clean deploy has broken
  channel permissions. Forum, voice, stage, and bots all inherit this. One of
  the six already reads it correctly from the environment, so the fix is four
  constant swaps plus the `ensureCollection` call.
- Consolidate the channel-type union. `CHANNEL_TYPE_VALUES` has zero consumers
  and `normalizeChannelType` exists in four hand-copied versions that have
  already drifted. Pure deletion, and it is what makes 2.3's forum work safe.
- Document every undocument API route, fix the incorrect
  `ChannelPermissionOverride` schema, generate client types, and fail CI when
  the spec drifts from the routes. Done: the spec covers all 144 in-scope
  operations, the `bearerAuth` path is documented alongside `sessionCookie`, the
  stale mobile copy is deleted, `bun run check:openapi` gates CI on spec-versus-
  routes drift, and `bun run generate:api-types` plus `check:api-types` keep
  generated client types in step with the spec.
- Settle the four federation schema decisions listed in the plan document and
  reserve the columns, so 2.6 implements rather than decides. Done, and cheaper
  than scoped: the account ID doubles as the federation `username` (no column,
  and reversible later if a real handle is wanted), the `IIID:` participant
  format is a wire concern handled in the adapter (no column), and the
  deterministic conversation ID becomes the Appwrite document ID directly (one
  function, nothing to migrate). Only `sequence` and `sender_instance` are
  actual columns, and both are reserved and null.

**Explicitly not in 2.2:** forum channels, OAuth, the voice/video canary, stage
channels (they need stable voice first), mobile calling, any federation
behaviour.

## 2.3 — Server Identity and Ecosystem Beta

Absorbs everything deferred out of 2.2 — see that section for the corrected
scoping on each.

**Ships**

- **Forum channels.** Posts with a thread-per-post reply model, reusing the
  existing flattened `threadId` structure. Roughly 30 sites across 16 files
  once the channel-type union is consolidated.
- **OAuth sign-in.** Google and other Appwrite-backed providers, plus magic-link
  and passkey support. Provider identities auto-link on a verified email match.
  This is larger than it looks: the SDK no longer exposes a provider list, the
  session handshake needs a new callback route, and mobile needs a deep-link
  handoff that does not exist yet.
- **Per-server profiles.** Per-server display name and avatar override on top of
  the global profile, with a server-specific nickname. The global profile
  remains canonical — this is what federation's profile endpoint reads.
- **Theme scoping.** Per-server theme using the scoped sub-theme support landed
  in 2.2.

**Canary (own release lane)**

- **Voice and video calling, web only.** Behind `canary_voice_calls`, in its own
  lane so it can be reverted without touching the features above. This is the
  highest-uncertainty feature on the plan, and starting in 2.3 still leaves
  three releases of soak before mobile calling is viable in 2.5. Note that
  `voice` channels already exist at the type level — web deliberately hides
  them today, with a test asserting the hiding — so this is un-hiding a
  suppressed type plus the media layer, not adding a channel type.

**Beta**

- **Bots and webhooks.** Server-side event bus, bot accounts, inbound and
  outbound webhooks, scoped permissions, delivery tracking. Backed by a shared
  signing and verification primitive that federation adopts in 2.6 rather than
  reinventing.

**Also**

- Extract shared types into a workspace package. Zero runtime cost, immediate
  removal of ~1,600 lines of hand-copied types.

## 2.4 — Voice and Reach

**Ships**

- **Voice channels.** Un-hide the `voice` channel type, which already exists at
  the schema and type level and is deliberately suppressed in the web UI today,
  and wire it to the stabilized calling stack.
- **PWA hardening.** Install reliability, offline behavior, update flow,
  desktop-class layout. Gated on fixing the plaintext-storage fallback in the
  mobile credential store, which a PWA hits directly.

**Stabilization**

- **Calling, web.** Promote from canary to supported based on 2.3 canary data.
  Exit criteria in the plan document.

**Explicitly not in 2.4:** stage channels. Building stage on an
unstable voice stack guarantees rework, so it moves to 2.5.

## 2.5 — Enterprise Identity and Stable Ecosystem

**Ships**

- **SAML / OIDC / Active Directory.** Instance-admin configuration. Not a
  per-user feature — an instance admin enables the provider and users get a
  button. Reuses the mobile in-app browser handoff built for OAuth in 2.3. That
  handoff does not exist yet: `expo-linking` is currently unused and the
  password-reset flow only shows "check your email", so 2.3 builds it from
  scratch and 2.5 gets it for free.
- **Stage channels.** Scheduled talks with a voice stage, now that voice is
  stable.
- **Bots and webhooks, stable.** API and UX frozen enough to build against
  without expecting breakage.

**Also**

- Mobile calling, entering beta now that web calling has soaked for two
  releases. The call transport interface moves to a shared package here rather
  than being copied into mobile.

## 2.6 — Federation v1.0

The largest single release. Federation is deliberately last among the feature
work: it is orthogonal to everything in 2.2–2.5 because v1.0 is DM-only, so
there was no reason to hold any of that work back waiting for it.

**Ships**

- **Federation protocol v1.0, published.** The specification at
  [`docs/specs/firepit-messaging.md`](./docs/specs/firepit-messaging.md),
  revised against the implementation and published as a public standard.
- **Instance identity.** IIID generation, Ed25519 keypairs, the
  `/.well-known/firepit/instance.json` endpoint, and domain verification.
- **Routing tables.** Fetch, merge, cache, and conditional-request handling
  per the spec.
- **Federation endpoints.** Conversation init, message delivery, edit, delete,
  reaction, profile and media fetch. Ed25519 JWT auth with scoped claims and
  replay protection.
- **Offline delivery queue.** Durable per-conversation queue with exponential
  backoff.
- **Cross-instance DMs.** Including E2EE across instances, and the dual-source
  DM read path this requires — an instance never stores a remote user's
  messages.
- **Self-hosted media option.** A self-hosted media backend becomes selectable
  per instance, so voice is not permanently dependent on a third party.
- **Mobile federation.** Same feature set as web.

**Not in v1.0**, per the spec: threads, group DMs across instances, server
channels, presence, typing indicators, cross-instance push, block and report.
All are v2.0.

## 2.7 — Integrations and Federation Hardening

**Ships**

- **Discord and Stoat integrations.** Message bridging and interoperability
  with the platforms users are migrating from.

**Beta**

- **Federation v2.** Group DMs across instances, thread federation, presence
  federation, cross-instance push, cross-instance block and report.

**Stabilization**

- **Federation v1.** Interop testing against independent implementations of the
  spec, which is the only real test of a protocol.

## 2.8 — Parity Catch-Up

Feature gaps against Discord and Stoat, prioritized by user demand. Scoped
from a written gap list at the start of the release rather than left open.

## 2.9 — Parity Catch-Up and Client Architecture

Remaining parity gaps, plus the preparatory work for separating the API from
the UI: contract enforcement tightened, shared packages completed, and the
server action surface either converted to route handlers or explicitly
documented as a Next-only affordance.

## 3.0 — Federation Stable

Federation v1 and v2 promoted to stable, with the interop suite and published
conformance criteria. The release that makes "firepit instances can federate" a
claim the project will stand behind.

## Post-3.0

Not version-assigned. Sequenced after federation stabilizes, deliberately —
these are large mechanical refactors, and doing them while the protocol is
still settling means touching the same files twice.

- **Separate the API from the UI.** A standalone server package owning the
  route handlers, permission enforcement, federation endpoints, dispatchers,
  and the Appwrite bootstrap script. The web app becomes a pure client.
- **A separately hostable web client.** Deployable against any instance,
  including instances running no first-party UI.
- **Server-only deployments.** An instance operator can run the server with no
  bundled UI and have users connect through third-party clients.
- **Third-party client ecosystem.** A frozen, enforced API contract plus the
  typed client makes this possible.

---

## Deliberately Deferred

- **Native desktop shell** (Electron/Tauri wrapping the mobile app). The web
  app already delivers an installable desktop-class client with full feature
  parity, working E2EE, and no new native code. A native shell would cost
  several times more, break E2EE, and require a multi-pane rewrite of two
  phone-first screens. Revisit only if a specific native capability becomes
  necessary.
- **Rich presence integrations** (Spotify "listening to..." and similar).
  Custom status already covers the user-facing need in a fraction of the work.
  Presence federation is 2.7 at the earliest, and rich presence is a
  federation-shaped feature.
- **Full Discord bot-platform parity.** Bots and webhooks in 2.3–2.5 are scoped
  to Firepit's actual model, not to matching Discord's entire ecosystem.
- **Enterprise trust-and-safety operations** beyond community moderation.

## Related Documents

- [docs/ROADMAP_PLAN.md](./docs/ROADMAP_PLAN.md) — implementation plan
- [docs/specs/firepit-messaging.md](./docs/specs/firepit-messaging.md) — federation protocol
- [apps/web/docs/ROADMAP_IMPLEMENTATION_SPEC.md](./apps/web/docs/ROADMAP_IMPLEMENTATION_SPEC.md) — historical 1.6/1.7 implementation detail, superseded
- [apps/web/docs/](./apps/web/docs/) — web architecture and operations
- [docs/mobile-web-parity.md](./docs/mobile-web-parity.md) — mobile parity tracking
