# Firepit Messaging Protocol

## Abstract

The firepit messaging protocol is a standard by which firepit instances may communicate between each other to facilitate federated communication.

## 1. Overview

The firepit messaging protocol provides a standard for communication through two main ways:

1. Standardizing API format
2. Providing users an ability to connect to a firepit server via a client using the standard API.

### 1.1. Scope (v1.0)

This version of the specification covers:

- 1:1 direct messaging (including cross-instance)
- Message CRUD (send, edit, delete)
- Reactions
- End-to-end encryption
- Media and file sharing
- Custom emojis
- User profiles
- Federation authentication and routing

**Explicitly out of scope for v1.0:**

- **Threads**: Threaded replies are local-only in v1. A message with `threadId` set is not propagated to federated instances. Thread federation is deferred to v1.1.
- **Group DMs (3+ participants)**: The client API supports group DM creation, but cross-instance group DMs with participants on 3+ instances are deferred to v2.0. v1.0 only federates 1:1 DMs.
- **Server channels**: Server/channel-based messaging is not federated in v1.0.
- **Presence federation**: Instances do not share online/offline status with peers. Profile `status` for remote users defaults to `offline`.
- **Typing indicators**: Not federated in v1.0.
- **Push notifications**: Cross-instance push notifications are deferred to v1.1.
- **Block/report**: Cross-instance blocking and abuse reporting are deferred to v2.0.

## 2. Conformance

As well as sections marked as non-normative, all authoring guidelines, diagrams, examples, and notes in this specification are non-normative. Everything else in this specification is normative.

The key words MAY, MUST, MUST NOT, SHOULD, and SHOULD NOT are to be interpreted as described in [[RFC2119](https://tools.ietf.org/html/rfc2119)].

## 3. Client-Server Communication

To be a useful messaging platform, firepit MUST allow the user to:
a. Send messages
b. Upload images
c. Send Emojis
d. Have profiles 1. with data such as: display names, user IDs, pronouns, about me's, location, website, etc.
e. Send Media 1. e.g. (Gifs, stickers, custom emojis, etc.)

The client should be able to act upon the requests of a user to do the above 5 major things, by making API requests to a firepit server.

All request and response bodies are JSON unless otherwise noted. Timestamps MUST be ISO 8601 UTC strings. IDs are UUIDs.

#### Error format

All endpoints return errors as:

```json
{
    "error": {
        "code": "string",
        "message": "string"
    }
}
```

Common error codes: `unauthorized`, `forbidden`, `not_found`, `bad_request`, `rate_limited`.

### 3.1 Messaging

#### POST `/api/messages`

Send a message to a conversation.

**Request:**

```json
{
  "conversation_id": "uuid",
  "content": "string",
  "is_encrypted": false,
  "encrypted_text": "string | null",
  "encryption_nonce": "string | null",
  "encryption_version": "string | null",
  "encryption_sender_public_key": "string | null",
  "type": "text" | "image" | "file" | "emoji",
  "media_id": "uuid | null",
  "reply_to": "uuid | null",
  "nonce": "string"
}
```

- `conversation_id`: The DM or channel to send to.
- `type`: `text` for plain text, `image` for an uploaded image, `file` for a file attachment, `emoji` for a custom emoji sticker.
- `media_id`: Required when `type` is `image`, `file`, or `emoji`. References an uploaded media item.
- `reply_to`: Optional message ID being replied to.
- `nonce`: Client-generated unique string for idempotency. Server MUST NOT store; used only to deduplicate retries.
- `is_encrypted`: If `true`, `content` is a placeholder (e.g. empty string or `"*"`), and the actual message is in `encrypted_text`. The server stores both fields as-is. Decryption is client-side.
- `encrypted_text`, `encryption_nonce`, `encryption_version`, `encryption_sender_public_key`: Required when `is_encrypted` is `true`. See Section 4.7 for encryption details.

**Constraints:**

| Field | Limit |
|---|---|
| `content` | Max 4,000 characters (plaintext) or 8,000 bytes (encrypted payload) |
| `nonce` | Max 256 characters |
| `reply_to` | Max 1 per message (single reply, not reply chains) |

**Response:**

```json
{
  "message": {
    "id": "uuid",
    "conversation_id": "uuid",
    "sender_id": "uuid",
    "sender_instance": "1AJ08482FIAM | null",
    "content": "string",
    "is_encrypted": false,
    "encrypted_text": "string | null",
    "encryption_nonce": "string | null",
    "encryption_version": "string | null",
    "encryption_sender_public_key": "string | null",
    "type": "text",
    "media_id": "uuid | null",
    "reply_to": "uuid | null",
    "sequence": 1042,
    "created_at": "2026-07-16T12:00:00Z"
  }
}
```

- `sequence`: Monotonically increasing integer per conversation, per sender instance. Used for pagination and deduplication (Section 4.5).
- `sender_instance`: `null` for local users. For federated users, contains the sender's IIID.

#### PATCH `/api/messages/:message_id`

Edit a message. The user MUST be the sender. The `edited_at` field is set automatically.

**Request:**

```json
{
  "content": "string",
  "is_encrypted": false,
  "encrypted_text": "string | null",
  "encryption_nonce": "string | null",
  "encryption_version": "string | null",
  "encryption_sender_public_key": "string | null"
}
```

At least one field MUST be provided. If `is_encrypted` is `true`, the encryption fields are required. Same content limits as `POST /api/messages`.

**Response:** Updated message object (same shape as POST response, with `edited_at` set).

Edits MUST be propagated to federated instances via `POST /api/federation/message/edit` (Section 4.1.2).

#### GET `/api/conversations/:conversation_id/messages`

List messages in a conversation.

**Query parameters:**

| Param    | Type    | Default | Description                            |
| -------- | ------- | ------- | -------------------------------------- |
| `limit`  | integer | 50      | Max messages to return (1–200)         |
| `before` | uuid    | —       | Return messages before this message ID |
| `after`  | uuid    | —       | Return messages after this message ID  |

**Response:**

```json
{
    "messages": [
        {
            "id": "uuid",
            "conversation_id": "uuid",
            "sender_id": "uuid",
            "sender_instance": "1AJ08482FIAM | null",
            "content": "string",
            "type": "text",
            "media_id": "uuid | null",
            "reply_to": "uuid | null",
            "sequence": 1042,
            "created_at": "2026-07-16T12:00:00Z"
        }
    ],
    "has_more": true
}
```

- `sender_instance`: `null` for local users. For federated users, contains the sender's IIID so the client knows to fetch the profile from the remote instance.

#### DELETE `/api/messages/:message_id`

Delete a message. The user MUST be the sender or a moderator.

**Response:** `204 No Content`

#### POST `/api/messages/:message_id/reactions`

Add a reaction to a message.

**Request:**

```json
{
    "emoji": "string"
}
```

**Response:** `201 Created`

#### DELETE `/api/messages/:message_id/reactions/:emoji`

Remove a reaction.

**Response:** `204 No Content`

### 3.2 Uploading Images

#### POST `/api/upload-image`

Upload an image. Request body is `multipart/form-data`.

**Form fields:**

| Field             | Type   | Required | Description                                                 |
| ----------------- | ------ | -------- | ----------------------------------------------------------- |
| `file`            | binary | yes      | The image file. MUST be JPEG, PNG, GIF, or WebP. Max 10 MB. |
| `conversation_id` | uuid   | no       | If uploading in context of a conversation                   |

**Response:**

```json
{
    "media": {
        "id": "uuid",
        "url": "/api/media/uuid",
        "mime_type": "image/png",
        "width": 1920,
        "height": 1080,
        "size_bytes": 204800,
        "created_at": "2026-07-16T12:00:00Z"
    }
}
```

### 3.3 Emojis

#### GET `/api/emojis`

List available custom emojis.

**Response:**

```json
{
    "emojis": [
        {
            "id": "uuid",
            "name": "blobcat",
            "url": "/api/media/uuid",
            "creator_id": "uuid",
            "created_at": "2026-07-16T12:00:00Z"
        }
    ]
}
```

#### POST `/api/upload-emoji`

Upload a custom emoji. Request body is `multipart/form-data`. The user MUST have the `upload_emoji` permission in the relevant server.

**Form fields:**

| Field  | Type   | Required | Description                                                                     |
| ------ | ------ | -------- | ------------------------------------------------------------------------------- |
| `file` | binary | yes      | Image file. MUST be PNG, GIF, or WebP. Max 256 KB. Recommended 128x128 px.      |
| `name` | string | yes      | Short name (1–64 chars, alphanumeric + underscores). Must be unique per server. |

**Response:**

```json
{
    "emoji": {
        "id": "uuid",
        "name": "blobcat",
        "url": "/api/media/uuid",
        "creator_id": "uuid",
        "created_at": "2026-07-16T12:00:00Z"
    }
}
```

#### DELETE `/api/emojis/:emoji_id`

Delete a custom emoji. The user MUST be the creator or a server admin.

**Response:** `204 No Content`

### 3.4 Profiles

#### GET `/api/users/:user_id`

Get a user's public profile. For federated users, the server fetches this from the remote instance and caches it per the `cache_ttl` returned by the federation endpoint.

**Response:**

```json
{
    "user": {
        "id": "uuid",
        "instance": "1AJ08482FIAM | null",
        "display_name": "string",
        "username": "string",
        "pronouns": "string | null",
        "about_me": "string | null",
        "location": "string | null",
        "website": "string | null",
        "avatar_url": "https://instance.com/api/media/uuid | null",
        "banner_url": "https://instance.com/api/media/uuid | null",
        "status": "online | idle | dnd | offline",
        "created_at": "2026-07-16T12:00:00Z"
    }
}
```

- `instance`: `null` for local users. For federated users, contains the IIID.
- `status`: Best-effort presence. For federated users, the server MAY poll the remote instance or return `offline` if presence federation is not implemented.
- `avatar_url` / `banner_url`: For local users, a relative path (`/api/media/uuid`). For federated users, a full absolute URL pointing to the remote instance.

#### PATCH `/api/me`

Update the authenticated user's profile.

**Request:**

```json
{
    "display_name": "string | null",
    "pronouns": "string | null",
    "about_me": "string | null",
    "location": "string | null",
    "website": "string | null"
}
```

All fields are optional. Only provided fields are updated. Null values clear the field.

**Response:**

```json
{
    "user": {
        "id": "uuid",
        "display_name": "string",
        "username": "string",
        "pronouns": "string | null",
        "about_me": "string | null",
        "location": "string | null",
        "website": "string | null",
        "avatar_url": "/api/media/uuid | null",
        "banner_url": "/api/media/uuid | null",
        "created_at": "2026-07-16T12:00:00Z"
    }
}
```

#### POST `/api/profile/avatar`

Upload or replace the authenticated user's avatar. Request body is `multipart/form-data`.

**Form fields:**

| Field  | Type   | Required | Description                                                       |
| ------ | ------ | -------- | ----------------------------------------------------------------- |
| `file` | binary | yes      | Image file. JPEG, PNG, or WebP. Max 4 MB. Recommended 512x512 px. |

**Response:**

```json
{
    "avatar_url": "/api/media/uuid"
}
```

### 3.5 Sending Media

#### POST `/api/upload-file`

Upload a generic file attachment (GIFs, stickers, documents). Request body is `multipart/form-data`.

**Form fields:**

| Field             | Type   | Required | Description                               |
| ----------------- | ------ | -------- | ----------------------------------------- |
| `file`            | binary | yes      | The file. Max 50 MB.                      |
| `conversation_id` | uuid   | no       | If uploading in context of a conversation |

**Response:**

```json
{
    "media": {
        "id": "uuid",
        "url": "/api/media/uuid",
        "mime_type": "string",
        "size_bytes": 1024000,
        "filename": "string",
        "created_at": "2026-07-16T12:00:00Z"
    }
}
```

#### GET `/api/media/:media_id`

Fetch an uploaded media item. Returns the raw file with the appropriate `Content-Type` header. The server SHOULD set `Cache-Control: public, max-age=31536000, immutable` for media that will not change.

For federated media, the server proxies the request to the originating instance.

**Response:** Raw binary with `Content-Type` matching the media's MIME type.

#### GET `/api/gifs/search`

Search for GIFs (via an upstream provider such as Tenor or Giphy).

**Query parameters:**

| Param   | Type    | Default | Description        |
| ------- | ------- | ------- | ------------------ |
| `q`     | string  | —       | Search query       |
| `limit` | integer | 20      | Max results (1–50) |

**Response:**

```json
{
    "results": [
        {
            "id": "string",
            "url": "string",
            "preview_url": "string",
            "width": 480,
            "height": 270
        }
    ]
}
```

### 3.6 Conversation Management

#### POST `/api/conversations`

Create or retrieve a DM conversation with a user. For cross-instance DMs, this initiates the federation handshake.

**Request:**

```json
{
    "recipient_id": "uuid | IIID:uuid"
}
```

- `recipient_id`: For local users, a plain UUID. For remote users, the `IIID:uuid` participant ID format (Section 4.3).

**Response:**

```json
{
    "conversation": {
        "id": "dm_<hex>",
        "participants": ["local-uuid", "IIID:uuid"],
        "participant_count": 2,
        "is_group": false,
        "owner_iiid": "1AJ08482FIAM",
        "created_at": "2026-07-16T12:00:00Z"
    }
}
```

- `id`: Deterministic ID for 1:1 DMs. Computed as `dm_<first 16 bytes of SHA-256 of JSON.stringify(sorted participant IDs)>`. Both instances compute the same ID independently.
- `owner_iiid`: The IIID of the owner instance — the lexicographically first IIID among all participant instances. Computed, not configurable. The owner is the source of truth for the participant list.

If the conversation already exists, returns the existing record (idempotent).

#### GET `/api/conversations`

List the authenticated user's conversations.

**Query parameters:**

| Param    | Type    | Default | Description               |
| -------- | ------- | ------- | ------------------------- |
| `limit`  | integer | 50      | Max conversations (1–100) |
| `before` | string  | —       | Cursor for pagination     |

**Response:**

```json
{
    "conversations": [
        {
            "id": "dm_<hex>",
            "participants": ["local-uuid", "IIID:uuid"],
            "participant_count": 2,
            "is_group": false,
            "owner_iiid": "1AJ08482FIAM",
            "last_message_preview": "string | null",
            "last_message_at": "2026-07-16T12:00:00Z",
            "created_at": "2026-07-16T12:00:00Z"
        }
    ],
    "has_more": true
}
```

#### GET `/api/conversations/:conversation_id`

Get a single conversation's metadata and participant list.

**Response:**

```json
{
    "conversation": {
        "id": "dm_<hex>",
        "participants": ["local-uuid", "IIID:uuid"],
        "participant_count": 2,
        "is_group": false,
        "owner_iiid": "1AJ08482FIAM",
        "created_at": "2026-07-16T12:00:00Z"
    }
}
```

For remote participants, the client SHOULD resolve profiles via `GET /api/users/:user_id` with the `IIID:uuid` ID. The server fetches the profile from the remote instance.

#### PATCH `/api/conversations/:conversation_id`

Update conversation metadata. Only the conversation owner instance can process this. If the conversation is owned by a remote instance, the server MUST forward the request to the owner.

**Request:**

```json
{
    "name": "string | null",
    "avatar_url": "string | null"
}
```

**Response:** Updated conversation object.

#### POST `/api/conversations/:conversation_id/participants`

Add a participant to a group DM. Only the conversation owner can process this.

**Request:**

```json
{
    "participant_id": "uuid | IIID:uuid"
}
```

**Response:** `201 Created`

#### DELETE `/api/conversations/:conversation_id/participants/:participant_id`

Remove a participant (or leave a conversation). Only the conversation owner can process this.

**Response:** `204 No Content`

## 4. Server-Server Communication

To facilitate federation and communication, the servers MUST establish the following formats coinciding with the previous section. The job of the server is to: store data, perform operations on said data, return said data to clients, etc.

### 4.1 Authentication

Servers MUST NOT send active session tokens to certify legitimacy.

Servers MUST send a signed JWT, which the receiving server can verify locally without contacting the origin instance. Each instance MUST expose a public key endpoint (Section 4.1.1) so that other instances can verify JWTs without a round trip.

The JWT MUST contain the following claims:

| Claim   | Type    | Description                                                                            |
| ------- | ------- | -------------------------------------------------------------------------------------- |
| `iss`   | string  | The IIID of the issuing instance                                                       |
| `sub`   | string  | The user ID on the issuing instance                                                    |
| `aud`   | string  | The IIID of the target instance                                                        |
| `iat`   | integer | Issued-at (UTC epoch seconds)                                                          |
| `exp`   | integer | Expiration (UTC epoch seconds). MUST NOT exceed 5 minutes from `iat`.                  |
| `jti`   | string  | Unique token ID for replay protection                                                  |
| `scope` | string  | Permission scope. One of: `message:send`, `message:read`, `profile:read`, `media:read` |

The JWT MUST be signed with the issuing instance's private key using Ed25519 (EdDSA).

Example:

User X on instance A wants to send a message to User Y on instance B. Instance A creates a JWT with `iss: "1AJ08482FIAM"`, `sub: "user-x-uuid"`, `aud: "1BQ93982GBNO"`, `scope: "message:send"`, and sends it with the message delivery request.

Instance B fetches Instance A's public key (once, cached per `iss`) and verifies the signature locally. No round trip to Instance A is required. If the JWT is valid, Instance B accepts the message.

#### 4.1.1 Public Key Endpoint

Every instance MUST expose a public key endpoint for JWT verification:

**GET `/api/federation/public-key`**

**Response:**

```json
{
    "iiid": "1AJ08482FIAM",
    "public_key": "base64-encoded-ed25519-public-key",
    "rotated_at": "2026-07-16T12:00:00Z"
}
```

Instances MUST cache the public key for each peer instance. If JWT verification fails with a signature mismatch, the instance SHOULD re-fetch the public key (in case of key rotation) before rejecting.

#### 4.1.2 Federation API Endpoints

These are the server-to-server endpoints that instances call on each other. All requests MUST include the JWT in the `Authorization: Bearer <token>` header.

**POST `/api/federation/conversation/init`**

Initialize a cross-instance conversation. Both instances call this on each other; the endpoint is idempotent.

**Request:**

```json
{
    "conversation_id": "dm_<hex>",
    "participants": ["1AJ08482FIAM:user-x-uuid", "1BQ93982GBNO:user-y-uuid"],
    "owner_iiid": "1AJ08482FIAM",
    "created_by": "1AJ08482FIAM:user-x-uuid",
    "created_at": "2026-07-16T12:00:00Z"
}
```

- `owner_iiid`: The IIID of the owner instance, computed as the lexicographically first IIID among all participants' instances. Both instances MUST compute this independently and agree.

**Response:**

```json
{
    "status": "created"
}
```

The receiving instance MUST create a local conversation record with the same `conversation_id`, `owner_iiid`, and participant list. If the conversation already exists, return `200 OK` (idempotent).

**POST `/api/federation/message`**

Deliver a message to this instance.

**Request:**

```json
{
    "conversation_id": "dm_<hex>",
    "sender_id": "user-uuid",
    "sender_instance": "1AJ08482FIAM",
    "content": "string",
    "is_encrypted": false,
    "encrypted_text": "string | null",
    "encryption_nonce": "string | null",
    "encryption_version": "string | null",
    "encryption_sender_public_key": "string | null",
    "type": "text",
    "media_id": "uuid | null",
    "reply_to": "uuid | null",
    "sequence": 1042,
    "nonce": "string",
    "created_at": "2026-07-16T12:00:00Z"
}
```

- `is_encrypted`: If `true`, `content` is a placeholder and the actual message is in `encrypted_text`. The receiving instance stores both fields and delivers them to the client. Decryption is client-side.
- `sequence`: Assigned by the sender's instance. See Section 4.5 for ordering rules.

**Response:**

```json
{
    "status": "delivered"
}
```

**POST `/api/federation/message/delete`**

Notify this instance that a message has been deleted.

**Request:**

```json
{
    "conversation_id": "dm_<hex>",
    "message_id": "uuid",
    "deleted_by": "user-uuid",
    "deleted_at": "2026-07-16T12:00:00Z"
}
```

**Response:**

```json
{
    "status": "deleted"
}
```

The receiving instance MUST mark the message as deleted (soft delete via `removedAt` / `removedBy` fields) and stop returning it in message lists.

**POST `/api/federation/message/edit`**

Notify this instance that a message has been edited.

**Request:**

```json
{
  "conversation_id": "dm_<hex>",
  "message_id": "uuid",
  "edited_by": "user-uuid",
  "content": "string",
  "is_encrypted": false,
  "encrypted_text": "string | null",
  "encryption_nonce": "string | null",
  "encryption_version": "string | null",
  "encryption_sender_public_key": "string | null",
  "edited_at": "2026-07-16T12:00:00Z"
}
```

**Response:**

```json
{
  "status": "edited"
}
```

The receiving instance MUST update the message content and set `edited_at`. If the message was encrypted, the encrypted fields replace the previous values.

**POST `/api/federation/message/reaction`**

Notify this instance that a reaction was added to a message.

**Request:**

```json
{
  "conversation_id": "dm_<hex>",
  "message_id": "uuid",
  "user_id": "user-uuid",
  "emoji": "string",
  "created_at": "2026-07-16T12:00:00Z"
}
```

**Response:**

```json
{
  "status": "reacted"
}
```

**DELETE `/api/federation/message/reaction`**

Notify this instance that a reaction was removed from a message.

**Request:**

```json
{
  "conversation_id": "dm_<hex>",
  "message_id": "uuid",
  "user_id": "user-uuid",
  "emoji": "string"
}
```

**Response:**

```json
{
  "status": "unreacted"
}
```

The receiving instance MUST add or remove the reaction from its local copy. Reactions are stored as counts — the receiving instance does not need to track which individual users reacted, only the emoji and count.

**GET `/api/federation/user/:user_id`**

Fetch a user profile from this instance. Used by remote instances to resolve profiles.

**Response:**

```json
{
    "user": {
        "id": "uuid",
        "display_name": "string",
        "username": "string",
        "pronouns": "string | null",
        "about_me": "string | null",
        "avatar_url": "https://instance.com/api/media/uuid | null",
        "dm_encryption_public_key": "string | null",
        "dm_encryption_enabled": false,
        "status": "online | idle | dnd | offline"
    },
    "cache_ttl": 300
}
```

- `dm_encryption_public_key`: Base64-encoded Curve25519 public key for E2EE. `null` if the user has not published a key.
- `dm_encryption_enabled`: Whether the user has enabled E2EE for DMs. Both users must have this `true` for encrypted federation.
- `avatar_url`: Full absolute URL (not a relative path). The requesting instance can use this directly without constructing a URL.
- `cache_ttl`: Recommended cache duration in seconds. The requesting instance SHOULD cache this profile for at least `cache_ttl` seconds before re-fetching. A value of `0` means do not cache. The default is **300 seconds (5 minutes)**. Instances SHOULD respect this to balance freshness with performance — fetching profiles on every message load would be prohibitively slow for cross-instance conversations.

**GET `/api/federation/media/:media_id`**

Fetch media from this instance. Returns the raw file with appropriate `Content-Type`.

**Response:** Raw binary with full `Content-Type` header. The response MUST include `Cache-Control: public, max-age=31536000, immutable` for media that will not change, and an `ETag` header for conditional requests.

The requesting instance SHOULD cache fetched media locally to avoid repeated cross-instance round trips. Cached media SHOULD be stored with the response's `Cache-Control` directives.

**GET `/api/federation/conversation/:conversation_id/messages`**

Fetch messages from a conversation. Returns messages from all participants on this instance (i.e., messages sent by this instance's users in the conversation).

**Query parameters:**

| Param             | Type    | Default | Description                                 |
| ----------------- | ------- | ------- | ------------------------------------------- |
| `limit`           | integer | 50      | Max messages (1–200)                        |
| `before_sequence` | integer | —       | Return messages before this sequence number |
| `after_sequence`  | integer | —       | Return messages after this sequence number  |

**Response:**

```json
{
    "messages": [
        {
            "id": "uuid",
            "sender_id": "uuid",
            "sender_instance": "1AJ08482FIAM",
            "content": "string",
            "is_encrypted": false,
            "encrypted_text": "string | null",
            "encryption_nonce": "string | null",
            "encryption_version": "string | null",
            "encryption_sender_public_key": "string | null",
            "type": "text",
            "media_id": "uuid | null",
            "reply_to": "uuid | null",
            "sequence": 1042,
            "removed_at": "2026-07-16T12:00:00Z | null",
            "removed_by": "user-uuid | null",
            "edited_at": "2026-07-16T12:00:00Z | null",
            "created_at": "2026-07-16T12:00:00Z"
        }
    ],
    "has_more": true
}
```

### 4.2 Routing

Firepit instances can use a routing table to find other instances. To lookup an instance, the requestee must have the 12 character Instance Identification ID (IIID).

An IIID Looks like this:

`1AJ08482FIAM`

the characters that are in an ID, MUST be A-Z or 0-9.

A routing table entry may look like this:

`1AJ08482FIAM:firepit.example.com`

The colon MUST be present, and acts as a separator. There MUST NOT be a protocol before the URL, as all firepit instances MUST be HTTPS compatible, and accept such queries. As such, adding `https://` before a url is not needed.

See Section 5. for more information about storing and managing a routing table.

### 4.3. Storage

Every user MUST belong to an instance. Cross instance communication data (e.g. Messages), are stored based on user.

The Instance that a user is registered on MUST store only messages sent by that user in a cross instance chat.

Example:

Instance A's user: User X, send a message to Instance B's user: User Y.

User X's message, is stored on Instance A's server, and looked up by Instance B when needed. Instance B MAY cache User X's messages on User Y's device, but Instance B MUST NOT retain a copy of User X's messages. This is the same for Instance A.

The reasoning for this is both: moderation and privacy. If a moderator on Instance A needs to delete User X's messages because the account was deleted, they cannot do so if a copy of that data resides on Instance B. If only Instance A has a copy of User X's messages, the content of the messages is more secure against instances with predatory tracking practices or malicious intent, because that data doesn't exist on Instance B's server.

Firepit instances keep track of DM and chat participants. When a DM is between two users on different instances, the instance MUST store the other user's participant ID in the following manner:

ParticipantID: `1AJ08482FIAM:user-uuid-here`

What this means:

The instance `1AJ08482FIAM` keeps track of its users, so the other instance doesn't have to. If we store a local user ID from instance `1AJ08482FIAM` on our instance, the ID could collide with a local user ID. The prefixed format prevents this and signals to a given instance when a conversation occurs between instances.

The value after the colon (`:`) is the unique user ID on the respective instance. The responding instance (`1AJ08482FIAM`) will look up the user with that ID in its own database and return the relevant data.

Because Instance A MUST NOT store messages from users on Instance B, network round trips don't have to occur as often, and while Instance B is offline, users on Instance A can queue messages for users on that instance for when it comes back up.

#### 4.3.1. Media Storage

Media storage will function the same as message storage: An Instance MUST NOT store media from a different instance. This media can be looked up from the other instance when needed.

### 4.4. Conversation Lifecycle

A conversation is the container for messages between two or more participants. Every conversation has a single **owner instance** — the source of truth for the participant list and conversation metadata.

#### 4.4.1 Conversation ID and Ownership

The conversation ID is deterministic and computed by both instances independently. For 1:1 DMs, the ID is derived from a SHA-256 hash of the sorted participant IDs (using the `IIID:uuid` format for remote participants):

```
conversation_id = "dm_" + hex(SHA-256(JSON.stringify(sorted([participant1, participant2])))[0:16])
```

Because both instances sort the same two participant IDs and hash them, they arrive at the same conversation ID without communicating. This eliminates the need for an ID negotiation step.

The **owner instance** is the instance whose IIID sorts first lexicographically. Both instances compute this independently, so they always agree on who the owner is — even if both initiate the DM simultaneously. This resolves the concurrent creation race condition: if User X (Instance A) and User Y (Instance B) both press "DM" at the same time, both compute the same conversation ID and both agree on which instance owns it.

#### 4.4.2 Conversation Creation

When User X on Instance A initiates a DM with User Y on Instance B:

1. Instance A computes the deterministic conversation ID and determines the owner (lexicographically first IIID).
2. Instance A creates a local conversation record with `owner_iiid` set to the computed owner.
3. Instance A calls `POST /api/federation/conversation/init` on Instance B.
4. Instance B creates a mirror conversation record with the same `conversation_id` and `owner_iiid`.
5. Both instances now agree on the conversation.

If Instance B is offline, Instance A queues the `conversation/init` request and retries per Section 4.8.

If both instances initiate the DM concurrently, each sends `conversation/init` to the other. The endpoint is idempotent (returns `200 OK` if the conversation already exists), so both records are created with the correct `owner_iiid`.

#### 4.4.3 Participant Management

The conversation owner instance is the only instance that MAY modify the participant list. When participants change:

1. The owner instance updates its local record.
2. The owner instance calls `POST /api/federation/conversation/init` on each newly added participant's instance (to ensure they have the conversation record).
3. For removals, the owner calls `DELETE /api/federation/conversation/:conversation_id/participant/:participant_id` on the affected instance.

Non-owner instances MUST NOT modify the participant list locally. If a non-owner receives a participant change, it MUST verify the change originated from the owner instance (via the JWT's `iss` claim matching `owner_iiid`).

### 4.5. Sequence and Ordering

Every message has a `sequence` field — a monotonically increasing integer. Sequences are assigned per-conversation, per-sender-instance. That is:

- Instance A assigns sequences 1, 2, 3... for messages from its own users in a given conversation.
- Instance B independently assigns sequences 1, 2, 3... for messages from its own users in the same conversation.

This avoids requiring a central sequencer. Each instance manages its own counter with no cross-instance coordination.

#### 4.5.1 Ordering Rule

To render a unified timeline, clients MUST sort messages by `created_at` (ascending). If two messages have identical timestamps (unlikely but possible), the tiebreaker is:

1. `sender_instance` — lexicographic order of the IIID.
2. `sequence` — numeric order within the same instance.

In practice, the `created_at` timestamp is sufficient for ordering. The `sequence` field is used for pagination and deduplication on the sender's instance, not as a global ordering mechanism.

#### 4.5.2 Pagination

The federation `GET /api/federation/conversation/:conversation_id/messages` endpoint supports pagination via `before_sequence` and `after_sequence` query parameters. These refer to the sender's instance's sequence, not a global sequence.

To fetch a time range, clients SHOULD use the client API's `before` / `after` parameters (which accept message UUIDs) instead.

### 4.6. Message Deletion

When a user deletes a message, the deletion MUST be propagated to all instances that have participants in the conversation.

#### 4.6.1 Deletion Flow

1. User X deletes a message on Instance A (the sender's instance).
2. Instance A soft-deletes the message locally (`removedAt` timestamp, `removedBy` user ID).
3. Instance A calls `POST /api/federation/message/delete` on every other instance with participants in the conversation.
4. Each receiving instance soft-deletes the message locally.
5. Soft-deleted messages are excluded from message list responses. The `removed_at` field MAY be returned to indicate a message was deleted (e.g., "Message deleted" placeholder in the UI).

#### 4.6.2 Moderation Deletion

A moderator on Instance A MAY delete any message from Instance A's users. The same propagation flow applies. Moderators MUST NOT delete messages from users on other instances — that is the responsibility of the other instance's moderators.

### 4.7. Encryption

Cross-instance DMs SHOULD be end-to-end encrypted (E2EE) using the same Curve25519 + XChaCha20-Poly1305 scheme used for local DMs (Section 3.4, `dm-encryption`).

#### 4.7.1 Key Exchange

When a cross-instance DM is created:

1. Each client fetches the remote user's public key via the federation user endpoint (`dm_encryption_public_key` field).
2. Each client derives a shared symmetric key using X25519 ECDH: `sharedKey = BLAKE2b(senderPrivateKey, recipientPublicKey || canonical(publicKeys) || "firepit-dm-v1")`.
3. Messages are encrypted client-side before sending. The server receives only ciphertext.

The server-side encryption fields (`encrypted_text`, `encryption_nonce`, `encryption_version`, `encryption_sender_public_key`) are stored and delivered as-is. The server NEVER sees plaintext.

#### 4.7.2 Encryption Requirements

- If both users have `dm_encryption_enabled: true`, the client MUST encrypt messages. The `is_encrypted` flag MUST be `true`.
- If either user has not enabled E2EE, messages are sent as plaintext over TLS. The `is_encrypted` flag MUST be `false`.
- Instances MUST NOT cache or store encryption private keys. Private keys remain on the client device.
- If a client cannot decrypt a received message (e.g., missing private key after device loss), it MUST display a placeholder (e.g., "Unable to decrypt message").

#### 4.7.3 Transport Security

All federation API calls MUST be made over HTTPS (TLS 1.2+). This provides transport-layer encryption even when E2EE is not enabled.

### 4.8. Offline Queue

When a peer instance is unreachable, the sending instance queues messages locally for later delivery.

#### 4.8.1 Queue Behavior

- Messages are queued per-conversation, with a maximum queue size of **1,000 messages per conversation**.
- Queued messages are stored in the instance's database with a `next_retry_at` timestamp and `retry_count`.
- Retry uses exponential backoff: initial interval **30 seconds**, doubling each attempt, capping at **10 minutes**.
- After **7 days** without successful delivery, queued messages are discarded and the sender is notified via a system message (e.g., "Message could not be delivered").
- When a peer instance comes back online, queued messages are delivered in FIFO order. The queue MUST NOT be delivered out of order.

#### 4.8.2 Queue Recovery

If an instance restarts, it MUST resume delivery of queued messages. The queue is durable (stored in the database, not in memory).

#### 4.8.3 Conversation Init Queue

The `POST /api/federation/conversation/init` request is also queued if the peer is offline. Conversation creation and message delivery are independent queues — a conversation can be created even if subsequent messages are queued.

### 4.9. Instance Identity

Every firepit instance MUST have a unique IIID and MUST prove ownership of its domain. This section defines how instances are bootstrapped and how identity is verified.

#### 4.9.1 IIID Generation

When a firepit instance is first installed, it MUST generate a random 12-character IIID (uppercase A-Z, 0-9). The IIID MUST be generated using a cryptographically secure random source and MUST NOT be changed after generation. The IIID is the instance's permanent identity.

The admin MAY manually specify an IIID during setup, but it MUST be exactly 12 characters matching the character set. If not specified, the instance generates one automatically.

The IIID and the instance's domain are published together at the well-known endpoint (Section 4.9.2).

#### 4.9.2 Well-Known Endpoint

Every instance MUST expose a well-known JSON file at:

```
GET https://<domain>/.well-known/firepit/instance.json
```

**Response:**

```json
{
    "iiid": "1AJ08482FIAM",
    "domain": "firepit.example.com",
    "name": "Example Firepit",
    "description": "A community firepit instance",
    "protocol_version": "1.0",
    "public_key_url": "https://firepit.example.com/api/federation/public-key"
}
```

- `iiid`: The instance's IIID.
- `domain`: The instance's canonical domain. MUST match the domain in the request URL.
- `protocol_version`: The spec version this instance implements (Section 6).
- `public_key_url`: The full URL for the instance's public key endpoint.

#### 4.9.3 Identity Verification

When an instance receives a federation request from an unknown peer, or when the routing table is refreshed, the receiving instance SHOULD verify the sender's identity:

1. Look up the sender's IIID in the routing table to get the expected domain.
2. Fetch `https://<expected-domain>/.well-known/firepit/instance.json`.
3. Confirm the `iiid` in the response matches the expected IIID.
4. Confirm the `domain` in the response matches the expected domain.
5. Optionally, verify the `public_key_url` is reachable and returns a valid key.

If verification fails, the instance SHOULD reject requests from that IIID and log a warning. This prevents routing table poisoning — a malicious entry claiming to be a well-known instance cannot pass verification without control of the target domain.

Verification SHOULD be performed once per IIID on first contact, and re-verified if the routing table entry changes (domain update) or if JWT verification fails unexpectedly.

#### 4.9.4 Instance Key Rotation

Instances MAY rotate their Ed25519 keypair. When rotating:

1. Generate a new Ed25519 keypair.
2. Update the `public_key` and `rotated_at` fields at `GET /api/federation/public-key`.
3. Continue accepting requests signed with the old key for a grace period of **24 hours** to allow cached keys to expire.
4. After the grace period, only the new key is valid.

Instances that cache public keys MUST re-fetch when they receive a JWT with a signature that doesn't match the cached key (already specified in Section 4.1.1).

## 5. Routing Tables

A routing table is a plain text file that maps IIIDs to instance domains. Routing tables are identified by URL and fetched by instances to resolve peer instances.

### 5.1. Format

A routing table is a UTF-8 text file. Each line is either a comment, a blank, or a routing entry.

- Lines starting with `#` are comments and MUST be ignored by parsers.
- Blank lines MUST be ignored.
- Each routing entry is a single line in the format: `IIID:domain`
- The colon MUST be present and acts as a separator.
- `IIID` MUST be exactly 12 characters, uppercase A-Z or 0-9.
- `domain` MUST be a valid hostname, without a protocol prefix. All firepit instances MUST be HTTPS compatible, so `https://` MUST NOT be prepended.

Example routing table (`firepit-instances.txt`):

```
# Standard Firepit Routing Table
# https://github.com/firepit-chat/firepit-instances

# Community instances
1AJ08482FIAM:firepit.example.com
1BQ93982GBNO:chat.otherhost.org
1CK04721DZLP:messaging.firepit.dev

# Admin-managed instances
1DM12345EFGH:internal.company.com
```

### 5.2. Hosting

Routing tables are plain text files served over HTTPS. An instance admin configures one or more routing table URLs in their instance's configuration. Because the file is just plain text, it CAN be hosted anywhere:

- A GitHub repository (raw URL)
- A static file host or CDN
- The instance's own server
- Any HTTPS-capable file server

Example admin configuration:

```json
{
    "routing_tables": [
        "https://raw.githubusercontent.com/firepit-chat/firepit-instances/main/firepit-instances.txt",
        "https://myserver.com/custom-instances.txt"
    ]
}
```

### 5.3. Fetching and Caching

Instances MUST fetch configured routing tables periodically to stay current. The recommended fetch interval is every **1 hour**, but instances MAY use a different interval.

When fetching a routing table, instances SHOULD:

1. Send a conditional request with `If-Modified-Since` or `If-None-Match` (ETag) headers to avoid unnecessary transfers.
2. Respect `Cache-Control` headers from the server.
3. Merge entries from all configured routing tables. If the same IIID appears in multiple tables, the entry from the table listed first in the configuration takes precedence.
4. Remove any entries from their routing table that are no longer present in the fetched file (i.e., the instance is no longer listed and should be forgotten).

If a routing table URL is unreachable, the instance SHOULD retain its last-known routing table and retry on the next interval.

### 5.4. Server Selection

A firepit instance MAY select and use any routing table it so chooses, as long as the table is compliant with the format defined in Section 5.1.

A firepit instance MAY configure multiple routing table URLs. Entries from all tables are merged as described in Section 5.3.

### 5.5. Adding an Instance to a Routing Table

Any instance admin MAY add their instance to a routing table they have write access to, or publish their own routing table and have other instances reference it. There is no central authority required — the system is open by design.

For community discoverability, instances SHOULD publish their IIID and domain on their website or a well-known endpoint (e.g., `https://example.com/.well-known/firepit/instance.json`):

```json
{
    "iiid": "1AJ08482FIAM",
    "domain": "firepit.example.com",
    "name": "Example Firepit",
    "description": "A community firepit instance"
}
```

## 6. Protocol Versioning

Every instance advertises its protocol version in the well-known endpoint (Section 4.9.2) as `protocol_version`. This version follows semantic versioning: `MAJOR.MINOR`.

### 6.1 Version Compatibility

- **Major version mismatch**: Instances MUST NOT federate. A major version change indicates breaking protocol changes (incompatible message formats, new required fields, changed authentication). The receiving instance SHOULD return `426 Upgrade Required` with the required version in the `X-Firepit-Required-Version` header.
- **Minor version mismatch**: Instances MAY federate. A minor version change indicates additive, backward-compatible changes (new optional fields, new endpoints). Instances SHOULD ignore fields and endpoints they do not recognize.

### 6.2 Version Negotiation

When an instance sends a federation request, it SHOULD include a header:

```
X-Firepit-Protocol-Version: 1.0
```

The receiving instance checks this against its own version. If incompatible, it responds with `426 Upgrade Required`.

### 6.3 Current Version

This specification defines version **1.0**.

## 7. Future Work

The following features are planned for future versions of this specification. Implementers SHOULD NOT build these features based on this document — they are subject to change.

### v1.1

- **Thread federation**: Threaded replies propagated across instances. Requires a `thread_id` field on the federation message endpoint and a thread message fetch endpoint.
- **Push notifications**: Cross-instance push delivery. The originating instance sends a push payload to the peer instance, which forwards it to the user's device via Expo Push or similar.
- **Presence federation**: Instances share user online/offline/idle status via a lightweight polling or WebSocket mechanism.

### v2.0

- **Group DM federation**: Cross-instance group conversations with 3+ participants. Requires a new conversation creation flow with multi-party handshake and distributed participant management.
- **Block/report**: Cross-instance blocking (user blocks a remote user, their instance notifies the remote instance to suppress messages) and abuse reporting (user reports a message to their moderator, who forwards the report to the remote instance).
- **Server/channel federation**: Server channels accessible to users on remote instances. Requires channel discovery, role-based access control federation, and channel message archival.
- **Message search federation**: Search across federated message history by querying peer instances.
