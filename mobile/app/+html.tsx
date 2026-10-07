import { ScrollViewStyleReset } from "expo-router/html";
import type { PropsWithChildren } from "react";

/** Web-only root HTML for static rendering. Runs in Node, so no browser APIs here. */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <title>FlowPilot</title>
        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
