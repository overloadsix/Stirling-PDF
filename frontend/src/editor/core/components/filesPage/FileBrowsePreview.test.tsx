import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { MantineProvider } from "@mantine/core";
import { FileBrowsePreview } from "@app/components/filesPage/FileBrowsePreview";
import type { FilesPageEntry } from "@app/components/filesPage/FileGrid";
import type { FileId } from "@app/types/file";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback: string, values?: { name?: string }) =>
      (fallback ?? key).replace("{{name}}", values?.name ?? ""),
  }),
}));

const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  readDisk: vi.fn(),
  open: vi.fn(),
  close: vi.fn(),
  render: vi.fn(),
  access: undefined as undefined | { password: string },
}));
vi.mock("@app/services/fileStorage", () => ({
  fileStorage: { getStirlingFile: mocks.load },
}));
vi.mock("@app/services/localFolderContents", () => ({
  readDiskFile: mocks.readDisk,
}));
vi.mock("@app/hooks/usePdfAccess", () => ({
  usePdfAccess: () => mocks.access,
}));
vi.mock("@app/services/documentBytesCache", () => ({
  getDocumentBytes: async () => new ArrayBuffer(1),
}));
vi.mock("@app/services/pdfiumService", () => ({
  openRawDocumentSafe: mocks.open,
  closeRawDocument: mocks.close,
  getPdfiumModule: async () => ({ FPDF_GetPageCount: () => 3 }),
}));
vi.mock("@app/utils/pdfiumPageRender", () => ({
  renderPdfiumPageDataUrl: mocks.render,
  readPdfiumPageMetadata: async () => ({ width: 600, height: 800 }),
}));
const entry: FilesPageEntry = {
  kind: "file",
  file: {
    id: "a" as FileId,
    name: "a.pdf",
    size: 10,
    type: "application/pdf",
    lastModified: 0,
    isLeaf: true,
    originalFileId: "a",
    versionNumber: 1,
  },
};
const show = (item?: FilesPageEntry) =>
  render(
    <MantineProvider>
      <FileBrowsePreview entry={item} />
    </MantineProvider>,
  );
beforeEach(() => {
  vi.clearAllMocks();
  mocks.access = undefined;
  mocks.open.mockResolvedValue(42);
  mocks.close.mockResolvedValue(undefined);
  mocks.load.mockResolvedValue(
    new File(["pdf"], "a.pdf", { type: "application/pdf" }),
  );
  mocks.render.mockResolvedValue("data:image/png;base64,preview");
});
it("previews selected PDF pages without opening a workspace document", async () => {
  show(entry);
  expect(await screen.findByAltText("Preview of a.pdf")).toBeInTheDocument();
  expect(mocks.render).toHaveBeenCalledWith(42, 0, 2, { applyRotation: true });
  fireEvent.click(screen.getByRole("button", { name: "Next page" }));
  await waitFor(() =>
    expect(mocks.render).toHaveBeenCalledWith(42, 1, 2, {
      applyRotation: true,
    }),
  );
  await waitFor(() => expect(mocks.close).toHaveBeenCalledTimes(2));
});
it("clears a previous preview when the directory selection changes", async () => {
  const view = show(entry);
  await screen.findByAltText("Preview of a.pdf");
  view.rerender(
    <MantineProvider>
      <FileBrowsePreview />
    </MantineProvider>,
  );
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
  expect(
    screen.getAllByText("Select a file to preview").length,
  ).toBeGreaterThan(0);
});
it("does not read protected bytes or expose their saved thumbnails", () => {
  show({
    ...entry,
    file: {
      ...entry.file!,
      thumbnailUrl: "secret",
      processedFile: { isEncrypted: true } as NonNullable<
        typeof entry.file
      >["processedFile"],
    },
  });
  expect(screen.getByText("Locked")).toBeInTheDocument();
  expect(mocks.load).not.toHaveBeenCalled();
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
});
it("reads a mounted directory file through the existing disk service", async () => {
  mocks.readDisk.mockResolvedValue(
    new File(["pdf"], "disk.pdf", { type: "application/pdf" }),
  );
  const disk = {
    path: "C:/library/disk.pdf",
    name: "disk.pdf",
    sizeBytes: 3,
    lastModified: 0,
  };
  show({ kind: "diskFile", disk });
  await screen.findByAltText("Preview of disk.pdf");
  expect(mocks.readDisk).toHaveBeenCalledWith(disk);
  expect(mocks.load).not.toHaveBeenCalled();
});
it("closes a rendered document after switching selections during a pending render", async () => {
  let finish!: (value: string) => void;
  mocks.render.mockImplementationOnce(
    () =>
      new Promise<string>((resolve) => {
        finish = resolve;
      }),
  );
  const view = show(entry);
  await waitFor(() => expect(mocks.render).toHaveBeenCalled());
  view.unmount();
  finish("data:image/png;base64,old");
  await waitFor(() => expect(mocks.close).toHaveBeenCalledWith(42));
});
