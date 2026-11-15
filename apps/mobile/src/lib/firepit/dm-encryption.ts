import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import { x25519 } from "@noble/curves/ed25519.js";
import { argon2id } from "@noble/hashes/argon2.js";
import { blake2b } from "@noble/hashes/blake2.js";
import { base64 } from "@scure/base";
import * as SecureStore from "expo-secure-store";
import { authHeaders } from "@/lib/firepit/http";
import type { DirectMessage } from "@/lib/firepit/types";
import { randomBytes } from "@/lib/firepit/random-bytes";

const KEY_VERSION = "xchacha20poly1305-v1";
const KEY_CONTEXT = "firepit-dm-v1";
const NONCE_BYTES = 24;
const STORAGE_KEY_PREFIX = "firepit.dm.encryption";

const KEY_BACKUP_TYPE = "firepit-dm-key-backup";
const KEY_BACKUP_VERSION = 1;
const KEY_BACKUP_AAD = "firepit-dm-key-backup-v1";
const KEY_BACKUP_SALT_BYTES = 16;
// ponytail: sync Argon2id blocks the JS thread during an explicit backup or
// restore; move it to a worker if that ever feels slow.
const KEY_BACKUP_KDF = { t: 2, m: 19456, p: 1, dkLen: 32 } as const;
const MAX_KDF_T = 10;
const MAX_KDF_M = 262144;
const MAX_KDF_P = 4;

type KeyOrder = "le" | "be";

type DmKeyBackup = {
    cipherBase64: string;
    encryptionVersion: string;
    kdf: "argon2id";
    m: number;
    nonceBase64: string;
    p: number;
    publicKeyBase64: string;
    saltBase64: string;
    t: number;
    type: typeof KEY_BACKUP_TYPE;
    version: typeof KEY_BACKUP_VERSION;
};

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

function compareBytes(
    a: Uint8Array,
    b: Uint8Array,
    order: KeyOrder,
): number {
    const len = Math.min(a.length, b.length);
    if (order === "le") {
        for (let i = len - 1; i >= 0; i--) {
            if (a[i] !== b[i]) {
                return a[i] < b[i] ? -1 : 1;
            }
        }
    } else {
        for (let i = 0; i < len; i++) {
            if (a[i] !== b[i]) {
                return a[i] < b[i] ? -1 : 1;
            }
        }
    }
    return a.length - b.length;
}

function bytesToBase64(bytes: Uint8Array): string {
    return base64.encode(bytes);
}

function base64ToBytes(value: string): Uint8Array {
    return base64.decode(value.replaceAll("-", "+").replaceAll("_", "/"));
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

async function encodeKeyBackup(
    passphrase: string,
    keyPair: DmEncryptionKeyPair,
): Promise<string> {
    const salt = await randomBytes(KEY_BACKUP_SALT_BYTES);
    const nonce = await randomBytes(NONCE_BYTES);
    const key = argon2id(
        new TextEncoder().encode(passphrase),
        salt,
        KEY_BACKUP_KDF,
    );
    const cipher = xchacha20poly1305(
        key,
        nonce,
        new TextEncoder().encode(KEY_BACKUP_AAD),
    ).encrypt(new TextEncoder().encode(JSON.stringify(keyPair)));

    const backup: DmKeyBackup = {
        cipherBase64: bytesToBase64(cipher),
        encryptionVersion: keyPair.version,
        kdf: "argon2id",
        m: KEY_BACKUP_KDF.m,
        nonceBase64: bytesToBase64(nonce),
        p: KEY_BACKUP_KDF.p,
        publicKeyBase64: keyPair.publicKeyBase64,
        saltBase64: bytesToBase64(salt),
        t: KEY_BACKUP_KDF.t,
        type: KEY_BACKUP_TYPE,
        version: KEY_BACKUP_VERSION,
    };

    return JSON.stringify(backup, null, 2);
}

function decodeKeyBackup(
    passphrase: string,
    encoded: string,
): DmEncryptionKeyPair {
    const parsed = JSON.parse(encoded) as Partial<DmKeyBackup>;

    if (
        parsed.type !== KEY_BACKUP_TYPE ||
        parsed.version !== KEY_BACKUP_VERSION ||
        parsed.kdf !== "argon2id" ||
        typeof parsed.saltBase64 !== "string" ||
        typeof parsed.nonceBase64 !== "string" ||
        typeof parsed.cipherBase64 !== "string" ||
        typeof parsed.publicKeyBase64 !== "string" ||
        typeof parsed.t !== "number" ||
        typeof parsed.m !== "number" ||
        typeof parsed.p !== "number" ||
        parsed.t < 1 ||
        parsed.t > MAX_KDF_T ||
        parsed.m < 8 ||
        parsed.m > MAX_KDF_M ||
        parsed.p < 1 ||
        parsed.p > MAX_KDF_P
    ) {
        throw new Error("This is not a valid Firepit DM key backup");
    }

    const key = argon2id(
        new TextEncoder().encode(passphrase),
        base64ToBytes(parsed.saltBase64),
        { t: parsed.t, m: parsed.m, p: parsed.p, dkLen: 32 },
    );

    let keyPair: DmEncryptionKeyPair;
    try {
        const plain = xchacha20poly1305(
            key,
            base64ToBytes(parsed.nonceBase64),
            new TextEncoder().encode(KEY_BACKUP_AAD),
        ).decrypt(base64ToBytes(parsed.cipherBase64));
        keyPair = JSON.parse(
            new TextDecoder().decode(plain),
        ) as DmEncryptionKeyPair;
    } catch {
        throw new Error("Wrong passphrase or corrupted key backup");
    }

    if (
        typeof keyPair?.privateKeyBase64 !== "string" ||
        typeof keyPair?.publicKeyBase64 !== "string"
    ) {
        throw new Error("Key backup is missing its key pair");
    }

    const derivedPublic = bytesToBase64(
        x25519.getPublicKey(base64ToBytes(keyPair.privateKeyBase64)),
    );
    if (
        derivedPublic !== keyPair.publicKeyBase64 ||
        derivedPublic !== parsed.publicKeyBase64
    ) {
        throw new Error("Key backup does not match its public key");
    }

    return {
        privateKeyBase64: keyPair.privateKeyBase64,
        publicKeyBase64: keyPair.publicKeyBase64,
        version:
            typeof keyPair.version === "string"
                ? keyPair.version
                : KEY_VERSION,
    };
}

export async function exportDmEncryptionKey(
    passphrase: string,
    userId: string,
): Promise<string> {
    const keyPair = await ensureDmEncryptionKeyPair(userId);
    return encodeKeyBackup(passphrase, keyPair);
}

export async function importDmEncryptionKey(
    passphrase: string,
    encoded: string,
    userId: string,
): Promise<DmEncryptionKeyPair> {
    const keyPair = decodeKeyBackup(passphrase, encoded);
    await saveKeyPairToStorage(userId, keyPair);
    return keyPair;
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

        const generated = x25519.keygen();
        const keyPair: DmEncryptionKeyPair = {
            privateKeyBase64: bytesToBase64(generated.secretKey),
            publicKeyBase64: bytesToBase64(generated.publicKey),
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

function deriveSharedKey(
    privateKey: Uint8Array,
    senderPublicKey: Uint8Array,
    recipientPublicKey: Uint8Array,
    order: KeyOrder = "le",
): Uint8Array {
    const sharedSecret = x25519.getSharedSecret(privateKey, recipientPublicKey);

    const comparison = compareBytes(senderPublicKey, recipientPublicKey, order);
    const left = comparison <= 0 ? senderPublicKey : recipientPublicKey;
    const right = comparison <= 0 ? recipientPublicKey : senderPublicKey;

    const contextBytes = new TextEncoder().encode(KEY_CONTEXT);
    const keyMaterial = concatBytes(sharedSecret, left, right, contextBytes);

    return blake2b(keyMaterial, { dkLen: 32 });
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
    const senderPublicKey = base64ToBytes(
        params.senderKeyPair.publicKeyBase64,
    );
    const senderPrivateKey = base64ToBytes(
        params.senderKeyPair.privateKeyBase64,
    );
    const recipientPublicKey = base64ToBytes(
        params.recipientPublicKeyBase64,
    );

    const encryptionKey = deriveSharedKey(
        senderPrivateKey,
        senderPublicKey,
        recipientPublicKey,
    );

    const nonce = await randomBytes(NONCE_BYTES);

    const cipher = xchacha20poly1305(
        encryptionKey,
        nonce,
        new TextEncoder().encode(params.context),
    ).encrypt(new TextEncoder().encode(params.text));

    return {
        encryptedText: bytesToBase64(cipher),
        encryptionNonce: bytesToBase64(nonce),
        encryptionSenderPublicKey: params.senderKeyPair.publicKeyBase64,
        encryptionVersion: KEY_VERSION,
    };
}

async function decryptWithKey(params: {
    encryptedText: string;
    encryptionNonce: string;
    localPrivateKeyBase64: string;
    localPublicKeyBase64: string;
    peerPublicKeyBase64: string;
    context?: string | null;
    legacy?: boolean;
    order?: KeyOrder;
}): Promise<string | null> {
    try {
        const key = deriveSharedKey(
            base64ToBytes(params.localPrivateKeyBase64),
            base64ToBytes(params.localPublicKeyBase64),
            base64ToBytes(params.peerPublicKeyBase64),
            params.order,
        );

        const nonce = base64ToBytes(params.encryptionNonce);
        const cipher = base64ToBytes(params.encryptedText);

        // Pre-binding messages used no additional data.
        const additionalData =
            params.legacy || !params.context
                ? undefined
                : new TextEncoder().encode(params.context);

        const plain = xchacha20poly1305(
            key,
            nonce,
            additionalData,
        ).decrypt(cipher);

        return new TextDecoder().decode(plain);
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

    const attempt = (legacy: boolean, order: KeyOrder) =>
        decryptWithKey({
            encryptedText,
            encryptionNonce,
            localPrivateKeyBase64: keyPair.privateKeyBase64,
            localPublicKeyBase64: keyPair.publicKeyBase64,
            peerPublicKeyBase64: isOwnSentMessage
                ? peerKey
                : encryptionSenderPublicKey,
            context,
            legacy,
            order,
        });

    // Current builds sort public keys little-endian, matching libsodium's
    // compare. Older mobile builds hand-rolled a big-endian sort, so messages
    // from those builds need the other order.
    let decryptedText: string | null = null;
    for (const order of ["le", "be"] as const) {
        for (const legacy of [false, true]) {
            decryptedText = await attempt(legacy, order);
            if (decryptedText !== null) {
                break;
            }
        }
        if (decryptedText !== null) {
            break;
        }
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
 * Whether this build can do E2EE DMs. Kept as a function so callers that gate
 * the UI on it do not need to change; the pure-JS crypto is always available.
 */
export function isDmEncryptionSupported(): boolean {
    return true;
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
