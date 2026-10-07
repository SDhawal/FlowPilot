export const serverStatusKeys = {
  all: ["server-status"] as const,
  ready: () => [...serverStatusKeys.all, "ready"] as const,
};
