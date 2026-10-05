"use client";

import { useRef, useState } from "react";
import { api } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Upload } from "lucide-react";
import { toast } from "sonner";

interface FloorPlanUploadProps {
  floorId: string;
  floorName: string;
  onUploadSuccess?: () => void;
}

export function FloorPlanUpload({ floorId, floorName, onUploadSuccess }: FloorPlanUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadMutation = api.floor.uploadFloorPlan.useMutation({
    onSuccess: () => {
      toast.success("Floor plan uploaded successfully");
      onUploadSuccess?.();
      setIsUploading(false);
    },
    onError: (err) => {
      toast.error(`Upload failed: ${err.message}`);
      setIsUploading(false);
    },
  });

  const handleFileUpload = (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const file = files.item(0);
    if (!file) return;

    const validTypes = ["image/png", "image/jpeg"];

    if (!validTypes.includes(file.type)) {
      toast.error("Please upload a PNG or JPG image file");
      return;
    }

    setIsUploading(true);

    const processFile = async () => {
      const arrayBuffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      uploadMutation.mutate({
        floorId,
        fileName: file.name,
        fileData: Array.from(uint8Array),
        mimeType: file.type,
      });
    };

    void processFile();
  };

  return (
    <section className="flex flex-col gap-3 rounded-2xl border p-4" aria-labelledby="floor-plan-upload-heading">
      <div>
        <h3 id="floor-plan-upload-heading" className="type-card-title">
          Upload image
        </h3>
        <p className="type-helper">New draft plan for {floorName}</p>
      </div>
      <div
        className={`flex flex-1 flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center transition-colors duration-150 ${
          isDragging ? "border-cyan bg-cyan-soft" : "border-border-strong bg-surface-muted hover:border-navy/30"
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          handleFileUpload(e.dataTransfer.files);
        }}
      >
        <span className="bg-surface text-navy mb-3 flex size-11 items-center justify-center rounded-2xl border shadow-xs">
          <Upload className="size-5" strokeWidth={1.75} />
        </span>
        <p className="text-foreground mb-1 text-sm font-medium">Drag and drop your floor plan here</p>
        <p className="type-helper mb-4">PNG or JPG images only</p>
        <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
          {isUploading ? "Uploading…" : "Choose file"}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".png,.jpg,.jpeg"
          onChange={(e) => handleFileUpload(e.target.files)}
          hidden
          disabled={isUploading}
        />
      </div>
    </section>
  );
}
