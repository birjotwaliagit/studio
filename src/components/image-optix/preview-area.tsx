
"use client";

import React, { useState, useEffect, useRef } from 'react';
import type { ImageFile, OptimizationSettings } from '@/types';
import { Card } from '@/components/ui/card';
import Image from 'next/image';
import { formatBytes } from '@/lib/utils';
import { ChevronsRight, Image as ImageIcon, Loader2 } from 'lucide-react';
import { processImageForPreview } from '@/app/actions';
import { useToast } from '@/hooks/use-toast';

interface PreviewAreaProps {
  activeFile: ImageFile | null;
  settings: OptimizationSettings;
}

function PreviewPanel({ title, imageSrc, width, height, size, isLoading }: { title: string, imageSrc?: string, width?: number, height?: number, size?: number, isLoading?: boolean }) {
  return (
    <div className="flex flex-col flex-1 w-full min-w-0">
      <h3 className="text-lg font-semibold text-center mb-2">{title}</h3>
      <Card className="flex-1 w-full flex items-center justify-center p-4 bg-muted/20">
        {isLoading && <Loader2 className="w-16 h-16 animate-spin text-primary" />}
        {!isLoading && imageSrc && (
          <Image
            src={imageSrc}
            alt={`${title} preview`}
            width={400}
            height={400}
            className="object-contain max-w-full max-h-full h-auto w-auto"
            style={{ maxHeight: 'calc(100vh - 200px)'}}
            unoptimized // Necessary for base64-encoded and blob images in next/image
          />
        )}
        {!isLoading && !imageSrc && (
          <ImageIcon className="w-24 h-24 text-muted-foreground/50" />
        )}
      </Card>
      <div className="text-center mt-2 text-sm text-muted-foreground h-10">
        {width && height && (
          <p>{width} x {height}px</p>
        )}
        {size !== undefined && (
          <p className="font-medium">{formatBytes(size)}</p>
        )}
      </div>
    </div>
  );
}

// Helper to convert base64 to a Blob
const b64toBlob = (b64Data: string, contentType = '', sliceSize = 512) => {
  const byteCharacters = atob(b64Data);
  const byteArrays = [];

  for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
    const slice = byteCharacters.slice(offset, offset + sliceSize);
    const byteNumbers = new Array(slice.length);
    for (let i = 0; i < slice.length; i++) {
      byteNumbers[i] = slice.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    byteArrays.push(byteArray);
  }

  return new Blob(byteArrays, { type: contentType });
};


export function PreviewArea({ activeFile, settings }: PreviewAreaProps) {
  const [optimizedData, setOptimizedData] = useState<{ url: string; size: number } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const optimizedUrlRef = useRef<string | null>(null);

  useEffect(() => {
    // Clean up blob URL on unmount
    return () => {
      if (optimizedUrlRef.current) {
        URL.revokeObjectURL(optimizedUrlRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!activeFile) {
      setOptimizedData(null);
      return;
    }

    setIsLoading(true);
    let isCancelled = false;

    const process = async () => {
      try {
        const formData = new FormData();
        formData.append('file', activeFile.file);
        formData.append('settings', JSON.stringify(settings));

        const result = await processImageForPreview(formData);

        if (isCancelled) return;

        if (result.success && result.data) {
           // Revoke previous blob URL if it exists
          if (optimizedUrlRef.current) {
            URL.revokeObjectURL(optimizedUrlRef.current);
          }

          const blob = b64toBlob(result.data.buffer, result.data.mimeType);
          const url = URL.createObjectURL(blob);
          optimizedUrlRef.current = url;
          setOptimizedData({
            url: url,
            size: result.data.size,
          });
        } else {
          setOptimizedData(null);
          toast({
            variant: 'destructive',
            title: 'Preview Failed',
            description: result.error,
          });
        }
      } catch (error) {
        if (isCancelled) return;
        setOptimizedData(null);
        toast({
            variant: 'destructive',
            title: 'An Error Occurred',
            description: 'Could not generate preview.',
        });
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    const timeoutId = setTimeout(process, 300); // Debounce processing

    return () => {
      isCancelled = true;
      clearTimeout(timeoutId);
    };
  }, [activeFile, settings, toast]);

  if (!activeFile) {
    return (
      <Card className="w-full h-full flex flex-col items-center justify-center bg-muted/10 border-2 border-dashed">
        <ImageIcon className="w-24 h-24 text-muted-foreground/30" />
        <h2 className="mt-4 text-2xl font-semibold text-muted-foreground/80">Select an image to preview</h2>
        <p className="text-muted-foreground">Or upload new images to begin optimizing.</p>
      </Card>
    );
  }

  const sizeChange = optimizedData ? (optimizedData.size - activeFile.size) / activeFile.size * 100 : 0;
  
  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-6">
        <div className="flex w-full items-start justify-center gap-6">
            <PreviewPanel 
              title="Original" 
              imageSrc={activeFile.previewUrl} 
              width={activeFile.originalWidth} 
              height={activeFile.originalHeight} 
              size={activeFile.size} 
            />
            
            <div className="flex flex-col items-center justify-center h-full pt-24 mt-12">
                <ChevronsRight className="w-12 h-12 text-muted-foreground" />
                {optimizedData && !isLoading && (
                    <div className={`mt-2 text-lg font-bold ${sizeChange > 0 ? 'text-destructive' : 'text-green-500'}`}>
                        {sizeChange > 0 ? '+' : ''}{sizeChange.toFixed(1)}%
                    </div>
                )}
            </div>

            <PreviewPanel 
              title="Optimized" 
              imageSrc={optimizedData?.url} 
              size={optimizedData?.size} 
              isLoading={isLoading} 
            />
        </div>
    </div>
  );
}
