
"use client";

import React, { useState, useCallback } from 'react';
import type { ImageFile, OptimizationSettings, OptimizationFormat } from '@/types';
import { ImageUploader } from './image-uploader';
import { FileList } from './file-list';
import { OptimizationControls } from './optimization-controls';
import { PreviewArea } from './preview-area';
import { Button } from '@/components/ui/button';
import { Download, ImageIcon } from 'lucide-react';

async function processImage(file: ImageFile, settings: OptimizationSettings): Promise<ImageFile> {
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    image.src = file.dataUrl;
    image.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('Failed to get canvas context'));

      let targetWidth = file.originalWidth;
      let targetHeight = file.originalHeight;
      const aspectRatio = file.originalWidth / file.originalHeight;

      if (settings.width && settings.height) {
        targetWidth = settings.width;
        targetHeight = settings.height;
      } else if (settings.width) {
        targetWidth = settings.width;
        targetHeight = Math.round(settings.width / aspectRatio);
      } else if (settings.height) {
        targetHeight = settings.height;
        targetWidth = Math.round(settings.height * aspectRatio);
      }
      
      canvas.width = targetWidth;
      canvas.height = targetHeight;

      ctx.drawImage(image, 0, 0, targetWidth, targetHeight);
      
      const quality = settings.format === 'png' ? undefined : settings.quality / 100;

      canvas.toBlob(
        (blob) => {
          if (!blob) return reject(new Error('Failed to create blob'));
          const optimizedDataUrl = URL.createObjectURL(blob);
          resolve({
            ...file,
            optimizedDataUrl,
            optimizedSize: blob.size,
          });
        },
        `image/${settings.format}`,
        quality
      );
    };
    image.onerror = reject;
  });
}

function downloadFile(url: string, filename: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function ImageOptix() {
  const [files, setFiles] = useState<ImageFile[]>([]);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [settings, setSettings] = useState<OptimizationSettings>({
    format: 'webp',
    quality: 80,
    width: null,
    height: null,
  });
  const [isProcessing, setIsProcessing] = useState(false);

  const activeFile = activeIndex !== null ? files[activeIndex] : null;

  const handleFilesAdded = useCallback((newFiles: ImageFile[]) => {
    setFiles(f => [...f, ...newFiles]);
    if (activeIndex === null && newFiles.length > 0) {
      setActiveIndex(files.length);
    }
  }, [activeIndex, files.length]);

  const handleRemoveFile = useCallback((idToRemove: string) => {
    setFiles(currentFiles => {
      const newFiles = currentFiles.filter(f => f.id !== idToRemove);
      if (newFiles.length === 0) {
        setActiveIndex(null);
      } else if (activeIndex !== null) {
        const currentSelectedFile = currentFiles[activeIndex];
        if (currentSelectedFile.id === idToRemove) {
          setActiveIndex(0);
        } else {
          const newIndex = newFiles.findIndex(f => f.id === currentSelectedFile.id);
          setActiveIndex(newIndex);
        }
      }
      return newFiles;
    });
  }, [activeIndex]);

  const handleSelectFile = useCallback((index: number) => {
    setActiveIndex(index);
  }, []);
  
  const handleClearAll = useCallback(() => {
    setFiles([]);
    setActiveIndex(null);
  }, []);

  const handleBatchProcessAndDownload = async () => {
    setIsProcessing(true);
    const processedFiles = await Promise.all(
      files.map(file => processImage(file, settings))
    );
    
    processedFiles.forEach(file => {
      if (file.optimizedDataUrl) {
        const originalName = file.name.substring(0, file.name.lastIndexOf('.'));
        const newName = `${originalName}.${settings.format}`;
        downloadFile(file.optimizedDataUrl, newName);
      }
    });

    setIsProcessing(false);
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-[380px_1fr] h-screen bg-background font-sans">
      <aside className="flex flex-col border-r bg-card/20 text-card-foreground p-4 gap-4 overflow-y-auto">
        <div className="flex items-center gap-3 px-2">
            <ImageIcon className="size-7 text-primary" />
            <h1 className="text-2xl font-bold">ImageOptix</h1>
        </div>
        <ImageUploader onFilesAdded={handleFilesAdded} disabled={isProcessing} />
        <FileList 
          files={files} 
          onSelectFile={handleSelectFile} 
          onRemoveFile={handleRemoveFile}
          onClearAll={handleClearAll}
          activeIndex={activeIndex}
          disabled={isProcessing}
        />
        <OptimizationControls
          settings={settings}
          setSettings={setSettings}
          activeFile={activeFile}
          disabled={files.length === 0 || isProcessing}
        />
        <div className="mt-auto pt-4">
          <Button 
            size="lg" 
            className="w-full"
            onClick={handleBatchProcessAndDownload}
            disabled={files.length === 0 || isProcessing}
          >
            <Download className="mr-2 h-5 w-5" />
            {isProcessing ? 'Processing...' : `Process & Download All (${files.length})`}
          </Button>
        </div>
      </aside>
      <main className="flex items-center justify-center p-8 bg-background overflow-hidden">
        <PreviewArea
          activeFile={activeFile}
          settings={settings}
        />
      </main>
    </div>
  );
}
