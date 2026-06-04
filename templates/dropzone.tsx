// @ts-nocheck — Template file. The "@/..." imports resolve only inside YOUR app
// (your shadcn components + tsconfig paths), not in this repo, so type-checking
// is disabled here. Once copied into your project, remove this line.
/**
 * Dropzone — COPY THIS FILE INTO YOUR APP (e.g. src/components/ui/dropzone.tsx).
 *
 * A drag-and-drop file input built on react-dropzone, in the kibo-ui style (a
 * single <Button>-as-dropzone with composable Empty/Content slots). The file
 * field in shadcn-adapter.tsx imports it from "@/components/ui/dropzone".
 *
 * Prereqs:
 *   npm i react-dropzone
 *   (Button + cn come from your existing shadcn setup.)
 *
 * It only *selects* files into form state; uploading is your job at submit time.
 */
import { createContext, useContext, type ReactNode } from "react";
import {
  useDropzone,
  type DropzoneOptions,
  type FileRejection,
} from "react-dropzone";
import { UploadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type DropzoneContextType = {
  src?: File[];
  accept?: DropzoneOptions["accept"];
  maxSize?: DropzoneOptions["maxSize"];
  minSize?: DropzoneOptions["minSize"];
  maxFiles?: DropzoneOptions["maxFiles"];
};

const DropzoneContext = createContext<DropzoneContextType | undefined>(undefined);

function useDropzoneContext() {
  const ctx = useContext(DropzoneContext);
  if (!ctx) throw new Error("Dropzone slots must be used inside <Dropzone>.");
  return ctx;
}

export type DropzoneProps = Omit<DropzoneOptions, "onDrop"> & {
  /** currently selected files (drives Empty vs. Content rendering) */
  src?: File[];
  className?: string;
  children?: ReactNode;
  onDrop?: (
    acceptedFiles: File[],
    fileRejections: FileRejection[],
    event: unknown,
  ) => void;
};

export function Dropzone({
  accept,
  maxFiles = 1,
  maxSize,
  minSize,
  onDrop,
  onError,
  disabled,
  src,
  className,
  children,
  ...props
}: DropzoneProps) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept,
    maxFiles,
    maxSize,
    minSize,
    onDrop: onDrop as DropzoneOptions["onDrop"],
    onError,
    disabled,
    ...props,
  });

  return (
    <DropzoneContext.Provider
      key={src?.map((f) => `${f.name}:${f.size}`).join("|")}
      value={{ src, accept, maxSize, minSize, maxFiles }}
    >
      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        className={cn(
          "relative h-auto w-full flex-col overflow-hidden p-8",
          isDragActive && "ring-1 ring-ring outline-none",
          className,
        )}
        {...getRootProps()}
      >
        <input {...getInputProps()} disabled={disabled} />
        {children}
      </Button>
    </DropzoneContext.Provider>
  );
}

export type DropzoneEmptyStateProps = { children?: ReactNode; className?: string };

export function DropzoneEmptyState({ children, className }: DropzoneEmptyStateProps) {
  const { src, accept, maxSize, maxFiles } = useDropzoneContext();
  if (src) return null;
  if (children) return <>{children}</>;

  const extras: string[] = [];
  if (accept) {
    const exts = Object.values(accept).flat();
    if (exts.length) extras.push(exts.join(", "));
  }
  if (maxSize) extras.push(`up to ${(maxSize / (1024 * 1024)).toFixed(0)} MB`);

  return (
    <div className={cn("flex flex-col items-center justify-center", className)}>
      <div className="bg-muted text-muted-foreground flex size-8 items-center justify-center rounded-md">
        <UploadIcon size={16} />
      </div>
      <p className="my-2 w-full truncate text-sm font-medium">
        Upload {maxFiles === 1 ? "a file" : "files"}
      </p>
      <p className="text-muted-foreground w-full truncate text-xs">
        Drag and drop or click to upload
      </p>
      {extras.length > 0 && (
        <p className="text-muted-foreground text-xs">{extras.join(" · ")}</p>
      )}
    </div>
  );
}

export type DropzoneContentProps = { children?: ReactNode; className?: string };

const MAX_LABEL_ITEMS = 3;

export function DropzoneContent({ children, className }: DropzoneContentProps) {
  const { src, maxFiles } = useDropzoneContext();
  if (!src) return null;
  if (children) return <>{children}</>;

  const names = src.map((f) => f.name);
  const label =
    names.length > MAX_LABEL_ITEMS
      ? `${names.slice(0, MAX_LABEL_ITEMS).join(", ")} and ${names.length - MAX_LABEL_ITEMS} more`
      : names.join(", ");

  return (
    <div className={cn("flex flex-col items-center justify-center", className)}>
      <div className="bg-muted text-muted-foreground flex size-8 items-center justify-center rounded-md">
        <UploadIcon size={16} />
      </div>
      <p className="my-2 w-full truncate text-sm font-medium">{label}</p>
      <p className="text-muted-foreground w-full truncate text-xs">
        Drag and drop or click to {maxFiles === 1 ? "replace" : "add more"}
      </p>
    </div>
  );
}
