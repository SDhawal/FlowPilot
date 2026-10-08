import { Text as RNText, type TextProps as RNTextProps } from "react-native";

import type { TextVariant } from "./tokens";

type TextProps = RNTextProps & {
  variant?: TextVariant;
  className?: string;
};

const variantClass: Record<TextVariant, string> = {
  title: "text-title text-foreground dark:text-foreground-dark",
  body: "text-body text-foreground dark:text-foreground-dark",
  caption: "text-caption text-muted dark:text-muted-dark",
};

/** Themed text. Font scaling (dynamic type) stays on; never set allowFontScaling={false}. */
export function Text({ variant = "body", className = "", ...props }: TextProps) {
  return <RNText allowFontScaling className={`${variantClass[variant]} ${className}`} {...props} />;
}
