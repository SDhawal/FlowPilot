/**
 * Token names shared with tailwind.config.js. The values live in the Tailwind config;
 * this file only holds what TypeScript code needs (numbers for native props, name unions).
 */

/** Minimum touch target in points (iOS HIG 44pt, Android 48dp is covered by padding). */
export const MIN_TOUCH_TARGET = 44;

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
