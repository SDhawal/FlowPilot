import { useServerStatus } from "@/features/server-status/api/use-server-status";
import { ServerStatusCard } from "@/features/server-status/components/server-status-card";
import { Screen } from "@/ui/screen";

export default function Home() {
  const { status, retry } = useServerStatus();

  return (
    <Screen className="items-center justify-center">
      <ServerStatusCard status={status} onRetry={retry} />
    </Screen>
  );
}
