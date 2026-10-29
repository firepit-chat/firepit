import React, { useCallback } from "react";
import {
    View,
    Text,
    FlatList,
    Pressable,
    ActivityIndicator,
} from "react-native";
import { useTheme } from "@/hooks/use-theme";

const keyExtractor = (it: MentionableItem) =>
    it.type === "role"
        ? `role-${it.id}`
        : it.type === "all"
          ? "all"
          : `user-${it.userId}`;

type MentionableRole = {
    readonly type: "role";
    id: string;
    name: string;
    color: string;
    mentionable: boolean;
    memberCount: number;
};

export type MentionableUser = {
    userId: string;
    displayName?: string;
    type?: "user";
};

export type MentionableItem =
    { readonly type: "all" } | MentionableRole | MentionableUser;

type MentionAutocompleteProps = {
    users: MentionableUser[];
    roles: MentionableRole[];
    onSelect: (item: MentionableItem | null) => void;
    isLoading?: boolean;
    canMentionEveryone?: boolean;
    selectedIndex?: number;
};

export function MentionAutocomplete({
    users,
    roles,
    onSelect,
    isLoading,
    canMentionEveryone,
    selectedIndex,
}: MentionAutocompleteProps) {
    const colors = useTheme();

    const items: MentionableItem[] = [
        ...(canMentionEveryone ? [{ type: "all" as const }] : []),
        ...roles,
        ...users,
    ];

    // Hoisted: an inline renderItem lands in the list cell's props and defeats
    // its PureComponent, and this list re-renders on every keystroke in the
    // composer.
    const renderItem = useCallback(
        ({ item, index }: { item: MentionableItem; index: number }) => {
            const isSelected = index === selectedIndex;
            const rowStyle = {
                padding: 12,
                backgroundColor: isSelected ? colors.muted : "transparent",
            };

            if (item.type === "all") {
                return (
                    <Pressable onPress={() => onSelect(null)} style={rowStyle}>
                        <Text style={{ color: colors.text }}>@all</Text>
                    </Pressable>
                );
            }

            if (item.type === "role") {
                return (
                    <Pressable onPress={() => onSelect(item)} style={rowStyle}>
                        <Text style={{ color: colors.text }}>@{item.name}</Text>
                    </Pressable>
                );
            }

            return (
                <Pressable onPress={() => onSelect(item)} style={rowStyle}>
                    <Text style={{ color: colors.text }}>
                        {item.displayName || item.userId}
                    </Text>
                </Pressable>
            );
        },
        [colors.muted, colors.text, onSelect, selectedIndex],
    );

    return (
        <View
            style={{
                backgroundColor: colors.popover,
                borderWidth: 1,
                borderColor: colors.border,
                maxHeight: 220,
                borderRadius: 10,
                overflow: "hidden",
                marginBottom: 8,
            }}
        >
            {isLoading ? (
                <View style={{ padding: 12 }}>
                    <ActivityIndicator />
                </View>
            ) : (
                <FlatList
                    data={items}
                    keyExtractor={keyExtractor}
                    renderItem={renderItem}
                />
            )}
        </View>
    );
}

export default MentionAutocomplete;
