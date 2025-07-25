
export type OptimizationFormat = 'jpeg' | 'png' | 'webp' | 'avif' | 'tiff' | 'bmp' | 'gif';

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
  previewUrl: string;
  originalWidth: number;
  originalHeight: number;
  optimizedDataUrl?: string;
  optimizedSize?: number;
}

export type JobStatus = 'starting' | 'processing' | 'uploading' | 'completed' | 'failed';

export type JobResult = {
  type: 'file' | 'zip';
  data: string;
  filename: string;
};

export type Job = {
  jobId?: string;
  status: JobStatus;
  progress: number;
  total: number;
  result?: JobResult;
  error?: string;
  info?: string;
}
