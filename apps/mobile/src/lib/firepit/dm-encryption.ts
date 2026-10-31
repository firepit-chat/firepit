import sodium, { base64_variants } from "react-native-libsodium";
import * as SecureStore from "expo-secure-store";
import { authHeaders } from "@/lib/firepit/http";
import type { DirectMessage } from "@/lib/firepit/types";

const KEY_VERSION = "xchacha20poly1305-v1";
const KEY_CONTEXT = "firepit-dm-v1";
const STORAGE_KEY_PREFIX = "firepit.dm.encryption";

export const ENCRYPTED_MESSAGE_PLACEHOLDER = "[Encrypted message unavailable]";

const volatileKeyPairs = new Map<string, DmEncryptionKeyPair>();
const pendingKeyPairs = new Map<string, Promise<DmEncryptionKeyPair>>();

type DmEncryptionKeyPair = {
    privateKeyBase64: string;
    publicKeyBase64: string;
    version: string;
};

type DmEncryptedPayload = {
    encryptedText: string;
    encryptionNonce: string;
    encryptionSenderPublicKey: string;
    encryptionVersion: string;
};

function privateKeyStorageKey(userId: string): string {
    return `${STORAGE_KEY_PREFIX}.${userId}.privateKey`;
}

function publicKeyStorageKey(userId: string): string {
    return `${STORAGE_KEY_PREFIX}.${userId}.publicKey`;
}

function versionStorageKey(userId: string): string {
    return `${STORAGE_KEY_PREFIX}.${userId}.version`;
}

function concatBytes(...chunks: Uint8Array[]): Uint8Array {
    let totalLength = 0;
    for (const chunk of chunks) {
        totalLength += chunk.length;
    }
    const output = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
        output.set(chunk, offset);
        offset += chunk.length;
    }
    return output;
}

function compareBytes(a: Uint8Array, b: Uint8Array): number {
    const len = Math.min(a.length, b.length);
    for (let i = 0; i < len; i++) {
        if (a[i] !== b[i]) {
            return a[i] - b[i];
        }
    }
    return a.length - b.length;
}

async function loadKeyPairFromStorage(
    userId: string,
): Promise<DmEncryptionKeyPair | null> {
    const cached = volatileKeyPairs.get(userId);
    if (cached) {
        return cached;
    }

    try {
        const [privateKeyBase64, publicKeyBase64, version] = await Promise.all([
            SecureStore.getItemAsync(privateKeyStorageKey(userId)),
            SecureStore.getItemAsync(publicKeyStorageKey(userId)),
            SecureStore.getItemAsync(versionStorageKey(userId)),
        ]);

        if (privateKeyBase64 && publicKeyBase64) {
            const keyPair: DmEncryptionKeyPair = {
                privateKeyBase64,
                publicKeyBase64,
                version: version ?? KEY_VERSION,
            };
            volatileKeyPairs.set(userId, keyPair);
            return keyPair;
        }

        return null;
    } catch {
        return null;
    }
}

async function saveKeyPairToStorage(
    userId: string,
    keyPair: DmEncryptionKeyPair,
): Promise<void> {
    volatileKeyPairs.set(userId, keyPair);

    try {
        await Promise.all([
            SecureStore.setItemAsync(
                privateKeyStorageKey(userId),
                keyPair.privateKeyBase64,
            ),
            SecureStore.setItemAsync(
                publicKeyStorageKey(userId),
                keyPair.publicKeyBase64,
            ),
            SecureStore.setItemAsync(
                versionStorageKey(userId),
                keyPair.version,
            ),
        ]);
    } catch {
        // volatile in-memory copy still available for this session
    }
}

async function ensureDmEncryptionKeyPair(
    userId: string,
): Promise<DmEncryptionKeyPair> {
    const existing = await loadKeyPairFromStorage(userId);
    if (existing) {
        return existing;
    }

    // Two concurrent callers that both miss the cache would each generate a
    // *different* keypair and race to write it, so the keypair left in storage
    // and the one published to the server need not agree. Anything encrypted
    // under the loser is then undecryptable forever. Shares one in-flight
    // generation instead, mirroring the web client.
    const pending = pendingKeyPairs.get(userId);
    if (pending) return pending;

    const generation = (async () => {
        // Re-read inside the shared generation: the first caller may have
        // finished writing while we were queued behind it.
        const fresh = await loadKeyPairFromStorage(userId);
        if (fresh) return fresh;

        const generated = sodium.crypto_box_keypair();
        const keyPair: DmEncryptionKeyPair = {
            privateKeyBase64: sodium.to_base64(
                generated.privateKey,
                base64_variants.ORIGINAL,
            ),
            publicKeyBase64: sodium.to_base64(
                generated.publicKey,
                base64_variants.ORIGINAL,
            ),
            version: KEY_VERSION,
        };

        await saveKeyPairToStorage(userId, keyPair);
        return keyPair;
    })();

    pendingKeyPairs.set(userId, generation);
    try {
        return await generation;
    } finally {
        pendingKeyPairs.delete(userId);
    }
}

/**
 * `react-native-libsodium@1.7.0` (the latest release) does not expose
 * `crypto_scalarmult` on native: `src/lib.native.ts` has no such export and no
 * `jsi_crypto_scalarmult` binding, so the value is `undefined` in a device
 * build while `tsc` stays green because the package's types come from the wasm
 * build. Without this check, every encrypted DM silently degrades — sending
 * throws a bare TypeError and every incoming message reads as
 * "[Encrypted message unavailable]". See `isDmEncryptionSupported`.
 */
function assertSharedSecretAvailable(): void {
    if (typeof sodium.crypto_scalarmult !== "function") {
        throw new Error(
            "End-to-end encryption is unavailable in this build of the app. " +
                "Update to a build with native X25519 support, or turn off " +
                "encrypted messages in this conversation to keep messaging.",
        );
    }
}

function deriveSharedKey(
    privateKey: Uint8Array,
    senderPublicKey: Uint8Array,
    recipientPublicKey: Uint8Array,
): Uint8Array {
    assertSharedSecretAvailable();
    const sharedSecret = sodium.crypto_scalarmult(
        privateKey,
        recipientPublicKey,
    );

    const comparison = compareBytes(senderPublicKey, recipientPublicKey);
    const left = comparison <= 0 ? senderPublicKey : recipientPublicKey;
    const right = comparison <= 0 ? recipientPublicKey : senderPublicKey;

    const contextBytes = new TextEncoder().encode(KEY_CONTEXT);
    const keyMaterial = concatBytes(sharedSecret, left, right, contextBytes);

    return sodium.crypto_generichash(32, keyMaterial, null);
}

export async function encryptDmText(params: {
    recipientPublicKeyBase64: string;
    senderKeyPair: DmEncryptionKeyPair;
    text: string;
    /**
     * The conversation id, bound in as AEAD additional data.
     *
     * The web client has always done this. Leaving it empty made every message
     * mobile encrypted unreadable on web... which web masked by retrying with
     * null additional data, and mobile had no such retry, so the damage was
     * invisible until the other direction was tried.
     */
    context: string;
}): Promise<DmEncryptedPayload> {
    const senderPublicKey = sodium.from_base64(
        params.senderKeyPair.publicKeyBase64,
        base64_variants.ORIGINAL,
    );
    const senderPrivateKey = sodium.from_base64(
        params.senderKeyPair.privateKeyBase64,
        base64_variants.ORIGINAL,
    );
    const recipientPublicKey = sodium.from_base64(
        params.recipientPublicKeyBase64,
        base64_variants.ORIGINAL,
    );

    const encryptionKey = deriveSharedKey(
        senderPrivateKey,
        senderPublicKey,
        recipientPublicKey,
    );

    const nonce = sodium.randombytes_buf(
        sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES,
    );

    const cipher = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
        params.text,
        params.context,
        null,
        nonce,
        encryptionKey,
    );

    return {
        encryptedText: sodium.to_base64(cipher, base64_variants.ORIGINAL),
        encryptionNonce: sodium.to_base64(nonce, base64_variants.ORIGINAL),
        encryptionSenderPublicKey: params.senderKeyPair.publicKeyBase64,
        encryptionVersion: KEY_VERSION,
    };
}

async function decryptDmText(params: {
    encryptedText: string;
    encryptionNonce: string;
    encryptionSenderPublicKey: string;
    recipientKeyPair: DmEncryptionKeyPair;
    context?: string | null;
    legacy?: boolean;
}): Promise<string | null> {
    try {
        const senderPublicKey = sodium.from_base64(
            params.encryptionSenderPublicKey,
            base64_variants.ORIGINAL,
        );
        const recipientPublicKey = sodium.from_base64(
            params.recipientKeyPair.publicKeyBase64,
            base64_variants.ORIGINAL,
        );
        const recipientPrivateKey = sodium.from_base64(
            params.recipientKeyPair.privateKeyBase64,
            base64_variants.ORIGINAL,
        );

        const key = deriveSharedKey(
            recipientPrivateKey,
            recipientPublicKey,
            senderPublicKey,
        );

        const nonce = sodium.from_base64(
            params.encryptionNonce,
            base64_variants.ORIGINAL,
        );
        const cipher = sodium.from_base64(
            params.encryptedText,
            base64_variants.ORIGINAL,
        );

        // Empty additional data is what pre-binding messages used, and libsodium
        // treats "" and NULL the same way, so "" is the legacy value.
        const additionalData =
            params.legacy || !params.context ? "" : params.context;

        const plain = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
            null,
            cipher,
            additionalData,
            nonce,
            key,
        );

        return sodium.to_string(plain);
    } catch {
        return null;
    }
}

async function decryptDmTextForSender(params: {
    encryptedText: string;
    encryptionNonce: string;
    recipientPublicKeyBase64: string;
    senderKeyPair: DmEncryptionKeyPair;
    context?: string | null;
    legacy?: boolean;
}): Promise<string | null> {
    try {
        const senderPublicKey = sodium.from_base64(
            params.senderKeyPair.publicKeyBase64,
            base64_variants.ORIGINAL,
        );
        const senderPrivateKey = sodium.from_base64(
            params.senderKeyPair.privateKeyBase64,
            base64_variants.ORIGINAL,
        );
        const recipientPublicKey = sodium.from_base64(
            params.recipientPublicKeyBase64,
            base64_variants.ORIGINAL,
        );

        const key = deriveSharedKey(
            senderPrivateKey,
            senderPublicKey,
            recipientPublicKey,
        );

        const nonce = sodium.from_base64(
            params.encryptionNonce,
            base64_variants.ORIGINAL,
        );
        const cipher = sodium.from_base64(
            params.encryptedText,
            base64_variants.ORIGINAL,
        );

        const additionalData =
            params.legacy || !params.context ? "" : params.context;

        const plain = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
            null,
            cipher,
            additionalData,
            nonce,
            key,
        );

        return sodium.to_string(plain);
    } catch {
        return null;
    }
}

export async function decryptMessageTextIfNeeded(params: {
    message: DirectMessage;
    peerPublicKeyBase64?: string | null;
    userId: string;
    /**
     * The conversation id to bind when decrypting. Preferred over the message's
     * own field because the caller always knows it, whereas the payload's copy
     * is not guaranteed on every response shape.
     */
    conversationId?: string | null;
}): Promise<DirectMessage> {
    const { message, peerPublicKeyBase64, userId } = params;
    if (
        !message.isEncrypted ||
        !message.encryptedText ||
        !message.encryptionNonce ||
        !message.encryptionSenderPublicKey
    ) {
        return message;
    }

    if (
        message.encryptionVersion &&
        message.encryptionVersion !== KEY_VERSION
    ) {
        return {
            ...message,
            text: ENCRYPTED_MESSAGE_PLACEHOLDER,
        };
    }

    const keyPair = await loadKeyPairFromStorage(userId);
    if (!keyPair) {
        return {
            ...message,
            text: ENCRYPTED_MESSAGE_PLACEHOLDER,
        };
    }

    const isOwnSentMessage = message.senderId === userId;

    if (isOwnSentMessage && !peerPublicKeyBase64) {
        return {
            ...message,
            text: ENCRYPTED_MESSAGE_PLACEHOLDER,
        };
    }

    const peerKey = peerPublicKeyBase64!;

    // Messages encrypted before conversation binding used empty additional
    // data. Try the bound form first, then retry unbound — the same two-step
    // the web client does. Without the retry every message written on web was
    // unreadable on mobile, and nothing indicated why.
    const context = params.conversationId ?? message.conversationId ?? null;

    // Captured as locals so the guards above still apply: TypeScript does not
    // carry property narrowing into a callback.
    const { encryptedText, encryptionNonce, encryptionSenderPublicKey } =
        message;

    const attempt = async (legacy: boolean) =>
        isOwnSentMessage
            ? await decryptDmTextForSender({
                  encryptedText,
                  encryptionNonce,
                  recipientPublicKeyBase64: peerKey,
                  senderKeyPair: keyPair,
                  context,
                  legacy,
              })
            : await decryptDmText({
                  encryptedText,
                  encryptionNonce,
                  encryptionSenderPublicKey,
                  recipientKeyPair: keyPair,
                  context,
                  legacy,
              });

    let decryptedText = await attempt(false);
    if (decryptedText === null) {
        decryptedText = await attempt(true);
    }

    if (decryptedText === null) {
        return {
            ...message,
            text: ENCRYPTED_MESSAGE_PLACEHOLDER,
        };
    }

    return {
        ...message,
        text: decryptedText,
    };
}

/**
 * Whether this build can actually do E2EE DMs. False on any native build of
 * 1.7.0 — see `assertSharedSecretAvailable`. Callers should check this before
 * offering to send an encrypted message rather than letting the send fail.
 */
export function isDmEncryptionSupported(): boolean {
    return typeof sodium.crypto_scalarmult === "function";
}

export async function ensurePublishedDmEncryptionKey(
    instanceUrl: string,
    accessToken: string,
    userId: string,
): Promise<DmEncryptionKeyPair> {
    const keyPair = await ensureDmEncryptionKeyPair(userId);

    const response = await fetch(`${instanceUrl}/api/me/dm-encryption-key`, {
        method: "PATCH",
        headers: {
            "Content-Type": "application/json",
            ...authHeaders(accessToken),
        },
        body: JSON.stringify({
            dmEncryptionPublicKey: keyPair.publicKeyBase64,
        }),
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Failed to publish encryption key");
    }

    return keyPair;
}

export function clearDmEncryptionKeyPairs(): void {
    volatileKeyPairs.clear();
    pendingKeyPairs.clear();
}
