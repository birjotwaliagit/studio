
"use client";

import React, { useState, useCallback, useEffect } from 'react';
import type { ImageFile, OptimizationSettings, Job } from '@/types';
import { ImageUploader } from './image-uploader';
import { FileList } from './file-list';
import { OptimizationControls } from './optimization-controls';
import { PreviewArea } from './preview-area';
import { Button } from '@/components/ui/button';
import { Download, ImageIcon, Loader2, Link as LinkIcon, CheckCircle2, AlertTriangle, Copy } from 'lucide-react';
import { createProcessImagesJob, getJobStatus } from '@/app/actions';
import { useToast } from '@/hooks/use-toast';
import { Progress } from '@/components/ui/progress';
import { Input } from '../ui/input';
import { ScrollArea } from '../ui/scroll-area';

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
    if (!job?.jobId || (job.status !== 'processing' && job.status !== 'uploading')) {
        if (job?.status !== 'starting') {
            setIsProcessing(false);
        }
        return;
    }

    const intervalId = setInterval(async () => {
      if (job.jobId) {
        const currentJob = await getJobStatus(job.jobId);
        if (currentJob) {
          setJob(currentJob);

          if (currentJob.status === 'completed' && currentJob.result) {
            toast({
              title: "Upload Complete",
              description: "Your public links are ready.",
            });
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
    }, 1000); // Poll every second

    return () => clearInterval(intervalId);
  }, [job, toast]);

  const handleFilesAdded = useCallback((newFiles: ImageFile[]) => {
    const newFileIndex = files.length;
    setFiles(f => {
      const allFiles = [...f, ...newFiles];
      // Clean up old object URLs
      f.forEach(file => URL.revokeObjectURL(file.previewUrl));
      return allFiles;
    });
    if (activeIndex === null && newFiles.length > 0) {
      setActiveIndex(newFileIndex);
    }
  }, [activeIndex, files.length]);

  const handleRemoveFile = useCallback((idToRemove: string) => {
    setFiles(currentFiles => {
      const fileToRemove = currentFiles.find(f => f.id === idToRemove);
      if (fileToRemove) {
        URL.revokeObjectURL(fileToRemove.previewUrl);
      }
      const newFiles = currentFiles.filter(f => f.id !== idToRemove);
      if (newFiles.length === 0) {
        setActiveIndex(null);
        setJob(null);
        setIsProcessing(false);
      } else if (activeIndex !== null) {
        const currentSelectedFile = currentFiles[activeIndex];
        if (currentSelectedFile.id === idToRemove) {
          setActiveIndex(newFiles.length > 0 ? 0 : null);
        } else {
          const newIndex = newFiles.findIndex(f => f.id === currentSelectedFile.id);
          setActiveIndex(newIndex > -1 ? newIndex : 0);
        }
      }
      return newFiles;
    });
  }, [activeIndex]);

  const handleSelectFile = useCallback((index: number) => {
    setActiveIndex(index);
  }, []);
  
  const handleClearAll = useCallback(() => {
    files.forEach(file => URL.revokeObjectURL(file.previewUrl));
    setFiles([]);
    setActiveIndex(null);
    setJob(null);
    setIsProcessing(false);
  }, [files]);

  // Clean up object URLs on unmount
  useEffect(() => {
    return () => {
      files.forEach(file => URL.revokeObjectURL(file.previewUrl));
    };
  }, [files]);

  const handleBatchProcess = async () => {
    if (files.length === 0) return;

    setIsProcessing(true);
    setJob({ status: 'starting', progress: 0, total: files.length });

    try {
      const formData = new FormData();
      files.forEach(f => formData.append('files', f.file));
      formData.append('settings', JSON.stringify(settings));

      const { jobId, error } = await createProcessImagesJob(formData);
      
      if (error) {
        toast({
            variant: "destructive",
            title: "Job Creation Failed",
            description: error,
        });
        setIsProcessing(false);
        setJob(null);
        return;
      }
      
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
          <LinkIcon className="mr-2 h-5 w-5" />
          Process & Get Links ({files.length})
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
      case 'uploading':
        return (
          <>
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            {job.info || `${job.status.charAt(0).toUpperCase() + job.status.slice(1)}...`} ({job.progress}/{job.total})
          </>
        );
      default:
        return (
          <>
            <LinkIcon className="mr-2 h-5 w-5" />
            Process & Get Links ({files.length})
          </>
        );
    }
  }
  
  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied to clipboard!" });
  }

  const renderJobResult = () => {
      if (!job) return null;

      if (job.status === 'completed' && job.result) {
          return (
              <div className="mt-4 p-4 border rounded-lg bg-green-500/10 text-green-700 dark:text-green-300">
                  <div className="flex items-center mb-2">
                      <CheckCircle2 className="mr-2 h-5 w-5" />
                      <h3 className="font-semibold">Upload Complete!</h3>
                  </div>
                  <p className="text-sm mb-3">Your public links are ready. Anyone with the link can view the file.</p>
                  <ScrollArea className="h-40">
                    <div className="space-y-2 pr-4">
                      {job.result.map((url, index) => (
                        <div key={index} className="flex items-center gap-2">
                            <Input readOnly value={url} className="bg-background text-xs h-8"/>
                            <Button size="icon" className="h-8 w-8" onClick={() => handleCopy(url)}>
                              <Copy className="h-4 w-4" />
                            </Button>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
              </div>
          )
      }

      if (job.status === 'failed') {
          return (
            <div className="mt-4 p-4 border rounded-lg bg-destructive/10 text-destructive dark:text-red-400">
                <div className="flex items-center mb-2">
                    <AlertTriangle className="mr-2 h-5 w-5" />
                    <h3 className="font-semibold">Job Failed</h3>
                </div>
                <p className="text-sm">{job.error || "An unknown error occurred."}</p>
            </div>
          )
      }

      return null;
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
          {isProcessing && (job?.status === 'processing' || job?.status === 'uploading') && job.total > 0 && (
            <div className="mb-2">
              <Progress value={(job.progress / job.total) * 100} className="w-full" />
            </div>
          )}
          <Button 
            size="lg" 
            className="w-full"
            onClick={handleBatchProcess}
            disabled={files.length === 0 || isProcessing}
          >
            {getButtonContent()}
          </Button>
          {renderJobResult()}
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
