
"use client";

import React, { useState, useCallback } from 'react';
import type { ImageFile } from '@/types';
import { UploadCloud } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface ImageUploaderProps {
  onFilesAdded: (files: ImageFile[]) => void;
  disabled: boolean;
}

export function ImageUploader({ onFilesAdded, disabled }: ImageUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const { toast } = useToast();

  const processFile = (file: File): Promise<ImageFile> => {
    return new Promise((resolve, reject) => {
      const previewUrl = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        resolve({
          id: crypto.randomUUID(),
          file,
          name: file.name,
          size: file.size,
          previewUrl: previewUrl,
          originalWidth: img.width,
          originalHeight: img.height,
        });
        // Note: We don't revoke the object URL here. It will be managed by the parent component.
      };
      img.onerror = (err) => {
        URL.revokeObjectURL(previewUrl);
        reject(err);
      };
      img.src = previewUrl;
    });
  };

  const handleFiles = useCallback(async (selectedFiles: FileList | null) => {
    if (!selectedFiles || selectedFiles.length === 0) return;

    const imageFiles = Array.from(selectedFiles).filter(file => file.type.startsWith('image/'));

    if (imageFiles.length !== selectedFiles.length) {
      toast({
        variant: "destructive",
        title: "Invalid File Type",
        description: "Only image files are accepted.",
      });
    }

    if (imageFiles.length > 0) {
      try {
        const processedFiles = await Promise.all(imageFiles.map(processFile));
        onFilesAdded(processedFiles);
      } catch (error) {
        toast({
            variant: "destructive",
            title: "File Error",
            description: "Could not read one of the selected files.",
        });
      }
    }
  }, [onFilesAdded, toast]);

  const onDragEnter = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };
  const onDragLeave = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };
  const onDragOver = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };
  const onDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (disabled) return;
    handleFiles(e.dataTransfer.files);
  };

  return (
    <label
      htmlFor="file-upload"
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={cn(
        "flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer transition-colors",
        isDragging ? "border-primary bg-primary/10" : "border-border hover:border-primary/50 hover:bg-muted/50",
        disabled && "cursor-not-allowed opacity-50"
      )}
    >
      <div className="flex flex-col items-center justify-center pt-5 pb-6 text-center">
        <UploadCloud className={cn("w-10 h-10 mb-3", isDragging ? "text-primary" : "text-muted-foreground")} />
        <p className="mb-1 text-sm text-muted-foreground">
          <span className="font-semibold text-primary">Click to upload</span> or drag and drop
        </p>
        <p className="text-xs text-muted-foreground">PNG, JPG, WEBP, etc.</p>
      </div>
      <input 
        id="file-upload" 
        type="file" 
        className="hidden" 
        multiple
        accept="image/*"
        onChange={(e) => handleFiles(e.target.files)} 
        disabled={disabled}
      />
    </label>
  );
}
