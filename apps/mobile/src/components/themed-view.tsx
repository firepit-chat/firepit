import { View, type ViewProps } from "react-native";

import { ThemeColor, isDarkPalette } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { useThemePreference } from "@/providers/theme-preference-context";

export type ThemedViewProps = ViewProps & {
  lightColor?: string;
  darkColor?: string;
  type?: ThemeColor;
};

export function ThemedView({
  style,
  lightColor,
  darkColor,
  type,
  ...otherProps
}: ThemedViewProps) {
  const theme = useTheme();
  const { palette } = useThemePreference();

  let backgroundColor: string;
  if (type !== undefined) {
    backgroundColor = theme[type];
  } else if (isDarkPalette(palette)) {
    // Keyed off the selected palette, not the OS colour scheme: three of the
    // four palettes are dark, so a user can pick Latte on a dark-mode device.
    backgroundColor = darkColor ?? theme.background;
  } else {
    backgroundColor = lightColor ?? theme.background;
  }

  return <View style={[{ backgroundColor }, style]} {...otherProps} />;
}
