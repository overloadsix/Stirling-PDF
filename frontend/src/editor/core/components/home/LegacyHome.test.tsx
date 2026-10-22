import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import LegacyHome from "@app/components/home/LegacyHome";
import type { FileId } from "@app/types/file";

const mocks = vi.hoisted(() => ({
  open: vi.fn(),
  tool: vi.fn(),
  leave: vi.fn(),
  refresh: vi.fn(),
  add: vi.fn(),
  materialize: vi.fn(),
  setSelected: vi.fn(),
  setActive: vi.fn(),
  file: {
    id: "document-1",
    name: "Report.pdf",
    size: 2048,
    type: "application/pdf",
    createdAt: 1000,
  },
}));
vi.mock("@app/contexts/FilesPageContext", () => ({
  useFilesPage: () => {
    const [selectedFileIds, setSelectedFileIds] = useState(new Set<FileId>());
    return {
      allFiles: [mocks.file],
      loading: false,
      refresh: mocks.refresh,
      selectedFileIds,
      setSelectedFileIds,
    };
  },
}));
vi.mock("@app/contexts/FileContext", () => ({
  useAllFiles: () => ({ fileIds: [mocks.file.id], fileStubs: [mocks.file] }),
  useFileActions: () => ({ actions: { setSelectedFiles: mocks.setSelected } }),
}));
vi.mock("@app/hooks/useFileHandler", () => ({
  useFileHandler: () => ({ addFiles: mocks.add }),
}));
vi.mock("@app/contexts/NavigationContext", () => ({
  useNavigationActions: () => ({ actions: { setWorkbench: mocks.open } }),
  useNavigationGuard: () => ({
    requestNavigation: (action: () => void) => action(),
  }),
}));
vi.mock("@app/contexts/ToolWorkflowContext", () => ({
  useToolWorkflow: () => ({
    handleToolSelect: mocks.tool,
    toolRegistry: { compress: { component: () => null } },
    toolAvailability: {},
  }),
}));
vi.mock("@app/contexts/ViewerContext", () => ({
  useViewer: () => ({ setActiveFileId: mocks.setActive }),
}));
vi.mock("@app/services/fileSyncService", () => ({
  materializeServerStubs: mocks.materialize,
}));
vi.mock("@app/services/openFilesFromDisk", () => ({
  openFilesFromDisk: vi.fn(),
}));
vi.mock("@app/contexts/AppConfigContext", () => ({
  useAppConfig: () => ({ config: {} }),
}));
vi.mock("@app/components/tools/fullscreen/shared", () => ({
  getToolDisabledReason: () => null,
}));
vi.mock("@app/ui/Button", () => ({
  Button: ({
    variant: _variant,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string }) => (
    <button {...props} />
  ),
}));

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});
afterEach(cleanup);

describe("legacy home document browsing", () => {
  it("opens metadata on a single click without opening the file or running a tool", async () => {
    const user = userEvent.setup();
    render(<LegacyHome onLeave={mocks.leave} onTools={vi.fn()} />);
    expect(screen.queryByRole("complementary")).toBeNull();
    await user.click(screen.getByRole("cell", { name: "Report.pdf" }));
    expect(
      screen.getByRole("complementary", { name: "Document details" }),
    ).toBeTruthy();
    expect(screen.getByRole("row", { selected: true })).toBeTruthy();
    expect(mocks.open).not.toHaveBeenCalled();
    expect(mocks.tool).not.toHaveBeenCalled();
    expect(mocks.materialize).not.toHaveBeenCalled();
  });

  it("opens on double click and records an actual opening timestamp", async () => {
    const user = userEvent.setup();
    render(<LegacyHome onLeave={mocks.leave} onTools={vi.fn()} />);
    await user.dblClick(screen.getByRole("cell", { name: "Report.pdf" }));
    await waitFor(() => expect(mocks.open).toHaveBeenCalledWith("viewer"));
    expect(mocks.setActive).toHaveBeenCalledWith(mocks.file.id);
    expect(mocks.leave).toHaveBeenCalledTimes(1);
    expect(
      JSON.parse(localStorage.getItem("stirling.legacyHomeMetadata")!)[
        mocks.file.id
      ].openedAt,
    ).toEqual(expect.any(Number));
  });

  it("persists stars and keeps inline actions from opening documents", async () => {
    const user = userEvent.setup();
    render(<LegacyHome onLeave={mocks.leave} onTools={vi.fn()} />);
    await user.dblClick(
      screen.getByRole("button", { name: "Actions for Report.pdf" }),
    );
    expect(mocks.open).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Star document" }));
    await user.click(
      screen.getByRole("button", { name: "Starred", exact: true }),
    );
    expect(screen.getByRole("cell", { name: "★ Report.pdf" })).toBeTruthy();
    expect(
      JSON.parse(localStorage.getItem("stirling.legacyHomeMetadata")!)[
        mocks.file.id
      ].starred,
    ).toBe(true);
  });

  it("passes the selected document to a Stirling tool shortcut", async () => {
    const user = userEvent.setup();
    render(<LegacyHome onLeave={mocks.leave} onTools={vi.fn()} />);
    await user.click(screen.getByRole("cell", { name: "Report.pdf" }));
    await user.click(
      screen.getByRole("button", { name: "Compress", exact: true }),
    );
    expect(mocks.tool).toHaveBeenCalledWith("compress");
    expect(mocks.setSelected).toHaveBeenCalledWith([mocks.file.id]);
  });
});
