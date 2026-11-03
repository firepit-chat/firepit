"use client";

import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import { x25519 } from "@noble/curves/ed25519.js";
import { argon2id } from "@noble/hashes/argon2.js";
import { blake2b } from "@noble/hashes/blake2.js";

import { logger } from "@/lib/client-logger";
import type { DirectMessage } from "@/lib/types";

const LOCAL_STORAGE_PREFIX = "firepit.dm.encryption";
const KEY_VERSION = "xchacha20poly1305-v1";
const KEY_CONTEXT = "firepit-dm-v1";
const NONCE_BYTES = 24;
type KeyOrder = "le" | "be";

const KEY_BACKUP_TYPE = "firepit-dm-key-backup";
const KEY_BACKUP_VERSION = 1;
const KEY_BACKUP_AAD = "firepit-dm-key-backup-v1";
const KEY_BACKUP_SALT_BYTES = 16;
// Argon2id cost is capped on import so a crafted backup cannot exhaust memory.
const KEY_BACKUP_KDF = { t: 2, m: 19456, p: 1, dkLen: 32 } as const;
const MAX_KDF_T = 10;
const MAX_KDF_M = 262144;
const MAX_KDF_P = 4;

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
const WRAPPING_KEY_DB_NAME = "firepit-dm-encryption";
const WRAPPING_KEY_STORE = "wrapping-keys";
export const ENCRYPTED_MESSAGE_PLACEHOLDER = "[Encrypted message unavailable]";

type StoredEncryptedKeyPair = {
    alg: "AES-GCM";
    encryptedPrivateKeyBase64: string;
    ivBase64: string;
    publicKeyBase64: string;
    version: string;
};

type StoredKeyMetadata = {
    publicKeyBase64: string;
    securePersistenceUnavailable: true;
    version: string;
};

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

let wrappingKeyDbPromise: Promise<IDBDatabase | null> | null = null;
const pendingKeyPromises = new Map<string, Promise<DmEncryptionKeyPair>>();
const pendingWrappingKeys = new Map<string, Promise<CryptoKey | null>>();
const volatileKeyPairs = new Map<string, DmEncryptionKeyPair>();

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object";
}

function isCryptoKeyLike(value: unknown): value is CryptoKey {
    if (!isRecord(value)) {
        return false;
    }

    const candidate = value as {
        algorithm?: unknown;
        type?: unknown;
        usages?: unknown;
    };

    return (
        isRecord(candidate.algorithm) &&
        typeof candidate.type === "string" &&
        Array.isArray(candidate.usages)
    );
}

function getStorageKey(userId: string): string {
    return `${LOCAL_STORAGE_PREFIX}.${userId}`;
}

function normalizeBase64(value: string): string {
    return value.replaceAll("-", "+").replaceAll("_", "/");
}

function concatBytes(...chunks: Uint8Array[]): Uint8Array {
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const output = new Uint8Array(totalLength);
    let offset = 0;

    for (const chunk of chunks) {
        output.set(chunk, offset);
        offset += chunk.length;
    }

    return output;
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
    let binary = "";
    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
    }

    return btoa(binary);
}

function base64ToUint8Array(base64: string): Uint8Array {
    const normalized = normalizeBase64(base64);
    const binary = atob(normalized);
    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
    }

    return bytes;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
    return bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer;
}

function isStoredEncryptedKeyPair(
    value: unknown,
): value is StoredEncryptedKeyPair {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return false;
    }

    const candidate = value as Partial<StoredEncryptedKeyPair>;
    return (
        candidate.alg === "AES-GCM" &&
        typeof candidate.encryptedPrivateKeyBase64 === "string" &&
        typeof candidate.ivBase64 === "string" &&
        typeof candidate.publicKeyBase64 === "string" &&
        typeof candidate.version === "string"
    );
}

function isStoredKeyMetadata(value: unknown): value is StoredKeyMetadata {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return false;
    }

    const candidate = value as Partial<StoredKeyMetadata>;
    return (
        candidate.securePersistenceUnavailable === true &&
        typeof candidate.publicKeyBase64 === "string" &&
        typeof candidate.version === "string"
    );
}

function openWrappingKeyDb(): Promise<IDBDatabase | null> {
    if (
        typeof window === "undefined" ||
        typeof window.indexedDB === "undefined"
    ) {
        return Promise.resolve(null);
    }

    if (!wrappingKeyDbPromise) {
        const openPromise = new Promise<IDBDatabase | null>((resolve) => {
            const request = window.indexedDB.open(WRAPPING_KEY_DB_NAME, 1);

            request.addEventListener("upgradeneeded", () => {
                const database = request.result;
                if (!database.objectStoreNames.contains(WRAPPING_KEY_STORE)) {
                    database.createObjectStore(WRAPPING_KEY_STORE);
                }
            });

            request.addEventListener("success", () => {
                resolve(request.result);
            });

            request.addEventListener("error", () => {
                resolve(null);
            });

            request.addEventListener("blocked", () => {
                resolve(null);
            });
        });

        wrappingKeyDbPromise = openPromise.then((database) => {
            if (!database) {
                wrappingKeyDbPromise = null;
            }
            return database;
        });
    }

    return wrappingKeyDbPromise;
}

function readWrappingKey(
    database: IDBDatabase,
    storageKey: string,
): Promise<CryptoKey | null> {
    return new Promise((resolve) => {
        const transaction = database.transaction(
            WRAPPING_KEY_STORE,
            "readonly",
        );
        const store = transaction.objectStore(WRAPPING_KEY_STORE);
        const request = store.get(storageKey);

        request.addEventListener("success", () => {
            const result = request.result;
            if (isCryptoKeyLike(result)) {
                resolve(result);
                return;
            }

            resolve(null);
        });

        request.addEventListener("error", () => {
            resolve(null);
        });
    });
}

function writeWrappingKey(
    database: IDBDatabase,
    storageKey: string,
    wrappingKey: CryptoKey,
): Promise<boolean> {
    return new Promise((resolve) => {
        const transaction = database.transaction(
            WRAPPING_KEY_STORE,
            "readwrite",
        );
        const store = transaction.objectStore(WRAPPING_KEY_STORE);
        const request = store.put(wrappingKey, storageKey);

        request.addEventListener("success", () => {
            resolve(true);
        });

        request.addEventListener("error", () => {
            resolve(false);
        });
    });
}

async function getStoredWrappingKey(userId: string): Promise<CryptoKey | null> {
    const database = await openWrappingKeyDb();
    if (!database) {
        return null;
    }

    return readWrappingKey(database, getStorageKey(userId));
}

async function getOrCreateWrappingKey(
    userId: string,
): Promise<CryptoKey | null> {
    if (typeof window === "undefined" || !window.crypto?.subtle) {
        return null;
    }

    const inFlight = pendingWrappingKeys.get(userId);
    if (inFlight) {
        return inFlight;
    }

    const creation = createWrappingKey(userId);
    pendingWrappingKeys.set(userId, creation);

    try {
        return await creation;
    } finally {
        pendingWrappingKeys.delete(userId);
    }
}

async function createWrappingKey(userId: string): Promise<CryptoKey | null> {
    const existing = await getStoredWrappingKey(userId);
    if (existing) {
        return existing;
    }

    const database = await openWrappingKeyDb();
    if (!database) {
        return null;
    }

    try {
        const generated = await window.crypto.subtle.generateKey(
            {
                name: "AES-GCM",
                length: 256,
            },
            false,
            ["encrypt", "decrypt"],
        );

        const stored = await writeWrappingKey(
            database,
            getStorageKey(userId),
            generated,
        );
        if (!stored) {
            logger.warn("Failed to persist DM key wrapping key", { userId });
            return null;
        }

        return generated;
    } catch (error) {
        logger.error(
            "Failed to generate DM key wrapping key",
            error instanceof Error ? error : new Error(String(error)),
            { userId },
        );
        return null;
    }
}

async function loadKeyPairFromStorage(
    userId: string,
): Promise<DmEncryptionKeyPair | null> {
    const volatile = volatileKeyPairs.get(userId);
    if (volatile) {
        return volatile;
    }

    if (typeof window === "undefined") {
        return null;
    }

    try {
        const raw = window.localStorage.getItem(getStorageKey(userId));
        if (!raw) {
            return null;
        }

        const parsed = JSON.parse(raw) as unknown;

        // Backward compatibility for existing plaintext localStorage records.
        if (
            parsed &&
            typeof parsed === "object" &&
            !Array.isArray(parsed) &&
            typeof (parsed as Partial<DmEncryptionKeyPair>).publicKeyBase64 ===
                "string" &&
            typeof (parsed as Partial<DmEncryptionKeyPair>).privateKeyBase64 ===
                "string"
        ) {
            const legacy = {
                privateKeyBase64: (parsed as DmEncryptionKeyPair)
                    .privateKeyBase64,
                publicKeyBase64: (parsed as DmEncryptionKeyPair)
                    .publicKeyBase64,
                version:
                    typeof (parsed as Partial<DmEncryptionKeyPair>).version ===
                    "string"
                        ? (parsed as DmEncryptionKeyPair).version
                        : KEY_VERSION,
            };

            await saveKeyPairToStorage(userId, legacy);
            return legacy;
        }

        if (isStoredKeyMetadata(parsed)) {
            logger.warn(
                "Secure DM key persistence unavailable; private key is session-only",
                {
                    userId,
                },
            );
            return null;
        }

        if (!isStoredEncryptedKeyPair(parsed)) {
            return null;
        }

        const wrappingKey = await getStoredWrappingKey(userId);
        if (!wrappingKey || !window.crypto?.subtle) {
            logger.warn(
                "Encrypted DM key pair found but wrapping key is unavailable",
                { userId },
            );
            return null;
        }

        const iv = base64ToUint8Array(parsed.ivBase64);
        const encryptedPrivateKey = base64ToUint8Array(
            parsed.encryptedPrivateKeyBase64,
        );

        const decryptedBuffer = await window.crypto.subtle.decrypt(
            {
                name: "AES-GCM",
                iv: toArrayBuffer(iv),
            },
            wrappingKey,
            toArrayBuffer(encryptedPrivateKey),
        );

        const decryptedPrivateKey = new TextDecoder().decode(decryptedBuffer);

        if (!decryptedPrivateKey) {
            return null;
        }

        return {
            privateKeyBase64: decryptedPrivateKey,
            publicKeyBase64: parsed.publicKeyBase64,
            version: parsed.version,
        };
    } catch (error) {
        logger.error(
            "Failed to load DM key pair from storage",
            error instanceof Error ? error : new Error(String(error)),
            { userId },
        );
        return null;
    }
}

async function saveKeyPairToStorage(
    userId: string,
    keyPair: DmEncryptionKeyPair,
): Promise<void> {
    volatileKeyPairs.set(userId, keyPair);

    if (typeof window === "undefined" || !window.crypto?.subtle) {
        return;
    }

    const persistNonSensitiveMetadata = () => {
        try {
            const metadata: StoredKeyMetadata = {
                publicKeyBase64: keyPair.publicKeyBase64,
                securePersistenceUnavailable: true,
                version: keyPair.version,
            };
            window.localStorage.setItem(
                getStorageKey(userId),
                JSON.stringify(metadata),
            );
            logger.warn(
                "Secure DM key persistence unavailable; storing public metadata only",
                {
                    userId,
                },
            );
        } catch (legacyError) {
            logger.error(
                "Failed to persist DM key metadata fallback",
                legacyError instanceof Error
                    ? legacyError
                    : new Error(String(legacyError)),
                { userId },
            );
        }
    };

    try {
        const wrappingKey = await getOrCreateWrappingKey(userId);
        if (!wrappingKey) {
            persistNonSensitiveMetadata();
            return;
        }

        const iv = window.crypto.getRandomValues(new Uint8Array(12));
        const encodedPrivateKey = new TextEncoder().encode(
            keyPair.privateKeyBase64,
        );

        const encryptedBuffer = await window.crypto.subtle.encrypt(
            {
                name: "AES-GCM",
                iv: toArrayBuffer(iv),
            },
            wrappingKey,
            toArrayBuffer(encodedPrivateKey),
        );

        const payload: StoredEncryptedKeyPair = {
            alg: "AES-GCM",
            encryptedPrivateKeyBase64: uint8ArrayToBase64(
                new Uint8Array(encryptedBuffer),
            ),
            ivBase64: uint8ArrayToBase64(iv),
            publicKeyBase64: keyPair.publicKeyBase64,
            version: keyPair.version,
        };

        window.localStorage.setItem(
            getStorageKey(userId),
            JSON.stringify(payload),
        );
    } catch (error) {
        logger.error(
            "Failed to persist encrypted DM key pair",
            error instanceof Error ? error : new Error(String(error)),
            { userId },
        );
        persistNonSensitiveMetadata();
    }
}

async function getDmEncryptionKeyPair(
    userId: string,
): Promise<DmEncryptionKeyPair | null> {
    return loadKeyPairFromStorage(userId);
}

function hasStoredDmEncryptionKeyPair(userId: string): boolean {
    if (typeof window === "undefined") {
        return false;
    }

    try {
        const raw = window.localStorage.getItem(getStorageKey(userId));
        if (!raw) {
            return false;
        }

        const parsed = JSON.parse(raw) as unknown;
        return isStoredEncryptedKeyPair(parsed);
    } catch {
        return false;
    }
}

async function ensureDmEncryptionKeyPair(
    userId: string,
): Promise<DmEncryptionKeyPair> {
    const existing = await loadKeyPairFromStorage(userId);
    if (existing) {
        return existing;
    }

    if (hasStoredDmEncryptionKeyPair(userId)) {
        throw new Error(
            "DM encryption key recovery failed on this device. To prevent key rotation and DM history loss, encryption key regeneration is blocked.",
        );
    }

    const pending = pendingKeyPromises.get(userId);
    if (pending) {
        return pending;
    }

    const generationPromise = (async () => {
        const freshRead = await loadKeyPairFromStorage(userId);
        if (freshRead) {
            return freshRead;
        }

        const generated = x25519.keygen();

        const keyPair: DmEncryptionKeyPair = {
            privateKeyBase64: uint8ArrayToBase64(generated.secretKey),
            publicKeyBase64: uint8ArrayToBase64(generated.publicKey),
            version: KEY_VERSION,
        };

        await saveKeyPairToStorage(userId, keyPair);
        return keyPair;
    })();

    pendingKeyPromises.set(userId, generationPromise);

    try {
        return await generationPromise;
    } finally {
        pendingKeyPromises.delete(userId);
    }
}

async function parseResponseBody(
    response: Response,
): Promise<{ json?: Record<string, unknown>; text: string }> {
    const text = await response.text();

    if (!text) {
        return { text: "" };
    }

    try {
        const parsed = JSON.parse(text) as unknown;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            return {
                json: parsed as Record<string, unknown>,
                text,
            };
        }
    } catch {
        // Non-JSON response bodies are allowed.
    }

    return { text };
}

async function publishDmEncryptionPublicKey(
    publicKeyBase64: string,
): Promise<void> {
    const response = await fetch("/api/me/dm-encryption-key", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            dmEncryptionPublicKey: publicKeyBase64,
        }),
    });

    if (!response.ok) {
        const body = await parseResponseBody(response);
        const responseError = body.json?.error;
        const errorMessage =
            typeof responseError === "string"
                ? responseError
                : body.text || "Failed to publish encryption key";
        throw new Error(errorMessage);
    }
}

export async function ensurePublishedDmEncryptionKey(
    userId: string,
): Promise<DmEncryptionKeyPair> {
    const keyPair = await ensureDmEncryptionKeyPair(userId);
    await publishDmEncryptionPublicKey(keyPair.publicKeyBase64);
    return keyPair;
}

async function fetchDmEncryptionKeyMetadata(): Promise<{
    dmEncryptionPublicKey?: string;
    userId: string;
}> {
    const response = await fetch("/api/me/dm-encryption-key");
    const body = await parseResponseBody(response);

    if (!response.ok) {
        const responseError = body.json?.error;
        const errorMessage =
            typeof responseError === "string"
                ? responseError
                : body.text ||
                  "Failed to resolve current user encryption key metadata";
        throw new Error(errorMessage);
    }

    const userId = body.json?.userId;
    const dmEncryptionPublicKey = body.json?.dmEncryptionPublicKey;

    if (typeof userId !== "string" || userId.length === 0) {
        throw new Error("Missing userId in encryption key metadata response");
    }

    return {
        dmEncryptionPublicKey:
            typeof dmEncryptionPublicKey === "string"
                ? dmEncryptionPublicKey
                : undefined,
        userId,
    };
}

export async function ensurePublishedDmEncryptionKeyForCurrentUser(): Promise<void> {
    const metadata = await fetchDmEncryptionKeyMetadata();
    const keyPair = await ensureDmEncryptionKeyPair(metadata.userId);
    if (metadata.dmEncryptionPublicKey === keyPair.publicKeyBase64) {
        return;
    }

    await publishDmEncryptionPublicKey(keyPair.publicKeyBase64);
}

function encodeKeyBackup(
    passphrase: string,
    keyPair: DmEncryptionKeyPair,
): string {
    const salt = randomBytes(KEY_BACKUP_SALT_BYTES);
    const nonce = randomBytes(NONCE_BYTES);
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
        cipherBase64: uint8ArrayToBase64(cipher),
        encryptionVersion: keyPair.version,
        kdf: "argon2id",
        m: KEY_BACKUP_KDF.m,
        nonceBase64: uint8ArrayToBase64(nonce),
        p: KEY_BACKUP_KDF.p,
        publicKeyBase64: keyPair.publicKeyBase64,
        saltBase64: uint8ArrayToBase64(salt),
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
        base64ToUint8Array(parsed.saltBase64),
        { t: parsed.t, m: parsed.m, p: parsed.p, dkLen: 32 },
    );

    let keyPair: DmEncryptionKeyPair;
    try {
        const plain = xchacha20poly1305(
            key,
            base64ToUint8Array(parsed.nonceBase64),
            new TextEncoder().encode(KEY_BACKUP_AAD),
        ).decrypt(base64ToUint8Array(parsed.cipherBase64));
        keyPair = JSON.parse(new TextDecoder().decode(plain)) as DmEncryptionKeyPair;
    } catch {
        throw new Error("Wrong passphrase or corrupted key backup");
    }

    if (
        typeof keyPair?.privateKeyBase64 !== "string" ||
        typeof keyPair?.publicKeyBase64 !== "string"
    ) {
        throw new Error("Key backup is missing its key pair");
    }

    const derivedPublic = uint8ArrayToBase64(
        x25519.getPublicKey(base64ToUint8Array(keyPair.privateKeyBase64)),
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

export async function exportDmEncryptionKeyForCurrentUser(
    passphrase: string,
): Promise<string> {
    const metadata = await fetchDmEncryptionKeyMetadata();
    const keyPair = await ensureDmEncryptionKeyPair(metadata.userId);
    return encodeKeyBackup(passphrase, keyPair);
}

export async function importDmEncryptionKeyForCurrentUser(
    passphrase: string,
    encoded: string,
): Promise<void> {
    const keyPair = decodeKeyBackup(passphrase, encoded);
    const metadata = await fetchDmEncryptionKeyMetadata();
    await saveKeyPairToStorage(metadata.userId, keyPair);
    await publishDmEncryptionPublicKey(keyPair.publicKeyBase64);
}

// libsodium's `compare` treats byte arrays as little-endian integers. Mobile
// historically sorted with a plain memcmp instead, so decryption must also try
// the big-endian order to read messages written by those builds.
function compareBytes(
    a: Uint8Array,
    b: Uint8Array,
    order: KeyOrder,
): number {
    const length = Math.min(a.length, b.length);
    if (order === "le") {
        for (let index = length - 1; index >= 0; index -= 1) {
            if (a[index] !== b[index]) {
                return a[index] < b[index] ? -1 : 1;
            }
        }
    } else {
        for (let index = 0; index < length; index += 1) {
            if (a[index] !== b[index]) {
                return a[index] < b[index] ? -1 : 1;
            }
        }
    }
    return a.length - b.length;
}

function randomBytes(length: number): Uint8Array {
    if (typeof crypto === "undefined" || !crypto.getRandomValues) {
        throw new Error("Secure random number generation is unavailable");
    }
    return crypto.getRandomValues(new Uint8Array(length));
}

function deriveSharedKey(
    senderPrivateKey: Uint8Array,
    senderPublicKey: Uint8Array,
    recipientPublicKey: Uint8Array,
    order: KeyOrder = "le",
): Uint8Array {
    const sharedSecret = x25519.getSharedSecret(
        senderPrivateKey,
        recipientPublicKey,
    );

    const comparison = compareBytes(senderPublicKey, recipientPublicKey, order);
    const left = comparison <= 0 ? senderPublicKey : recipientPublicKey;
    const right = comparison <= 0 ? recipientPublicKey : senderPublicKey;

    const contextBytes = new TextEncoder().encode(KEY_CONTEXT);
    const keyMaterial = concatBytes(sharedSecret, left, right, contextBytes);

    return blake2b(keyMaterial, { dkLen: 32 });
}

export async function encryptDmText(params: {
    context: string;
    recipientPublicKeyBase64: string;
    senderKeyPair: DmEncryptionKeyPair;
    text: string;
}): Promise<DmEncryptedPayload> {
    const senderPublicKey = base64ToUint8Array(
        params.senderKeyPair.publicKeyBase64,
    );
    const senderPrivateKey = base64ToUint8Array(
        params.senderKeyPair.privateKeyBase64,
    );
    const recipientPublicKey = base64ToUint8Array(
        params.recipientPublicKeyBase64,
    );

    const encryptionKey = deriveSharedKey(
        senderPrivateKey,
        senderPublicKey,
        recipientPublicKey,
    );
    const nonce = randomBytes(NONCE_BYTES);
    const cipher = xchacha20poly1305(
        encryptionKey,
        nonce,
        new TextEncoder().encode(params.context),
    ).encrypt(new TextEncoder().encode(params.text));

    return {
        encryptedText: uint8ArrayToBase64(cipher),
        encryptionNonce: uint8ArrayToBase64(nonce),
        encryptionSenderPublicKey: params.senderKeyPair.publicKeyBase64,
        encryptionVersion: KEY_VERSION,
    };
}

async function decryptDmPayload(params: {
    context?: string;
    encryptedText: string;
    encryptionNonce: string;
    legacy?: boolean;
    localKeyPair: DmEncryptionKeyPair;
    order?: KeyOrder;
    peerPublicKeyBase64: string;
}): Promise<string | null> {
    try {
        const localPublicKey = base64ToUint8Array(
            params.localKeyPair.publicKeyBase64,
        );
        const localPrivateKey = base64ToUint8Array(
            params.localKeyPair.privateKeyBase64,
        );
        const peerPublicKey = base64ToUint8Array(params.peerPublicKeyBase64);

        const key = deriveSharedKey(
            localPrivateKey,
            localPublicKey,
            peerPublicKey,
            params.order,
        );
        const nonce = base64ToUint8Array(params.encryptionNonce);
        const cipher = base64ToUint8Array(params.encryptedText);

        // Messages written before conversation binding used no additional data.
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
    } catch (error) {
        logger.debug("decryptDmPayload failed", {
            error:
                error instanceof Error
                    ? `${error.message}${error.stack ? ` | ${error.stack}` : ""}`
                    : String(error),
        });
        return null;
    }
}

export async function decryptMessageTextIfNeeded(params: {
    message: DirectMessage;
    peerPublicKeyBase64?: string | null;
    userId: string;
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

    const keyPair = await getDmEncryptionKeyPair(userId);
    if (!keyPair) {
        logger.warn("Missing local DM encryption key for decryption", {
            messageId: message.$id,
            userId,
        });
        return {
            ...message,
            text: ENCRYPTED_MESSAGE_PLACEHOLDER,
        };
    }

    const isOwnSentMessage = message.senderId === userId;

    if (isOwnSentMessage && !peerPublicKeyBase64) {
        logger.warn("Missing peer public key for self-sent encrypted DM", {
            messageId: message.$id,
            userId,
        });
        return {
            ...message,
            text: ENCRYPTED_MESSAGE_PLACEHOLDER,
        };
    }

    const peerPublicKey =
        isOwnSentMessage && peerPublicKeyBase64
            ? peerPublicKeyBase64
            : message.encryptionSenderPublicKey;

    // Messages encrypted before conversation binding used null additional data.
    // Older mobile builds also sorted the public keys big-endian, so try both
    // orderings; the current encoding is little-endian.
    const context = message.conversationId;
    let decryptedText: string | null = null;

    for (const order of ["le", "be"] as const) {
        for (const legacy of [false, true]) {
            decryptedText = await decryptDmPayload({
                context,
                encryptedText: message.encryptedText,
                encryptionNonce: message.encryptionNonce,
                legacy,
                localKeyPair: keyPair,
                order,
                peerPublicKeyBase64: peerPublicKey,
            });

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
