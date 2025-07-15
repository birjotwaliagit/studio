
'use server';

import type { OptimizationSettings, ImageFile, Job } from '@/types';
import sharp from 'sharp';
import JSZip from 'jszip';
import { nanoid } from 'nanoid';

// In-memory store for jobs. In a real app, use a database or a service like Redis.
const jobStore = new Map<string, Job>();

async function optimizeImage(
  fileBuffer: Buffer, 
  settings: OptimizationSettings
) {
  let image = sharp(fileBuffer);
  
  const metadata = await image.metadata();
  const originalWidth = metadata.width || 1;
  const originalHeight = metadata.height || 1;

  let targetWidth = originalWidth;
  let targetHeight = originalHeight;
  const aspectRatio = originalWidth / originalHeight;

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
  
  if (targetWidth !== originalWidth || targetHeight !== originalHeight) {
      image = image.resize(targetWidth, targetHeight);
  }

  const { format, quality } = settings;
  
  let processedBuffer: Buffer;
  switch(format) {
    case 'jpeg':
      processedBuffer = await image.jpeg({ quality }).toBuffer();
      break;
    case 'png':
      processedBuffer = await image.png().toBuffer();
      break;
    case 'webp':
      processedBuffer = await image.webp({ quality }).toBuffer();
      break;
    default:
      throw new Error('Unsupported format');
  }
  
  return processedBuffer;
}


export async function processImageForPreview(formData: FormData) {
  try {
    const file = formData.get('file') as File | null;
    const settingsString = formData.get('settings') as string | null;

    if (!file || !settingsString) {
      throw new Error('Missing file or settings');
    }

    const settings: OptimizationSettings = JSON.parse(settingsString);
    const fileBuffer = Buffer.from(await file.arrayBuffer());

    const processedBuffer = await optimizeImage(fileBuffer, settings);
    const processedDataUrl = `data:image/${settings.format};base64,${processedBuffer.toString('base64')}`;
    
    return {
      success: true,
      data: {
        optimizedDataUrl: processedDataUrl,
        optimizedSize: processedBuffer.byteLength,
      },
    };

  } catch (error) {
    console.error('Image processing for preview failed:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return { success: false, error: `Failed to process image: ${errorMessage}` };
  }
}

export async function createProcessImagesJob(
  formData: FormData,
): Promise<{ jobId: string }> {
  const jobId = nanoid();
  const files = formData.getAll('files') as File[];
  const settingsString = formData.get('settings') as string;
  const settings: OptimizationSettings = JSON.parse(settingsString);

  jobStore.set(jobId, {
    status: 'processing',
    progress: 0,
    total: files.length,
  });

  // Process asynchronously without awaiting
  (async () => {
    try {
      const zip = new JSZip();

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const fileBuffer = Buffer.from(await file.arrayBuffer());
        
        const processedBuffer = await optimizeImage(
          fileBuffer,
          settings,
        );

        const originalName = file.name.substring(0, file.name.lastIndexOf('.'));
        const newName = `${originalName}.${settings.format}`;
        
        zip.file(newName, processedBuffer);

        // Update progress
        jobStore.set(jobId, {
          status: 'processing',
          progress: i + 1,
          total: files.length,
        });
      }

      const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
      const zipBase64 = zipBuffer.toString('base64');
      
      jobStore.set(jobId, {
        status: 'completed',
        progress: files.length,
        total: files.length,
        result: `data:application/zip;base64,${zipBase64}`,
      });

    } catch (error) {
      console.error(`Job ${jobId} failed:`, error);
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
      jobStore.set(jobId, {
        status: 'failed',
        progress: jobStore.get(jobId)?.progress || 0,
        total: files.length,
        error: `Failed to process images: ${errorMessage}`,
      });
    }
  })();

  return { jobId };
}

export async function getJobStatus(jobId: string): Promise<Job | null> {
  const job = jobStore.get(jobId);
  if (!job) return null;

  // Clean up completed or failed jobs after some time to prevent memory leaks
  if (job.status === 'completed' || job.status === 'failed') {
    setTimeout(() => jobStore.delete(jobId), 60000); // Clean up after 1 minute
  }

  return job;
}
