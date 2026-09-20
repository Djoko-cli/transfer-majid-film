import { useEffect, useRef, useState } from "react";
import { getFilesFromEvent } from "../components/upload/Dropzone";
import { FileUpload } from "../types/File.type";

/**
 * Turns the whole window into a drop target, and reports whether a file
 * drag is currently over it so a full-viewport overlay can say so.
 *
 * Someone dragging out of their file manager has no reason to aim
 * precisely at a dropzone rectangle, so the page accepts the drop wherever
 * it lands. This lived inline in UploadPage and therefore existed on the
 * direct-send page only: dragging a file anywhere onto a collection's own
 * page did nothing at all, and the browser would have navigated to it had
 * the `dragover` handler below not been there to say otherwise.
 *
 * `dragenter` and `dragleave` arrive in mismatched pairs as the pointer
 * crosses child elements inside the window — entering a child fires enter
 * on it *and* bubbles, leaving does the same — so a plain boolean flickers
 * off and on between them. Counting the nesting depth and only reacting at
 * zero is the standard fix.
 */
export function usePageFileDrop({
  enabled,
  onDrop,
}: {
  /** False while uploading, or before terms are accepted. */
  enabled: boolean;
  onDrop: (files: FileUpload[]) => void;
}) {
  const [isDraggingFileOverPage, setIsDraggingFileOverPage] = useState(false);
  const dragDepthRef = useRef(0);

  // Read through a ref inside the listeners so that a caller passing an
  // inline arrow (every caller) does not re-subscribe the whole set on
  // every render — and so a drop always runs the newest one, not the
  // closure captured when the listeners were attached.
  const onDropRef = useRef(onDrop);
  onDropRef.current = onDrop;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  useEffect(() => {
    const isFileDrag = (e: DragEvent) =>
      Array.from(e.dataTransfer?.types || []).includes("Files");

    const handleDragEnter = (e: DragEvent) => {
      if (!enabledRef.current || !isFileDrag(e)) return;
      e.preventDefault();
      dragDepthRef.current += 1;
      setIsDraggingFileOverPage(true);
    };

    const handleDragOver = (e: DragEvent) => {
      if (!isFileDrag(e)) return;
      // Required for the drop event to fire at all — browsers otherwise
      // treat an unhandled dragover as "not a valid drop target" and, for
      // a bare window listener, navigate to the dropped file, throwing
      // away whatever was on the page. Deliberately NOT gated on
      // `enabled`: the original version skipped this while an upload was
      // running, so a file dropped mid-upload replaced the page with
      // itself — and took the upload with it. Refusing a drop and
      // navigating away because of it are different things; this always
      // refuses, and `handleDrop` below decides whether to act.
      e.preventDefault();
    };

    const handleDragLeave = (e: DragEvent) => {
      if (!isFileDrag(e)) return;
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
      if (dragDepthRef.current === 0) setIsDraggingFileOverPage(false);
    };

    const handleDrop = async (e: DragEvent) => {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      dragDepthRef.current = 0;
      setIsDraggingFileOverPage(false);
      if (!enabledRef.current) return;

      const droppedFiles = (await getFilesFromEvent(e)) as FileUpload[];
      onDropRef.current(droppedFiles);
    };

    window.addEventListener("dragenter", handleDragEnter);
    window.addEventListener("dragover", handleDragOver);
    window.addEventListener("dragleave", handleDragLeave);
    window.addEventListener("drop", handleDrop);

    return () => {
      window.removeEventListener("dragenter", handleDragEnter);
      window.removeEventListener("dragover", handleDragOver);
      window.removeEventListener("dragleave", handleDragLeave);
      window.removeEventListener("drop", handleDrop);
    };
  }, []);

  return isDraggingFileOverPage;
}
