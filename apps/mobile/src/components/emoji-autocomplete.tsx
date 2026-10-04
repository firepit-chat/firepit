import React, { useCallback, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  Image,
} from "react-native";
import { useTheme } from "@/hooks/use-theme";
import { filterEmojis, type AutocompleteEmoji } from "@/lib/emoji-autocomplete-utils";

export { filterEmojis };
export type { AutocompleteEmoji };

const keyExtractor = (item: AutocompleteEmoji, index: number) =>
  `${item.shortcode}-${index}`;


type EmojiAutocompleteProps = {
  query: string;
  standardEmojis: Record<string, string>;
  customEmojis: AutocompleteEmoji[];
  onSelect: (emoji: AutocompleteEmoji) => void;
  selectedIndex?: number;
  onSelectedIndexChange?: (index: number) => void;
};

export function EmojiAutocomplete({
  query,
  standardEmojis,
  customEmojis,
  onSelect,
  selectedIndex,
  onSelectedIndexChange,
}: EmojiAutocompleteProps) {
  const colors = useTheme();

  const items = useMemo(
    () => filterEmojis(query, standardEmojis, customEmojis),
    [query, standardEmojis, customEmojis],
  );

  // Hoisted: an inline renderItem lands in the list cell's props and defeats
  // its PureComponent. This list re-renders on every keystroke in the composer.
  const renderEmojiItem = useCallback(
    ({ item, index }: { item: AutocompleteEmoji; index: number }) => {
      const isSelected = index === selectedIndex;
      return (
        <Pressable
          onPress={() => onSelect(item)}
          style={({ pressed }) => ({
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            paddingHorizontal: 12,
            paddingVertical: 8,
            backgroundColor: isSelected
              ? colors.muted
              : pressed
                ? colors.muted
                : "transparent",
          })}
        >
          {item.customUrl ? (
            <Image
              source={{ uri: item.customUrl }}
              style={{ width: 22, height: 22 }}
            />
          ) : (
            <Text style={{ fontSize: 22 }}>{item.unicode}</Text>
          )}
          <Text style={{ color: colors.text, fontSize: 14 }}>
            :{item.shortcode}:
          </Text>
        </Pressable>
      );
    },
    [colors, onSelect, selectedIndex],
  );

  if (items.length === 0) return null;

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
      <FlatList
        data={items}
        keyExtractor={keyExtractor}
        renderItem={renderEmojiItem}
      />
    </View>
  );
}

export default EmojiAutocomplete;
