import { useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, FileBox } from "lucide-react";
import { cn } from "@/lib/utils";

interface FileUploadProps {
  onFileSelect: (file: File) => void;
  className?: string;
}

export default function FileUpload({ onFileSelect, className }: FileUploadProps) {
  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length > 0) {
        onFileSelect(acceptedFiles[0]);
      }
    },
    [onFileSelect]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "model/obj": [".obj"],
      "application/zip": [".zip"],
      "application/x-zip-compressed": [".zip"],
    },
    maxFiles: 1,
  });

  return (
    <div
      {...getRootProps()}
      className={cn(
        "border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center cursor-pointer transition-colors h-64",
        isDragActive
          ? "border-primary bg-primary/5"
          : "border-neutral-200 hover:border-primary/50 hover:bg-neutral-50",
        className
      )}
    >
      <input {...getInputProps()} />
      <div className="bg-neutral-100 p-4 rounded-full mb-4">
        {isDragActive ? (
          <Upload className="w-8 h-8 text-primary" />
        ) : (
          <FileBox className="w-8 h-8 text-neutral-500" />
        )}
      </div>
      <h3 className="text-lg font-semibold mb-1">
        {isDragActive ? "Drop the scan here" : "Upload Room Scan"}
      </h3>
      <p className="text-sm text-neutral-500 text-center max-w-xs">
        Drag & drop your .obj file here, or click to select.
        <br />
        <span className="text-xs opacity-70 mt-2 block">
          Works best with Scaniverse or Polycam exports.
        </span>
      </p>
    </div>
  );
}
