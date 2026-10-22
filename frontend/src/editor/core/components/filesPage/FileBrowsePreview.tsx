import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader } from "@mantine/core";
import { Icon } from "@app/ui/Icon";
import { ActionIcon } from "@app/ui/ActionIcon";
import { PrivateContent } from "@app/components/shared/PrivateContent";
import type { FilesPageEntry } from "@app/components/filesPage/FileGrid";
import { fileStorage } from "@app/services/fileStorage";
import { readDiskFile } from "@app/services/localFolderContents";
import { usePdfAccess } from "@app/hooks/usePdfAccess";
import {
  openRawDocumentSafe,
  closeRawDocument,
  getPdfiumModule,
} from "@app/services/pdfiumService";
import {
  renderPdfiumPageDataUrl,
  readPdfiumPageMetadata,
} from "@app/utils/pdfiumPageRender";
import { getDocumentBytes } from "@app/services/documentBytesCache";
import "@app/components/filesPage/FileBrowsePreview.css";

/** Reads selected bytes without importing the document into the workspace. */
export function FileBrowsePreview({
  entry,
  suppliedFile,
}: {
  entry?: FilesPageEntry;
  suppliedFile?: File;
}) {
  const { t } = useTranslation();
  const access = usePdfAccess(entry?.file?.id);
  const identity = entry?.file?.id ?? entry?.disk?.path ?? entry?.folder?.id;
  const [page, setPage] = useState({ identity, index: 0 });
  const pageIndex = page.identity === identity ? page.index : 0;
  const [result, setResult] = useState<{
    identity?: string;
    index: number;
    url?: string;
    text?: string;
    pages?: number;
    loading?: boolean;
  }>({ index: 0 });
  const stub = entry?.file;
  const disk = entry?.disk;
  const name = stub?.name ?? disk?.name ?? entry?.folder?.name;
  const locked = Boolean(stub?.processedFile?.isEncrypted && !access);
  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | undefined;
    if (!stub && !disk) return;
    if (locked) return;
    setResult({ identity, index: pageIndex, loading: true });
    void (async () => {
      try {
        const file =
          suppliedFile ??
          (disk
            ? await readDiskFile(disk)
            : await fileStorage.getStirlingFile(stub!.id));
        if (!file || cancelled) return;
        if (
          file.type === "application/pdf" ||
          file.name.toLowerCase().endsWith(".pdf")
        ) {
          const doc = await openRawDocumentSafe(
            await getDocumentBytes(file),
            access?.password,
          );
          try {
            if (cancelled) return;
            const pages = (await getPdfiumModule()).FPDF_GetPageCount(doc);
            const index = Math.min(pageIndex, Math.max(0, pages - 1));
            const dimensions = await readPdfiumPageMetadata(doc, index);
            const scale = dimensions
              ? Math.min(
                  2,
                  1600 / Math.max(dimensions.width, dimensions.height),
                )
              : 1.5;
            const url = await renderPdfiumPageDataUrl(doc, index, scale, {
              applyRotation: true,
            });
            if (!cancelled)
              setResult({
                identity,
                index: pageIndex,
                url: url ?? undefined,
                pages,
              });
          } finally {
            await closeRawDocument(doc);
          }
        } else if (file.type.startsWith("image/")) {
          objectUrl = URL.createObjectURL(file);
          if (!cancelled)
            setResult({ identity, index: pageIndex, url: objectUrl });
        } else if (
          /\.(txt|md|csv|json|log)$/i.test(file.name) ||
          file.type.startsWith("text/")
        ) {
          const text = await file.slice(0, 256 * 1024).text();
          if (!cancelled) setResult({ identity, index: pageIndex, text });
        }
      } catch {
        // Unavailable or protected bytes retain the library's existing thumbnail.
      } finally {
        if (!cancelled)
          setResult((current) => ({ ...current, loading: false }));
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [identity, stub, disk, pageIndex, access, locked, suppliedFile]);
  const current =
    result.identity === identity && result.index === pageIndex
      ? result
      : undefined;
  const url = locked ? undefined : (current?.url ?? stub?.thumbnailUrl);
  return (
    <section
      className="files-page-browse-preview"
      aria-label={t("filesPage.viewMode.preview", "Preview view")}
    >
      <div className="files-page-browse-preview-header">
        <span title={name}>
          {name ?? t("filesPage.preview.choose", "Select a file to preview")}
        </span>
        {Boolean(current?.pages && current.pages > 1) && (
          <div className="files-page-browse-preview-pages">
            <ActionIcon
              variant="tertiary"
              size="sm"
                aria-label={t("filesPage.preview.previousPage", "Previous page")}
              disabled={pageIndex === 0}
              onClick={() => setPage({ identity, index: pageIndex - 1 })}
            >
              <Icon name="chevron-left" size={16} />
            </ActionIcon>
            <span>
              {pageIndex + 1} / {current?.pages}
            </span>
            <ActionIcon
              variant="tertiary"
              size="sm"
                aria-label={t("filesPage.preview.nextPage", "Next page")}
              disabled={pageIndex + 1 >= (current?.pages ?? 1)}
              onClick={() => setPage({ identity, index: pageIndex + 1 })}
            >
              <Icon name="chevron-right" size={16} />
            </ActionIcon>
          </div>
        )}
      </div>
      <div
        className="files-page-browse-preview-body"
        aria-busy={current?.loading ?? false}
      >
        <PrivateContent>
          {current?.text !== undefined ? (
            <pre>{current.text}</pre>
          ) : url ? (
            <img
              src={url}
              alt={t("filePreview.previewOf", "Preview of {{name}}", { name })}
            />
          ) : (
            <div className="files-page-browse-preview-placeholder">
              {current?.loading ? (
                <Loader size="sm" />
              ) : (
                <Icon
                  name={
                    locked
                      ? "lock"
                      : entry?.kind === "folder"
                        ? "folder"
                        : "file"
                  }
                  size={32}
                />
              )}
              <span>
                {locked
                  ? t("filePreview.locked", "Locked")
                  : !entry
                    ? t("filesPage.preview.choose", "Select a file to preview")
                    : entry.kind === "folder"
                      ? t(
                          "filesPage.preview.folder",
                          "Open a folder to browse its files",
                        )
                      : !current?.loading
                        ? t(
                            "filesPage.preview.unavailable",
                            "Preview unavailable for this file",
                          )
                        : t("filePreview.loadingThumbnail", "Loading preview…")}
              </span>
            </div>
          )}
        </PrivateContent>
      </div>
    </section>
  );
}
