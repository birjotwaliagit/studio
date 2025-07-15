
"use client";

import React from 'react';
import type { ImageFile } from '@/types';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { formatBytes } from '@/lib/utils';

interface FileListProps {
  files: ImageFile[];
  onSelectFile: (index: number) => void;
  onRemoveFile: (id: string) => void;
  onClearAll: () => void;
  activeIndex: number | null;
  disabled: boolean;
}

export function FileList({ files, onSelectFile, onRemoveFile, onClearAll, activeIndex, disabled }: FileListProps) {
  if (files.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground bg-muted/20 rounded-lg">
        Upload images to get started
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex justify-between items-center mb-2 px-1">
        <h2 className="text-sm font-semibold text-muted-foreground">Batch ({files.length})</h2>
        <Button variant="ghost" size="sm" onClick={onClearAll} disabled={disabled}>Clear All</Button>
      </div>
      <ScrollArea className="flex-1 pr-3">
        <div className="space-y-2">
          {files.map((file, index) => (
            <button
              key={file.id}
              onClick={() => onSelectFile(index)}
              disabled={disabled}
              className={cn(
                "flex items-center w-full p-2 rounded-md text-left transition-colors",
                activeIndex === index
                  ? "bg-primary/10 ring-2 ring-primary"
                  : "hover:bg-muted",
                disabled && "cursor-not-allowed"
              )}
            >
              <Image
                src={file.previewUrl}
                alt={file.name}
                width={40}
                height={40}
                className="rounded-md object-cover aspect-square"
                unoptimized
              />
              <div className="ml-3 flex-1 overflow-hidden">
                <p className="text-sm font-medium truncate">{file.name}</p>
                <p className="text-xs text-muted-foreground">{formatBytes(file.size)}</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="w-8 h-8 ml-2 shrink-0"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveFile(file.id);
                }}
                disabled={disabled}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </button>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
