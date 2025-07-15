
"use client";

import React, { useState, useEffect } from 'react';
import type { ImageFile, OptimizationSettings } from '@/types';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import Image from 'next/image';
import { formatBytes } from '@/lib/utils';
import { ChevronsRight, Image as ImageIcon, Loader2 } from 'lucide-react';

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


export function PreviewArea({ activeFile, settings }: PreviewAreaProps) {
  const [optimizedUrl, setOptimizedUrl] = useState<string | null>(null);
  const [optimizedSize, setOptimizedSize] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!activeFile) {
      setOptimizedUrl(null);
      setOptimizedSize(null);
      return;
    }

    setIsLoading(true);
    let isCancelled = false;
    
    const image = new window.Image();
    image.src = activeFile.dataUrl;
    image.onload = () => {
      if (isCancelled) return;
      
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        setIsLoading(false);
        return;
      }
      
      let targetWidth = activeFile.originalWidth;
      let targetHeight = activeFile.originalHeight;
      const aspectRatio = activeFile.originalWidth / activeFile.originalHeight;

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

      canvas.toBlob(blob => {
        if (isCancelled || !blob) {
            setIsLoading(false);
            return;
        }
        if (optimizedUrl) URL.revokeObjectURL(optimizedUrl);
        setOptimizedUrl(URL.createObjectURL(blob));
        setOptimizedSize(blob.size);
        setIsLoading(false);
      }, `image/${settings.format}`, quality);
    };

    return () => {
      isCancelled = true;
      if (optimizedUrl) URL.revokeObjectURL(optimizedUrl);
    };
  }, [activeFile, settings]);

  if (!activeFile) {
    return (
      <Card className="w-full h-full flex flex-col items-center justify-center bg-muted/10 border-2 border-dashed">
        <ImageIcon className="w-24 h-24 text-muted-foreground/30" />
        <h2 className="mt-4 text-2xl font-semibold text-muted-foreground/80">Select an image to preview</h2>
        <p className="text-muted-foreground">Or upload new images to begin optimizing.</p>
      </Card>
    );
  }

  const sizeChange = activeFile && optimizedSize !== null ? (optimizedSize - activeFile.size) / activeFile.size * 100 : 0;
  
  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-6">
        <div className="flex w-full items-start justify-center gap-6">
            <PreviewPanel title="Original" imageSrc={activeFile.dataUrl} width={activeFile.originalWidth} height={activeFile.originalHeight} size={activeFile.size} />
            
            <div className="flex flex-col items-center justify-center h-full pt-24 mt-12">
                <ChevronsRight className="w-12 h-12 text-muted-foreground" />
                {optimizedSize !== null && (
                    <div className={`mt-2 text-lg font-bold ${sizeChange > 0 ? 'text-destructive' : 'text-green-500'}`}>
                        {sizeChange.toFixed(1)}%
                    </div>
                )}
            </div>

            <PreviewPanel title="Optimized" imageSrc={optimizedUrl ?? undefined} width={optimizedUrl ? undefined : 0} height={0} size={optimizedSize ?? undefined} isLoading={isLoading} />
        </div>
    </div>
  );
}
