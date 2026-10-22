import { useMemo, useRef, useState } from "react";
import { useFilesPage } from "@app/contexts/FilesPageContext";
import { useAllFiles, useFileActions } from "@app/contexts/FileContext";
import { useFileHandler } from "@app/hooks/useFileHandler";
import {
  useNavigationActions,
  useNavigationGuard,
} from "@app/contexts/NavigationContext";
import { useToolWorkflow } from "@app/contexts/ToolWorkflowContext";
import { useViewer } from "@app/contexts/ViewerContext";
import { materializeServerStubs } from "@app/services/fileSyncService";
import { openFilesFromDisk } from "@app/services/openFilesFromDisk";
import { selectDesktopNode } from "@app/hooks/useDesktopSelection";
import { Button } from "@app/ui/Button";
import type { FileId } from "@app/types/file";
import type { StirlingFileStub } from "@app/types/fileContext";
import type { ToolId } from "@app/types/toolId";
import { getToolDisabledReason } from "@app/components/tools/fullscreen/shared";
import { useAppConfig } from "@app/contexts/AppConfigContext";
import "@app/components/home/LegacyHome.css";

type HomeMetadata = Record<string, { starred?: boolean; openedAt?: number }>;
const metadataKey = "stirling.legacyHomeMetadata";

function readMetadata(): HomeMetadata {
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem(metadataKey) ?? "{}",
    );
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value).filter(
        ([, entry]) =>
          entry &&
          typeof entry === "object" &&
          (entry.openedAt === undefined ||
            (typeof entry.openedAt === "number" &&
              Number.isFinite(entry.openedAt))) &&
          (entry.starred === undefined || typeof entry.starred === "boolean"),
      ),
    );
  } catch {
    return {};
  }
}

function formatSize(bytes: number) {
  return new Intl.NumberFormat(undefined, {
    style: "unit",
    unit: "byte",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(bytes);
}

/** Browses real library entries; opening delegates to the existing guarded file workflow. */
export default function LegacyHome({
  onLeave,
  onTools,
}: {
  onLeave: () => void;
  onTools: () => void;
}) {
  const { allFiles, loading, refresh, selectedFileIds, setSelectedFileIds } =
    useFilesPage();
  const { fileIds, fileStubs } = useAllFiles();
  const { actions: fileActions } = useFileActions();
  const { actions: navigation } = useNavigationActions();
  const { requestNavigation } = useNavigationGuard();
  const { handleToolSelect, toolRegistry, toolAvailability } =
    useToolWorkflow();
  const { setActiveFileId } = useViewer();
  const { addFiles } = useFileHandler();
  const { config } = useAppConfig();
  const [tab, setTab] = useState<"home" | "recent" | "starred">("home");
  const [metadata, setMetadata] = useState(readMetadata);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const files = useMemo(() => {
    const entries = new Map(
      [...allFiles, ...fileStubs].map((file) => [file.id, file]),
    );
    return [...entries.values()]
      .filter((file) => tab !== "starred" || metadata[file.id]?.starred)
      .sort(
        (a, b) =>
          (metadata[b.id]?.openedAt ?? b.createdAt ?? 0) -
          (metadata[a.id]?.openedAt ?? a.createdAt ?? 0),
      );
  }, [allFiles, fileStubs, tab, metadata]);
  const selected = files.find((file) => selectedFileIds.has(file.id));

  const updateMetadata = (id: FileId, update: HomeMetadata[string]) => {
    setMetadata((previous) => {
      const next = { ...previous, [id]: { ...previous[id], ...update } };
      try {
        localStorage.setItem(metadataKey, JSON.stringify(next));
      } catch {
        /* Browser storage can be disabled; session selection still works. */
      }
      return next;
    });
  };

  const select = (file: StirlingFileStub) => {
    setSelectedFileIds(new Set([file.id]));
    selectDesktopNode({ kind: "file", id: file.id });
    setDetailsOpen(true);
  };

  const ingest = async (incoming: File[]) => {
    if (!incoming.length || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      await addFiles(incoming, {
        selectFiles: false,
        skipWorkspaceDispatch: true,
      });
      await refresh();
      setTab("recent");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not import files.",
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const open = (file: StirlingFileStub, tool?: ToolId) => {
    if (busyRef.current) return;
    requestNavigation(() => {
      const proceed = async () => {
        busyRef.current = true;
        setBusy(true);
        setError("");
        try {
          if (!fileIds.includes(file.id)) {
            const materialized = await materializeServerStubs([file], {
              addFiles: fileActions.addFilesWithOptions,
              updateStub: fileActions.updateStirlingFileStub,
            });
            if (materialized.length !== 1)
              throw new Error("The document could not be opened.");
            await fileActions.addStirlingFileStubs(materialized, {
              selectFiles: false,
            });
          }
          fileActions.setSelectedFiles([file.id]);
          setActiveFileId(file.id);
          updateMetadata(file.id, { openedAt: Date.now() });
          if (tool) handleToolSelect(tool);
          else navigation.setWorkbench("viewer");
          onLeave();
        } catch (cause) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not open the document.",
          );
        } finally {
          busyRef.current = false;
          setBusy(false);
        }
      };
      void proceed();
    });
  };

  const shortcuts: { id: ToolId; label: string }[] = [
    { id: "pdfTextEditor", label: "Edit" },
    { id: "compress", label: "Compress" },
    { id: "merge", label: "Merge" },
    { id: "convert", label: "Convert" },
  ];

  return (
    <div className="legacy-home" aria-busy={busy}>
      <nav className="legacy-home-nav" aria-label="Home navigation">
        <h1>Stirling PDF</h1>
        <button
          type="button"
          aria-current={tab === "home" ? "page" : undefined}
          onClick={() => setTab("home")}
        >
          Home
        </button>
        <button
          type="button"
          aria-current={tab === "recent" ? "page" : undefined}
          onClick={() => setTab("recent")}
        >
          Recent Files
        </button>
        <button
          type="button"
          aria-current={tab === "starred" ? "page" : undefined}
          onClick={() => setTab("starred")}
        >
          Starred
        </button>
        <button type="button" onClick={onTools}>
          Tools
        </button>
      </nav>
      <main className="legacy-home-main">
        <header className="legacy-home-header">
          <h2>{tab === "starred" ? "Starred" : "Recent Files"}</h2>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => {
              void openFilesFromDisk({
                multiple: true,
                onFallbackOpen: () => input.current?.click(),
              })
                .then(ingest)
                .catch((cause) => setError(String(cause)));
            }}
          >
            Add files
          </Button>
          <input
            ref={input}
            type="file"
            multiple
            hidden
            aria-label="Add files"
            onChange={(event) => {
              void ingest(Array.from(event.target.files ?? []));
              event.target.value = "";
            }}
          />
        </header>
        {error && (
          <p role="alert" className="legacy-home-error">
            {error}
          </p>
        )}
        <div
          className="legacy-home-drop"
          data-dragging={dragging}
          onDragOver={(event) => {
            if (event.dataTransfer.types.includes("Files")) {
              event.preventDefault();
              event.stopPropagation();
              setDragging(true);
            }
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setDragging(false);
            void ingest(Array.from(event.dataTransfer.files));
          }}
        >
          {busy
            ? "Importing or opening documents…"
            : "Drag and drop files here to add them to Recent Files."}
        </div>
        {loading && <p role="status">Loading documents…</p>}
        <table className="legacy-home-table" aria-label="Recent Files">
          <thead>
            <tr>
              <th scope="col">File Name</th>
              <th scope="col">Last Opened Timestamp</th>
              <th scope="col">File Size</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {files.map((file) => (
              <tr
                key={file.id}
                tabIndex={0}
                aria-selected={selected?.id === file.id}
                className={
                  selected?.id === file.id ? "selected-file-node" : undefined
                }
                onClick={() => select(file)}
                onDoubleClick={() => open(file)}
                onKeyDown={(event) => {
                  if (event.target !== event.currentTarget) return;
                  if (event.key === "Enter") {
                    event.preventDefault();
                    open(file);
                  }
                  if (event.key === " ") {
                    event.preventDefault();
                    select(file);
                  }
                }}
              >
                <td>
                  {metadata[file.id]?.starred ? "★ " : ""}
                  {file.name}
                </td>
                <td>
                  {metadata[file.id]?.openedAt
                    ? new Date(metadata[file.id].openedAt!).toLocaleString()
                    : "Not opened yet"}
                </td>
                <td>{formatSize(file.size)}</td>
                <td>
                  <button
                    type="button"
                    aria-label={`Actions for ${file.name}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      select(file);
                    }}
                    onDoubleClick={(event) => event.stopPropagation()}
                  >
                    •••
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && !files.length && (
          <p>
            {tab === "starred"
              ? "No starred documents."
              : "No recent documents."}
          </p>
        )}
      </main>
      {selected && detailsOpen && (
        <aside className="legacy-home-details" aria-label="Document details">
          <Button
            variant="quiet"
            onClick={() => setDetailsOpen(false)}
            aria-label="Close document details"
          >
            Close
          </Button>
          <h3>{selected.name}</h3>
          <dl>
            <dt>Document Name</dt>
            <dd>{selected.name}</dd>
            <dt>Size</dt>
            <dd>{formatSize(selected.size)}</dd>
            <dt>Type</dt>
            <dd>{selected.type || "Unknown"}</dd>
          </dl>
          <Button
            variant="secondary"
            onClick={() =>
              updateMetadata(selected.id, {
                starred: !metadata[selected.id]?.starred,
              })
            }
          >
            {metadata[selected.id]?.starred ? "Remove star" : "Star document"}
          </Button>
          <div className="legacy-home-actions">
            <button
              type="button"
              disabled={busy}
              onClick={() => open(selected)}
            >
              Open document
            </button>
            {shortcuts.map((shortcut) => {
              const tool = toolRegistry[shortcut.id];
              const disabled =
                !tool ||
                getToolDisabledReason(
                  shortcut.id,
                  tool,
                  toolAvailability,
                  config?.premiumEnabled,
                ) !== null;
              return (
                <button
                  type="button"
                  key={shortcut.id}
                  disabled={busy || disabled}
                  onClick={() => open(selected, shortcut.id)}
                >
                  {shortcut.label}
                </button>
              );
            })}
          </div>
        </aside>
      )}
    </div>
  );
}
