type WebCrypto = {
    getRandomValues?: (array: Uint8Array) => Uint8Array;
};

/**
 * Cryptographically secure random bytes on both React Native and Bun tests.
 * React Native has no global WebCrypto, so fall back to expo-crypto there.
 */
export async function randomBytes(length: number): Promise<Uint8Array> {
    const webCrypto = (globalThis as { crypto?: WebCrypto }).crypto;
    if (webCrypto?.getRandomValues) {
        return webCrypto.getRandomValues(new Uint8Array(length));
    }

    const { getRandomBytes } = await import("expo-crypto");
    return getRandomBytes(length);
}
