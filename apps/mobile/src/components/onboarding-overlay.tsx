import { useCallback, useRef, useState } from "react";
import {
    Pressable,
    ScrollView,
    StyleSheet,
    useWindowDimensions,
    View,
} from "react-native";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { Bell, Hand, MessageSquare, Users, Flame } from "lucide-react-native";

const SLIDE_ICONS = {
    flame: Flame,
    messages: MessageSquare,
    hand: Hand,
    users: Users,
    bell: Bell,
} as const;

function SlideIcon({ name }: { name: SlideIconName }) {
    const theme = useTheme();
    const Icon = SLIDE_ICONS[name];
    return <Icon size={14} color={theme.mutedForeground} />;
}

type SlideIconName = keyof typeof SLIDE_ICONS;

/**
 * Every slide has to earn its place: either it teaches a gesture the app
 * cannot advertise on its own, or it says something true the UI does not.
 *
 * The previous copy was marketing filler ("a messaging platform for your
 * community") and had gone stale — it still told people to browse channels
 * from the Home tab, which stopped being true when channel browsing moved
 * into the Chat tab.
 */
const SLIDES: { icon: SlideIconName; title: string; subtitle: string; body: string }[] = [
    {
        icon: "flame",
        title: "Welcome to Firepit",
        subtitle: "Your server, your rules.",
        body: "Servers, channels and direct messages — hosted on an instance you control. Everything here is yours to run, from the themes to where the data lives.",
    },
    {
        icon: "messages",
        title: "Finding a conversation",
        subtitle: "Everything starts in the Chat tab.",
        body: "The Chat tab lists every server you belong to. Tap one to expand its channels, then tap a channel to open it. Direct messages sit underneath.",
    },
    {
        icon: "hand",
        title: "What to do with a message",
        subtitle: "Press and hold any message.",
        body: "That opens the action row: react, reply, start a thread, edit, delete, pin. A message with replies also shows a count you can tap to follow the thread.",
    },
    {
        icon: "users",
        title: "While you're in a channel",
        subtitle: "Everything lives in the header.",
        body: "Tap the people icon to see who is in the channel and who is online. Tap the channel name for server settings — channels, roles, mute — and to read the topic.",
    },
    {
        icon: "bell",
        title: "Catching up, and making it yours",
        subtitle: "Inbox, Friends, Settings.",
        body: "The Inbox collects mentions and thread replies. Settings holds your theme, notifications and caching — and Help, which explains the rest whenever you need it.",
    },
];

type Props = {
    onComplete: () => void;
};

export function OnboardingOverlay({ onComplete }: Props) {
    const theme = useTheme();
    const { width: screenWidth } = useWindowDimensions();
    const scrollRef = useRef<ScrollView>(null);
    const [currentIndex, setCurrentIndex] = useState(0);
    const isLastSlide = currentIndex === SLIDES.length - 1;

    const handleScroll = useCallback(
        (e: { nativeEvent: { contentOffset: { x: number } } }) => {
            const index = Math.round(
                e.nativeEvent.contentOffset.x / screenWidth,
            );
            setCurrentIndex(index);
        },
        [screenWidth],
    );

    const handleNext = useCallback(() => {
        if (isLastSlide) {
            onComplete();
        } else {
            scrollRef.current?.scrollTo({
                x: (currentIndex + 1) * screenWidth,
                animated: true,
            });
        }
    }, [isLastSlide, currentIndex, screenWidth, onComplete]);

    return (
        <View
            style={[
                styles.root,
                { backgroundColor: theme.background },
            ]}
        >
            {/* Skip button */}
            {!isLastSlide ? (
                <Pressable
                    accessibilityRole="button"
                    onPress={onComplete}
                    style={styles.skip}
                >
                    <ThemedText
                        type="smallBold"
                        themeColor="mutedForeground"
                    >
                        Skip
                    </ThemedText>
                </Pressable>
            ) : null}

            {/* Slides */}
            <ScrollView
                ref={scrollRef}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={handleScroll}
                scrollEventThrottle={16}
                bounces={false}
            >
                {SLIDES.map((slide, index) => (
                    <View
                        key={index}
                        style={[styles.slide, { width: screenWidth }]}
                    >
                        <ThemedView
                            type="card"
                            style={[
                                styles.card,
                                { borderColor: theme.border },
                            ]}
                        >
                            {/* Step number, paired with an icon so the slides
                                read as a sequence rather than a wall of text. */}
                            <ThemedView
                                type="muted"
                                style={styles.stepBadge}
                            >
                                <SlideIcon name={slide.icon} />
                                <ThemedText
                                    type="code"
                                    themeColor="mutedForeground"
                                >
                                    {index + 1} / {SLIDES.length}
                                </ThemedText>
                            </ThemedView>

                            <ThemedText
                                type="title"
                                style={styles.slideTitle}
                            >
                                {slide.title}
                            </ThemedText>

                            <ThemedText
                                type="subtitle"
                                style={styles.slideSubtitle}
                            >
                                {slide.subtitle}
                            </ThemedText>

                            <ThemedText
                                themeColor="mutedForeground"
                                style={styles.slideBody}
                            >
                                {slide.body}
                            </ThemedText>
                        </ThemedView>
                    </View>
                ))}
            </ScrollView>

            {/* Bottom controls */}
            <View
                style={[
                    styles.bottom,
                    { backgroundColor: theme.background },
                ]}
            >
                {/* Dot indicators */}
                <View style={styles.dots}>
                    {SLIDES.map((_, index) => (
                        <View
                            key={index}
                            style={[
                                styles.dot,
                                {
                                    backgroundColor:
                                        index === currentIndex
                                            ? theme.primary
                                            : theme.mutedForeground,
                                    opacity:
                                        index === currentIndex ? 1 : 0.3,
                                },
                            ]}
                        />
                    ))}
                </View>

                {/* Next / Get Started button */}
                <Pressable
                    accessibilityRole="button"
                    onPress={handleNext}
                    style={({ pressed }) => [
                        styles.nextButton,
                        {
                            backgroundColor: theme.primary,
                            borderColor: theme.primary,
                        },
                        pressed && styles.nextButtonPressed,
                    ]}
                >
                    <ThemedText
                        type="smallBold"
                        themeColor="primaryForeground"
                        style={styles.nextButtonLabel}
                    >
                        {isLastSlide ? "Get started" : "Next"}
                    </ThemedText>
                </Pressable>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    root: {
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 100,
    },
    skip: {
        position: "absolute",
        top: 60,
        right: Spacing.three,
        zIndex: 10,
        paddingHorizontal: Spacing.three,
        paddingVertical: Spacing.two,
    },
    slide: {
        flex: 1,
        justifyContent: "center",
        paddingHorizontal: Spacing.three,
    },
    card: {
        borderRadius: 28,
        padding: Spacing.five,
        gap: Spacing.three,
        borderWidth: 1,
    },
    stepBadge: {
        flexDirection: "row",
        alignItems: "center",
        gap: Spacing.one,
        alignSelf: "flex-start",
        paddingHorizontal: Spacing.two,
        paddingVertical: Spacing.one,
        borderRadius: 999,
    },
    slideTitle: {},
    slideSubtitle: {},
    slideBody: {
        fontSize: 16,
        lineHeight: 24,
    },
    bottom: {
        paddingHorizontal: Spacing.three,
        paddingBottom: 60,
        gap: Spacing.four,
        alignItems: "center",
    },
    dots: {
        flexDirection: "row",
        gap: Spacing.two,
    },
    dot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    nextButton: {
        alignSelf: "stretch",
        minHeight: 52,
        borderRadius: 999,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: Spacing.four,
        borderWidth: 1,
        shadowColor: "#d9792b",
        shadowOpacity: 0.12,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 6 },
    },
    nextButtonPressed: {
        opacity: 0.85,
    },
    nextButtonLabel: {
        fontSize: 17,
    },
});
