
"use client";

import React, { useState, useCallback } from 'react';
import type { ImageFile, OptimizationSettings } from '@/types';
import { ImageUploader } from './image-uploader';
import { FileList } from './file-list';
import { OptimizationControls } from './optimization-controls';
import { PreviewArea } from './preview-area';
import { Button } from '@/components/ui/button';
import { Download, ImageIcon } from 'lucide-react';
import { processImageWithSharp } from '@/app/actions';

function downloadFile(url: string, filename: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
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
    
    const downloadPromises = files.map(async (file) => {
      const result = await processImageWithSharp({
        dataUrl: file.dataUrl,
        settings,
        originalWidth: file.originalWidth,
        originalHeight: file.originalHeight
      });

      if (result.success && result.data?.optimizedDataUrl) {
        const originalName = file.name.substring(0, file.name.lastIndexOf('.'));
        const newName = `${originalName}.${settings.format}`;
        downloadFile(result.data.optimizedDataUrl, newName);
      }
      // You might want to add error handling here, e.g. show a toast
    });
    
    await Promise.all(downloadPromises);

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
