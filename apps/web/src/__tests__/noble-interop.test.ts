import { beforeAll, describe, expect, it } from "vitest";

import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import { x25519 } from "@noble/curves/ed25519.js";
import { blake2b } from "@noble/hashes/blake2.js";
import { base64 } from "@scure/base";

/**
 * Wire-format guard for replacing `libsodium-wrappers` with `@noble/*` on the
 * client. The noble implementation is different code, but it must produce the
 * exact bytes libsodium produced (and still produces in old releases) or
 * existing encrypted DMs stop decrypting. Keep libsodium-wrappers as a dev
 * dependency purely so this test can compare the two.
 */

const KEY_CONTEXT = "firepit-dm-v1";

type Sodium = typeof import("libsodium-wrappers").default;

let sodium: Sodium;

beforeAll(async () => {
    const mod = await import("libsodium-wrappers");
    await mod.default.ready;
    sodium = mod.default;
});

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

function derive(
    shared: Uint8Array,
    a: Uint8Array,
    b: Uint8Array,
): Uint8Array {
    const left = sodium.compare(a, b) <= 0 ? a : b;
    const right = sodium.compare(a, b) <= 0 ? b : a;
    return concat(shared, left, right, new TextEncoder().encode(KEY_CONTEXT));
}

describe("noble ⇄ libsodium wire compatibility", () => {
    const alicePrivate = new Uint8Array(32).fill(1);
    const bobPrivate = new Uint8Array(32).fill(2);

    it("derives identical X25519 public keys", () => {
        expect(
            Buffer.from(x25519.getPublicKey(alicePrivate)).toString("hex"),
        ).toBe(
            Buffer.from(sodium.crypto_scalarmult_base(alicePrivate)).toString(
                "hex",
            ),
        );
    });

    it("derives identical shared secrets", () => {
        const alicePublic = sodium.crypto_scalarmult_base(alicePrivate);
        const bobPublic = sodium.crypto_scalarmult_base(bobPrivate);

        const nobleShared = x25519.getSharedSecret(
            alicePrivate,
            bobPublic,
        );
        const sodiumShared = sodium.crypto_scalarmult(
            alicePrivate,
            bobPublic,
        );

        expect(Buffer.from(nobleShared).toString("hex")).toBe(
            Buffer.from(sodiumShared).toString("hex"),
        );
    });

    it("derives the same BLAKE2b-256 key material", () => {
        const alicePublic = x25519.getPublicKey(alicePrivate);
        const bobPublic = x25519.getPublicKey(bobPrivate);
        const shared = x25519.getSharedSecret(alicePrivate, bobPublic);

        const nobleMaterial = concat(
            shared,
            alicePublic,
            bobPublic,
            new TextEncoder().encode(KEY_CONTEXT),
        );
        const nobleKey = blake2b(nobleMaterial, { dkLen: 32 });

        const sodiumShared = sodium.crypto_scalarmult(
            alicePrivate,
            bobPublic,
        );
        const sodiumKey = sodium.crypto_generichash(
            32,
            derive(sodiumShared, alicePublic, bobPublic),
        );

        expect(Buffer.from(nobleKey).toString("hex")).toBe(
            Buffer.from(sodiumKey).toString("hex"),
        );
    });

    it("noble-encrypted ciphertext decrypts with libsodium", () => {
        const bobPublic = x25519.getPublicKey(bobPrivate);
        const alicePublic = x25519.getPublicKey(alicePrivate);
        const shared = x25519.getSharedSecret(alicePrivate, bobPublic);
        const key = blake2b(
            concat(
                shared,
                alicePublic,
                bobPublic,
                new TextEncoder().encode(KEY_CONTEXT),
            ),
            { dkLen: 32 },
        );
        const nonce = new Uint8Array(24).fill(9);
        const aad = new TextEncoder().encode("conversation-1");

        const ciphertext = xchacha20poly1305(key, nonce, aad).encrypt(
            new TextEncoder().encode("hello from noble"),
        );

        const plaintext = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
            null,
            ciphertext,
            aad,
            nonce,
            key,
        );

        expect(new TextDecoder().decode(plaintext)).toBe("hello from noble");
    });

    it("libsodium-encrypted ciphertext decrypts with noble", () => {
        const bobPublic = x25519.getPublicKey(bobPrivate);
        const alicePublic = x25519.getPublicKey(alicePrivate);
        const shared = sodium.crypto_scalarmult(alicePrivate, bobPublic);
        const key = sodium.crypto_generichash(
            32,
            derive(shared, alicePublic, bobPublic),
        );
        const nonce = new Uint8Array(24).fill(4);
        const aad = new TextEncoder().encode("conversation-1");

        const ciphertext = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
            new TextEncoder().encode("hello from libsodium"),
            aad,
            null,
            nonce,
            key,
        );

        const plaintext = xchacha20poly1305(key, nonce, aad).decrypt(
            ciphertext,
        );

        expect(new TextDecoder().decode(plaintext)).toBe(
            "hello from libsodium",
        );
    });

    it("uses the same padded base64 alphabet", () => {
        const bytes = new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255]);
        expect(base64.encode(bytes)).toBe(
            sodium.to_base64(bytes, sodium.base64_variants.ORIGINAL),
        );
    });
});
