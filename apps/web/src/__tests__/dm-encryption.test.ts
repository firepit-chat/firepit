import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    decryptMessageTextIfNeeded,
    encryptDmText,
    ensurePublishedDmEncryptionKey,
} from "@/lib/dm-encryption";
import type { DirectMessage } from "@/lib/types";

/**
 * Byte-level interop between the two clients.
 *
 * `libsodium-wrappers` is what the web client runs. Mobile runs the same
 * libsodium calls through react-native-libsodium, but its native binding takes
 * strings for plaintext/additional data and encodes them as UTF-8, whereas web
 * passes `from_string(...)` byte arrays. The reference helpers below do exactly
 * what `apps/mobile/src/lib/firepit/dm-encryption.ts` does, so a mismatch in
 * key derivation, AAD handling, or base64 would fail here rather than on a
 * device.
 */

const KEY_CONTEXT = "firepit-dm-v1";
const KEY_VERSION = "xchacha20poly1305-v1";
const PLACEHOLDER = "[Encrypted message unavailable]";

type Sodium = typeof import("libsodium-wrappers").default;

async function loadSodium(): Promise<Sodium> {
    const mod = await import("libsodium-wrappers");
    await mod.default.ready;
    return mod.default;
}

function concat(...chunks: Uint8Array[]): Uint8Array {
    const out = new Uint8Array(
        chunks.reduce((sum, chunk) => sum + chunk.length, 0),
    );
    let offset = 0;
    for (const chunk of chunks) {
        out.set(chunk, offset);
        offset += chunk.length;
    }
    return out;
}

function mobileDeriveKey(
    sodium: Sodium,
    privateKey: Uint8Array,
    senderPublicKey: Uint8Array,
    peerPublicKey: Uint8Array,
): Uint8Array {
    const shared = sodium.crypto_scalarmult(privateKey, peerPublicKey);
    const comparison = sodium.compare(senderPublicKey, peerPublicKey);
    const left = comparison <= 0 ? senderPublicKey : peerPublicKey;
    const right = comparison <= 0 ? peerPublicKey : senderPublicKey;
    const context = new TextEncoder().encode(KEY_CONTEXT);
    return sodium.crypto_generichash(32, concat(shared, left, right, context));
}

function mobileEncrypt(
    sodium: Sodium,
    sender: { privateKeyBase64: string; publicKeyBase64: string },
    recipientPublicKeyBase64: string,
    text: string,
    context: string,
) {
    const senderPublic = sodium.from_base64(
        sender.publicKeyBase64,
        sodium.base64_variants.ORIGINAL,
    );
    const senderPrivate = sodium.from_base64(
        sender.privateKeyBase64,
        sodium.base64_variants.ORIGINAL,
    );
    const recipientPublic = sodium.from_base64(
        recipientPublicKeyBase64,
        sodium.base64_variants.ORIGINAL,
    );
    const key = mobileDeriveKey(
        sodium,
        senderPrivate,
        senderPublic,
        recipientPublic,
    );
    const nonce = sodium.randombytes_buf(
        sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES,
    );
    // Mobile hands the native binding a JS string for both plaintext and AAD.
    const cipher = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
        text,
        context,
        null,
        nonce,
        key,
    );
    return {
        encryptedText: sodium.to_base64(
            cipher,
            sodium.base64_variants.ORIGINAL,
        ),
        encryptionNonce: sodium.to_base64(
            nonce,
            sodium.base64_variants.ORIGINAL,
        ),
        encryptionSenderPublicKey: sender.publicKeyBase64,
        encryptionVersion: KEY_VERSION,
    };
}

function encryptedMessage(
    overrides: Partial<DirectMessage> & {
        payload: {
            encryptedText: string;
            encryptionNonce: string;
            encryptionSenderPublicKey: string;
            encryptionVersion: string;
        };
    },
): DirectMessage {
    const { payload, ...rest } = overrides;
    return {
        $id: rest.$id ?? "msg-1",
        senderId: rest.senderId ?? "alice",
        conversationId: rest.conversationId ?? "conv-1",
        text: "",
        isEncrypted: true,
        ...payload,
        ...rest,
    } as DirectMessage;
}

const fetchMock = vi.fn();

beforeEach(() => {
    window.localStorage.clear();
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("DM encryption interop", () => {
    it("decrypts a web-encrypted message", async () => {
        const alice = await ensurePublishedDmEncryptionKey("alice");
        const bob = await ensurePublishedDmEncryptionKey("bob");

        const payload = await encryptDmText({
            context: "conv-1",
            recipientPublicKeyBase64: bob.publicKeyBase64,
            senderKeyPair: alice,
            text: "web to mobile",
        });

        const decrypted = await decryptMessageTextIfNeeded({
            message: encryptedMessage({
                senderId: "alice",
                conversationId: "conv-1",
                payload,
            }),
            userId: "bob",
        });

        expect(decrypted.text).toBe("web to mobile");
    });

    it("decrypts a mobile-encrypted message", async () => {
        const sodium = await loadSodium();
        const alice = await ensurePublishedDmEncryptionKey("alice");
        const bob = await ensurePublishedDmEncryptionKey("bob");

        const payload = mobileEncrypt(
            sodium,
            bob,
            alice.publicKeyBase64,
            "mobile to web",
            "conv-1",
        );

        const decrypted = await decryptMessageTextIfNeeded({
            message: encryptedMessage({
                senderId: "bob",
                conversationId: "conv-1",
                payload,
            }),
            userId: "alice",
        });

        expect(decrypted.text).toBe("mobile to web");
    });

    it("falls back to legacy (unbound) additional data", async () => {
        const sodium = await loadSodium();
        const alice = await ensurePublishedDmEncryptionKey("alice");
        const bob = await ensurePublishedDmEncryptionKey("bob");

        // Old mobile builds sealed with no AAD. Empty string and null are the
        // same to libsodium, so this is the pre-fix wire format.
        const payload = mobileEncrypt(
            sodium,
            bob,
            alice.publicKeyBase64,
            "legacy message",
            "",
        );

        const decrypted = await decryptMessageTextIfNeeded({
            message: encryptedMessage({
                senderId: "bob",
                conversationId: "conv-1",
                payload,
            }),
            userId: "alice",
        });

        expect(decrypted.text).toBe("legacy message");
    });

    it("refuses a ciphertext bound to a different conversation", async () => {
        const sodium = await loadSodium();
        const alice = await ensurePublishedDmEncryptionKey("alice");
        const bob = await ensurePublishedDmEncryptionKey("bob");

        const payload = mobileEncrypt(
            sodium,
            bob,
            alice.publicKeyBase64,
            "bound to conv-a",
            "conv-a",
        );

        const decrypted = await decryptMessageTextIfNeeded({
            message: encryptedMessage({
                senderId: "bob",
                conversationId: "conv-b",
                payload,
            }),
            userId: "alice",
        });

        expect(decrypted.text).toBe(PLACEHOLDER);
    });

    it("round-trips non-ASCII text", async () => {
        const sodium = await loadSodium();
        const alice = await ensurePublishedDmEncryptionKey("alice");
        const bob = await ensurePublishedDmEncryptionKey("bob");
        const text = "héllo 🌍 — ünïcode";

        const fromWeb = await encryptDmText({
            context: "conv-1",
            recipientPublicKeyBase64: bob.publicKeyBase64,
            senderKeyPair: alice,
            text,
        });
        const webDecrypted = await decryptMessageTextIfNeeded({
            message: encryptedMessage({
                senderId: "alice",
                conversationId: "conv-1",
                payload: fromWeb,
            }),
            userId: "bob",
        });
        expect(webDecrypted.text).toBe(text);

        const fromMobile = mobileEncrypt(
            sodium,
            bob,
            alice.publicKeyBase64,
            text,
            "conv-1",
        );
        const mobileDecrypted = await decryptMessageTextIfNeeded({
            message: encryptedMessage({
                senderId: "bob",
                conversationId: "conv-1",
                payload: fromMobile,
            }),
            userId: "alice",
        });
        expect(mobileDecrypted.text).toBe(text);
    });
});
