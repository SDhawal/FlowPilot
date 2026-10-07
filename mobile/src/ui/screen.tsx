import type { ReactNode } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { GUTTER } from "./tokens";

type ScreenProps = {
  children: ReactNode;
  className?: string;
};

/** Page container: safe-area padding, themed background, consistent gutters. */
export function Screen({ children, className = "" }: ScreenProps) {
  const insets = useSafeAreaInsets();
  return (
    <View
      className={`flex-1 bg-background dark:bg-background-dark ${className}`}
      style={{
        paddingTop: insets.top,
        paddingBottom: insets.bottom,
        // Inline style wins over className in NativeWind, so the gutter is added here, not via px-*.
        paddingLeft: insets.left + GUTTER,
        paddingRight: insets.right + GUTTER,
      }}
    >
      {children}
    </View>
  );
}
