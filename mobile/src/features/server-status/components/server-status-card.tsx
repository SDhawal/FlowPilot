import { useEffect, useRef } from "react";
import { AccessibilityInfo, ActivityIndicator, Platform, View } from "react-native";

import { apiBaseUrl } from "@/lib/api/base-url";
import { Button } from "@/ui/button";
import { Text } from "@/ui/text";

import type { ServerStatus } from "../api/use-server-status";

type ServerStatusCardProps = {
  status: ServerStatus;
  onRetry: () => void;
};

const copy: Record<ServerStatus, { title: string; detail?: string }> = {
  checking: { title: "Checking the server…" },
  waking: {
    title: "Waking up the server…",
    detail: "The free server sleeps when idle. This can take up to a minute.",
  },
  connected: { title: "Connected", detail: "FlowPilot API is ready." },
  unreachable: {
    title: "Can't reach the server",
    detail: "Check your connection and try again.",
  },
};

const indicatorLabel: Partial<Record<ServerStatus, string>> = {
  checking: "Checking",
  waking: "Waking up",
};

export function ServerStatusCard({ status, onRetry }: ServerStatusCardProps) {
  const { title, detail } = copy[status];
  const busyLabel = indicatorLabel[status];

  // aria-live covers web and Android; iOS VoiceOver ignores it, so announce changes explicitly.
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (Platform.OS === "ios") AccessibilityInfo.announceForAccessibility(title);
  }, [title]);

  return (
    <View className="w-full max-w-md items-center gap-3 rounded-card bg-surface p-6 dark:bg-surface-dark">
      {busyLabel ? <ActivityIndicator size="large" accessibilityLabel={busyLabel} /> : null}
      <Text variant="title" accessibilityRole="header" aria-live="polite">
        {title}
      </Text>
      {detail ? (
        <Text variant="body" className="text-center">
          {detail}
        </Text>
      ) : null}
      {status === "unreachable" ? <Button label="Retry" onPress={onRetry} /> : null}
      {__DEV__ ? <Text variant="caption">API: {apiBaseUrl}</Text> : null}
    </View>
  );
}
