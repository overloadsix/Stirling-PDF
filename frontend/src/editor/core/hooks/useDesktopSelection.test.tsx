import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  selectDesktopNode,
  useDesktopSelection,
} from "@app/hooks/useDesktopSelection";

function Node({ id, activate }: { id: string; activate: () => void }) {
  const selection = useDesktopSelection("tool", id);
  return (
    <button
      onClick={selection.onClick}
      onDoubleClick={activate}
      aria-pressed={selection.selected}
    >
      {id}
    </button>
  );
}

afterEach(() => {
  cleanup();
  selectDesktopNode(null);
});

describe("desktop browsing selection", () => {
  it("selects without executing and executes once on a real double click", async () => {
    const activate = vi.fn();
    const user = userEvent.setup();
    render(<Node id="compress" activate={activate} />);
    await user.click(screen.getByRole("button"));
    expect(screen.getByRole("button").getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(activate).not.toHaveBeenCalled();
    await user.dblClick(screen.getByRole("button"));
    expect(activate).toHaveBeenCalledTimes(1);
  });

  it("moves the shared selection between browsing nodes", async () => {
    const user = userEvent.setup();
    render(
      <>
        <Node id="compress" activate={vi.fn()} />
        <Node id="merge" activate={vi.fn()} />
      </>,
    );
    await user.click(screen.getByRole("button", { name: "compress" }));
    await user.click(screen.getByRole("button", { name: "merge" }));
    expect(
      screen
        .getByRole("button", { name: "compress" })
        .getAttribute("aria-pressed"),
    ).toBe("false");
    expect(
      screen
        .getByRole("button", { name: "merge" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("leaves native context menus unhandled", () => {
    const activate = vi.fn();
    render(<Node id="compress" activate={activate} />);
    const event = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
    });
    screen.getByRole("button").dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(activate).not.toHaveBeenCalled();
  });
});
