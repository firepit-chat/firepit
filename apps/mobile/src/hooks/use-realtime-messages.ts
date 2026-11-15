import { useCallback, useEffect, useRef } from "react";
import { AppState } from "react-native";
import { Channel, Client, Query } from "react-native-appwrite";
import type { RealtimeResponseEvent } from "react-native-appwrite";
import { extractAppwriteConfig } from "@/lib/firepit/bootstrap";
import type { InstanceMetadata } from "@/lib/firepit/types";

const DATABASE_ID = "main";

// Typing/reaction bursts land in quick succession. Collect whatever arrives in
// this window and deliver it in one batch, so a burst costs one render instead
// of one each.
const BATCH_WINDOW_MS = 400;

interface UseRealtimeMessagesOptions {
    instance: InstanceMetadata | null;
    accessToken: string | null;
    collectionId: string;
    filterField: string;
    filterValue: string | null | undefined;
    /**
     * Receives the changed document straight from the realtime payload. Callers
     * should patch local state from it; refetching the whole list per event is
     * what burned through the instance rate limit.
     *
     * `events` are the Appwrite event names (`...create`, `...update`, ...).
     * Without them a caller cannot tell a brand-new row from an edit of one it
     * never loaded, and has to guess from content — which fails for encrypted
     * rows whose plaintext is empty.
     */
    onMessageEvent: (
        payload: Record<string, unknown>,
        events: string[],
    ) => void;
}

export function useRealtimeMessages({
    instance,
    accessToken,
    collectionId,
    filterField,
    filterValue,
    onMessageEvent,
}: UseRealtimeMessagesOptions) {
    const onEventRef = useRef(onMessageEvent);

    const subRef = useRef<(() => void) | null>(null);
    const batchRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pendingRef = useRef<
        { payload: Record<string, unknown>; events: string[] }[]
    >([]);

    // Synced after commit rather than during render, so a realtime event that
    // lands between renders still invokes the current closure.
    useEffect(() => {
        onEventRef.current = onMessageEvent;
    });

    const doSubscribe = useCallback((): (() => void) | null => {
        if (!filterValue || !accessToken) return null;

        const config = extractAppwriteConfig(instance ?? {});
        if (!config) return null;

        const channel = Channel.database(DATABASE_ID)
            .collection(collectionId)
            .document()
            .toString();

        const handleEvent = (
            response: RealtimeResponseEvent<Record<string, unknown>>,
        ) => {
            const payload = response.payload as
                Record<string, unknown> | undefined;
            if (!payload) return;

            const targetValue = String(payload[filterField] ?? "");
            if (targetValue !== filterValue) return;

            // Queue rather than replace: a burst (two people posting at once, or
            // a post plus an immediate reaction) must deliver every payload. A
            // trailing-edge debounce on a single slot drops the ones it
            // supersedes, and because callers patch local state instead of
            // refetching, a dropped payload is a message that never appears.
            pendingRef.current.push({ events: response.events ?? [], payload });
            if (batchRef.current) return;

            batchRef.current = setTimeout(() => {
                batchRef.current = null;
                const queued = pendingRef.current;
                pendingRef.current = [];
                for (const item of queued) {
                    onEventRef.current(item.payload, item.events);
                }
            }, BATCH_WINDOW_MS);
        };

        try {
            const client = new Client()
                .setEndpoint(config.endpoint)
                .setProject(config.project)
                .setSession(accessToken)
                .setPlatform("com.acarlson33.firepit");

            const queryStr = Query.equal(filterField, filterValue);
            return client.subscribe<Record<string, unknown>>(
                channel,
                handleEvent,
                [queryStr],
            );
        } catch {
            return null;
        }
    }, [instance, accessToken, collectionId, filterField, filterValue]);

    const doSubscribeRef = useRef(doSubscribe);
    useEffect(() => {
        doSubscribeRef.current = doSubscribe;
    });

    // Subscribe on mount / deps change
    useEffect(() => {
        subRef.current?.();
        subRef.current = doSubscribe();

        return () => {
            subRef.current?.();
            subRef.current = null;
            if (batchRef.current) {
                clearTimeout(batchRef.current);
                batchRef.current = null;
            }
            pendingRef.current = [];
        };
    }, [doSubscribe]);

    // Unsubscribe on background, re-subscribe on foreground
    useEffect(() => {
        const subscription = AppState.addEventListener("change", (state) => {
            if (state === "background") {
                subRef.current?.();
                subRef.current = null;
            } else if (state === "active") {
                subRef.current?.();
                subRef.current = doSubscribeRef.current();
            }
        });

        return () => {
            subscription.remove();
        };
    }, []);
}
