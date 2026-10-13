import { router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ArrowLeft } from "lucide-react-native";

import { AuthRouteGuard } from "@/components/auth-route-guard";
import { ThemedText } from "@/components/themed-text";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

type Entry = {
    question: string;
    answer: string[];
};

const SECTIONS: { title: string; entries: Entry[] }[] = [
    {
        title: "Messages",
        entries: [
            {
                question: "How do I react to, reply to, or delete a message?",
                answer: [
                    "Touch and hold any message to open its action row.",
                    "From there you can add a reaction, reply, start a thread, edit or delete your own messages, and pin.",
                    "The same row is reachable with a screen reader: focus a message and activate it.",
                ],
            },
            {
                question: "What is a thread?",
                answer: [
                    "A thread is a side conversation hanging off one message.",
                    "Opening it keeps the main channel tidy instead of interleaving replies.",
                    "Opening a thread marks it read, here and on the server.",
                ],
            },
            {
                question: "Why did I not see a thread at first?",
                answer: [
                    "The reply count only appears once someone has replied.",
                    "Until then the thread is still reachable with a long press on the original message.",
                ],
            },
            {
                question: "Where are the date dividers?",
                answer: [
                    "A divider marks the first message of each calendar day, reading Today or Yesterday.",
                    "Dividers appear in both channel conversations and direct messages.",
                ],
            },
        ],
    },
    {
        title: "Servers and channels",
        entries: [
            {
                question: "Where did the server page go?",
                answer: [
                    "It is gone. The chat tab is now the channel browser: tap a server to expand its channels.",
                    "Tapping a server on the home screen opens the chat tab already expanded on that server.",
                ],
            },
            {
                question: "How do I see who is in this channel?",
                answer: [
                    "Tap the people icon in the top-right of a conversation.",
                    "The list groups members by Online and Offline, and updates live.",
                    "Tap a member to open their profile.",
                ],
            },
            {
                question: "How do I manage a server?",
                answer: [
                    "Tap the channel name in the conversation header.",
                    "That menu has channel management, roles and permissions, and server mute.",
                    "Management entries appear only if your role allows them.",
                ],
            },
            {
                question: "How do I mute something?",
                answer: [
                    "For a channel, touch and hold it in the chat tab and pick a duration.",
                    "For a whole server, use the server menu in the conversation header.",
                    "Muted rows are dimmed and stop counting as unread.",
                ],
            },
            {
                question: "What do 18+ and ANNOUNCEMENT mean?",
                answer: [
                    "18+ marks a channel marked as NSFW.",
                    "ANNOUNCEMENT marks an announcement-only channel, and VOICE marks a voice channel.",
                    "The conversation header shows the same badges for the channel you are in.",
                ],
            },
        ],
    },
    {
        title: "Appearance",
        entries: [
            {
                question: "How do I change the theme?",
                answer: [
                    "Settings, then Appearance.",
                    "Pick one of six palettes and twelve accent colours; the whole app follows your choice.",
                    "The theme is saved per device, so it does not follow you to another device.",
                ],
            },
            {
                question: "Why did the contrast of the app change?",
                answer: [
                    "Status colours, button fills and error text were rebuilt so every pairing clears the 4.5:1 contrast minimum.",
                    "That is why some badge colours are darker or paler than before.",
                ],
            },
        ],
    },
    {
        title: "Storage",
        entries: [
            {
                question: "What does the cache size mean?",
                answer: [
                    "It is the on-device cache of images, emoji and message data.",
                    "The figure refreshes when you change the caching strategy, when you return to the app, and while the settings screen is open.",
                    "Clearing it is safe; it repopulates as you browse.",
                ],
            },
            {
                question: "What do the caching strategies do?",
                answer: [
                    "Aggressive keeps everything including media.",
                    "Medium keeps pictures, emoji and messages.",
                    "Minimal keeps pictures and emoji only.",
                    "None disables caching entirely.",
                ],
            },
        ],
    },
    {
        title: "Troubleshooting",
        entries: [
            {
                question: "Reactions or threads are not saving",
                answer: [
                    "Check the app is signed in, then pull to refresh the conversation.",
                    "A 400 from a reaction toggle means the app and the server disagree about what you already reacted with; updating to the current version fixes it.",
                ],
            },
            {
                question: "Loading feels slow",
                answer: [
                    "A hosted instance sleeps when nobody is using it, so the first request after a pause can take a few seconds.",
                    "After that it is warm and fast.",
                ],
            },
            {
                question: "Something still looks wrong",
                answer: [
                    "If a screen looks stale, fully close and reopen the app rather than only switching tabs.",
                    "Check for an app update in Settings, then App Updates.",
                ],
            },
        ],
    },
];

export default function HelpScreen() {
    const theme = useTheme();

    return (
        <AuthRouteGuard>
        <SafeAreaView
            style={[styles.safeArea, { backgroundColor: theme.background }]}
            edges={["top", "left", "right"]}
        >
            <View style={[styles.header, { borderBottomColor: theme.border }]}>
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Back to settings"
                    onPress={() => router.back()}
                    style={styles.backButton}
                    hitSlop={8}
                >
                    <ArrowLeft size={18} color={theme.foreground} />
                    <ThemedText type="smallBold">Settings</ThemedText>
                </Pressable>
            </View>

            <ScrollView
                contentContainerStyle={styles.content}
                showsVerticalScrollIndicator={false}
            >
                <ThemedText type="title" style={styles.title}>
                    Help
                </ThemedText>
                <ThemedText
                    themeColor="mutedForeground"
                    style={styles.intro}
                >
                    How the app behaves, and where things moved to.
                </ThemedText>

                {SECTIONS.map((section) => (
                    <View key={section.title} style={styles.section}>
                        <ThemedText type="subtitle" style={styles.sectionTitle}>
                            {section.title}
                        </ThemedText>
                        {section.entries.map((entry) => (
                            <View
                                key={entry.question}
                                style={[
                                    styles.card,
                                    {
                                        backgroundColor: theme.card,
                                        borderColor: theme.border,
                                    },
                                ]}
                            >
                                <ThemedText type="smallBold" style={styles.question}>
                                    {entry.question}
                                </ThemedText>
                                {entry.answer.map((line) => (
                                    <ThemedText
                                        key={line}
                                        themeColor="mutedForeground"
                                        style={styles.answer}
                                    >
                                        {line}
                                    </ThemedText>
                                ))}
                            </View>
                        ))}
                    </View>
                ))}

                <ThemedText
                    type="code"
                    themeColor="mutedForeground"
                    style={styles.footer}
                >
                    Firepit · help
                </ThemedText>
            </ScrollView>
        </SafeAreaView>
        </AuthRouteGuard>
    );
}

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
    },
    header: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: Spacing.three,
        paddingVertical: Spacing.two,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    backButton: {
        flexDirection: "row",
        alignItems: "center",
        gap: Spacing.one,
    },
    content: {
        padding: Spacing.three,
        gap: Spacing.three,
        paddingBottom: Spacing.five,
    },
    title: {
        fontSize: 28,
        lineHeight: 34,
    },
    intro: {
        marginTop: -Spacing.two,
    },
    section: {
        gap: Spacing.two,
    },
    sectionTitle: {
        fontSize: 18,
        lineHeight: 24,
    },
    card: {
        borderRadius: 12,
        borderWidth: StyleSheet.hairlineWidth,
        padding: Spacing.three,
        gap: Spacing.one,
    },
    question: {
        paddingBottom: Spacing.one,
    },
    answer: {
        fontSize: 13,
        lineHeight: 19,
    },
    footer: {
        textAlign: "center",
        paddingTop: Spacing.two,
    },
});