/**
 * Token names shared with tailwind.config.js. The values live in the Tailwind config;
 * this file only holds what TypeScript code needs (numbers for native props, name unions).
 */

/** Minimum touch target in points (iOS HIG 44pt, Android 48dp is covered by padding). */
export const MIN_TOUCH_TARGET = 44;

/** Horizontal page gutter in points. Keep in sync with spacing.gutter in tailwind.config.js. */
export const GUTTER = 20;

/** Label colors (light, dark) per button variant, mirroring tailwind.config.js. */
export const buttonLabelColors = {
  primary: { light: "#ffffff", dark: "#0b0f19" },
  secondary: { light: "#111827", dark: "#f9fafb" },
} as const;

export const textVariants = ["title", "body", "caption"] as const;
export type TextVariant = (typeof textVariants)[number];

export const buttonVariants = ["primary", "secondary"] as const;
export type ButtonVariant = (typeof buttonVariants)[number];

export const colorTokens = [
  "background",
  "surface",
  "foreground",
  "muted",
  "primary",
  "border",
  "success",
  "danger",
] as const;
export type ColorToken = (typeof colorTokens)[number];
