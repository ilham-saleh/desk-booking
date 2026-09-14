"use client";

import { useRef, useState } from "react";
import { api } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

    const validTypes = ["application/pdf", "image/png", "image/jpeg"];

    if (!validTypes.includes(file.type)) {
      toast.error("Please upload a PDF or image file (PNG/JPG)");
      return;
    }

    setIsUploading(true);

    const processFile = async () => {
      const buffer = await file.arrayBuffer();
      uploadMutation.mutate({
        floorId,
        fileName: file.name,
        fileBuffer: Buffer.from(buffer),
        mimeType: file.type,
      });
    };

    void processFile();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Floor Plan</CardTitle>
        <CardDescription>Upload PDF or image for {floorName}</CardDescription>
      </CardHeader>
      <CardContent>
        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
            isDragging
              ? "border-blue-500 bg-blue-50"
              : "border-gray-300 bg-gray-50 hover:border-gray-400"
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
          <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
          <p className="mb-2 text-sm font-medium text-gray-700">
            Drag and drop your floor plan here
          </p>
          <p className="text-xs text-gray-500 mb-4">or click to select a file</p>
          <Button
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
          >
            {isUploading ? "Uploading..." : "Select File"}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg"
            onChange={(e) => handleFileUpload(e.target.files)}
            hidden
            disabled={isUploading}
          />
          <p className="text-xs text-gray-500 mt-4">PDF, PNG or JPG</p>
        </div>
      </CardContent>
    </Card>
  );
}
