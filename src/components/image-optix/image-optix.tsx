
"use client";

import React, { useState, useCallback, useEffect } from 'react';
import type { ImageFile, OptimizationSettings, Job } from '@/types';
import { ImageUploader } from './image-uploader';
import { FileList } from './file-list';
import { OptimizationControls } from './optimization-controls';
import { PreviewArea } from './preview-area';
import { Button } from '@/components/ui/button';
import { Download, ImageIcon, Loader2 } from 'lucide-react';
import { createProcessImagesJob, getJobStatus } from '@/app/actions';
import { useToast } from '@/hooks/use-toast';
import { Progress } from '@/components/ui/progress';

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
  const [job, setJob] = useState<Job | null>(null);
  const { toast } = useToast();

  const activeFile = activeIndex !== null ? files[activeIndex] : null;

  // Poll for job status
  useEffect(() => {
    if (job?.status !== 'processing') {
      setIsProcessing(false);
      return;
    };

    const intervalId = setInterval(async () => {
      if (job.jobId) {
        const currentJob = await getJobStatus(job.jobId);
        if (currentJob) {
          setJob(currentJob);

          if (currentJob.status === 'completed' && currentJob.result) {
            downloadFile(currentJob.result, `ImageOptix-${Date.now()}.zip`);
            toast({
              title: "Processing Complete",
              description: "Your files have been downloaded.",
            });
            setJob(null);
          } else if (currentJob.status === 'failed') {
            toast({
              variant: "destructive",
              title: "Processing Failed",
              description: currentJob.error || "An unknown error occurred.",
            });
            setJob(null);
          }
        }
      }
    }, 2000); // Poll every 2 seconds

    return () => clearInterval(intervalId);
  }, [job, toast]);

  const handleFilesAdded = useCallback((newFiles: ImageFile[]) => {
    const newFileIndex = files.length;
    setFiles(f => [...f, ...newFiles]);
    if (activeIndex === null && newFiles.length > 0) {
      setActiveIndex(newFileIndex);
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
          setActiveIndex(newFiles.length > 0 ? 0 : null);
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
    if (files.length === 0) return;

    setIsProcessing(true);
    setJob({ status: 'starting', progress: 0, total: files.length });

    try {
      const { jobId } = await createProcessImagesJob(files, settings);
      setJob({ jobId, status: 'processing', progress: 0, total: files.length });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to start job.";
      toast({
        variant: "destructive",
        title: "Job Creation Failed",
        description: errorMessage,
      });
      setIsProcessing(false);
      setJob(null);
    }
  };
  
  const getButtonContent = () => {
    if (!isProcessing || !job) {
      return (
        <>
          <Download className="mr-2 h-5 w-5" />
          Process & Download All ({files.length})
        </>
      );
    }
    
    switch (job.status) {
      case 'starting':
        return (
          <>
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Starting job...
          </>
        );
      case 'processing':
        return (
          <>
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Processing... ({job.progress}/{job.total})
          </>
        );
      default:
        return (
          <>
            <Download className="mr-2 h-5 w-5" />
            Process & Download All ({files.length})
          </>
        );
    }
  }

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
          {isProcessing && job?.status === 'processing' && (
            <div className="mb-2">
              <Progress value={(job.progress / job.total) * 100} className="w-full" />
            </div>
          )}
          <Button 
            size="lg" 
            className="w-full"
            onClick={handleBatchProcessAndDownload}
            disabled={files.length === 0 || isProcessing}
          >
            {getButtonContent()}
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
