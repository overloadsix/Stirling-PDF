import { useSyncExternalStore } from "react";
import "@app/styles/desktopSelection.css";

/** Selection is shared between browsing surfaces without changing active tools or files. */
export type DesktopSelection = {
  kind: "file" | "folder" | "tool";
  id: string;
} | null;

let activeSelection: DesktopSelection = null;
const subscribers = new Set<() => void>();

/** Publishes selection only; callers must activate through a separate event. */
export function selectDesktopNode(selection: DesktopSelection) {
  activeSelection = selection;
  for (const subscriber of subscribers) subscriber();
}

const subscribe = (subscriber: () => void) => {
  subscribers.add(subscriber);
  return () => {
    subscribers.delete(subscriber);
  };
};

/** Exposes the active browsing node without activating its file or tool. */
export function useDesktopActiveSelection() {
  return useSyncExternalStore(
    subscribe,
    () => activeSelection,
    () => null,
  );
}

/** Returns shared selection and selection-only handlers for a browsable node. */
export function useDesktopSelection(
  kind: "file" | "folder" | "tool",
  id: string,
) {
  const selection = useDesktopActiveSelection();
  const selected = selection?.kind === kind && selection.id === id;
  return {
    selected,
    select: () => selectDesktopNode({ kind, id }),
    onClick: (event: React.MouseEvent) => {
      event.preventDefault();
      selectDesktopNode({ kind, id });
    },
  };
}
