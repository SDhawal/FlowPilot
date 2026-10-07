import { ActivityIndicator, Pressable, useColorScheme } from "react-native";

import { Text } from "./text";
import { buttonLabelColors, MIN_TOUCH_TARGET, type ButtonVariant } from "./tokens";

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  busy?: boolean;
  accessibilityLabel?: string;
};

const containerClass: Record<ButtonVariant, string> = {
  primary: "bg-primary dark:bg-primary-dark",
  secondary: "border border-border bg-transparent dark:border-border-dark",
};

const labelClass: Record<ButtonVariant, string> = {
  primary: "text-primary-foreground dark:text-background-dark",
  secondary: "text-foreground dark:text-foreground-dark",
};

export function Button({
  label,
  onPress,
  variant = "primary",
  disabled = false,
  busy = false,
  accessibilityLabel,
}: ButtonProps) {
  const scheme = useColorScheme() === "dark" ? "dark" : "light";
  const spinnerColor = buttonLabelColors[variant][scheme];
  const inactive = disabled || busy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: inactive, busy }}
      disabled={inactive}
      onPress={onPress}
      style={{ minHeight: MIN_TOUCH_TARGET, minWidth: MIN_TOUCH_TARGET }}
      className={`flex-row items-center justify-center gap-2 rounded-control px-5 py-3 ${containerClass[variant]} ${inactive ? "opacity-60" : "active:opacity-80"}`}
    >
      {busy ? <ActivityIndicator size="small" color={spinnerColor} /> : null}
      <Text className={`font-semibold ${labelClass[variant]}`}>{label}</Text>
    </Pressable>
  );
}
