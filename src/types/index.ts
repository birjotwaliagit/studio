export type OptimizationFormat = 'jpeg' | 'png' | 'webp';

export type OptimizationSettings = {
  format: OptimizationFormat;
  quality: number;
  width: number | null;
  height: number | null;
};

export interface ImageFile {
  id: string;
  file: File;
  name: string;
  size: number;
  dataUrl: string;
  originalWidth: number;
  originalHeight: number;
  optimizedDataUrl?: string;
  optimizedSize?: number;
}
