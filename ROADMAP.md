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
foundational work. Four user-facing features plus three unblockers.

**Ships**

- **Custom themes.** Full theme system replacing light/dark-only: accent color,
  and a set of four Catppuccin palettes (Latte, Frappé, Macchiato, Moz),
  all defined in OKLCH to match the existing token set. Adopts
  `@teispace/next-themes` for scoped sub-themes, which is what per-server
  theming in 2.3 and the picker preview both depend on.
- **Role and member viewer.** A Discord-style member list on the right rail,
  sorted by role rank then username, grouped by role, showing the highest
  applicable role per member. The permissions model underneath this is already
  live — this is the surface that exposes it.
- **Forum channels.** Posts with a thread-per-post reply model, reusing the
  existing `threadId`/`replyToId` structure.
- **OAuth sign-in.** Google and other Appwrite-backed OAuth providers, plus
  magic-link and passkey support on the same screen.

**Canary**

- **Voice and video calling, web only.** Behind `canary_voice_calls`. This
  ships early and behind a flag on purpose: it is the highest-uncertainty
  feature on the plan, and four releases of canary is the only way to surface
  browser, ICE, and platform problems while there is still schedule room to
  react. The canary runs in its own release lane so it can be reverted without
  touching the four features above.

**Carried-over unblockers** (infrastructure, not user-facing)

- Provision the `channel_permission_overrides` collection. It is read at
  runtime by five files and created by none, so a clean deploy has broken
  channel permissions. Forum, voice, stage, and bots all inherit this.
- Generate API types from `docs/openapi-doc.yml` and fail CI when the spec
  drifts from the routes.
- Settle the four federation schema decisions listed in the plan document, so
  2.6 implements rather than decides.

**Explicitly not in 2.2:** stage channels (they need stable voice first),
mobile calling, any federation work.

## 2.3 — Server Identity and Ecosystem Beta

**Ships**

- **Per-server profiles.** Per-server display name and avatar override on top of
  the global profile, with a server-specific nickname. The global profile
  remains canonical — this is what federation's profile endpoint reads.
- **Theme scoping.** Per-server theme using the scoped sub-theme support landed
  in 2.2.

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

- **Voice channels.** First-class voice channel type, riding the stabilized
  calling stack.
- **PWA hardening.** Install reliability, offline behavior, update flow,
  desktop-class layout. Gated on fixing the plaintext-storage fallback in the
  mobile credential store, which a PWA hits directly.

**Stabilization**

- **Calling, web.** Promote from canary to supported based on 2.2–2.3 canary
  data. Exit criteria in the plan document.

**Explicitly not in 2.4:** stage channels. Building stage on an
unstable voice stack guarantees rework, so it moves to 2.5.

## 2.5 — Enterprise Identity and Stable Ecosystem

**Ships**

- **SAML / OIDC / Active Directory.** Instance-admin configuration. Not a
  per-user feature — an instance admin enables the provider and users get a
  button. Reuses the in-app browser handoff that already powers mobile
  password reset.
- **Stage channels.** Scheduled talks with a voice stage, now that voice is
  stable.
- **Bots and webhooks, stable.** API and UX frozen enough to build against
  without expecting breakage.

**Also**

- Mobile calling, entering beta now that web calling has soaked for two
  releases. The call transport interface moves to a shared package here rather
  than being copied into mobile.
- Call provider interface extracted so an instance can select its media
  backend.

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
