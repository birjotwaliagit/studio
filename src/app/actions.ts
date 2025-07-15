
'use server';

import type { OptimizationSettings, Job, JobResult } from '@/types';
import sharp from 'sharp';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { checkRateLimit } from '@/lib/rate-limiter';
import { headers } from 'next/headers';
import JSZip from 'jszip';
import { BATCH_LIMIT, RATE_LIMIT_MAX_REQUESTS } from '@/config/limits';


// In-memory store for jobs. In a real app, use a database or a service like Redis.
const jobStore = new Map<string, Job>();

// Zod schema for validation
const optimizationSettingsSchema = z.object({
  format: z.enum(['jpeg', 'png', 'webp', 'avif', 'tiff', 'bmp', 'gif']),
  quality: z.number().min(1).max(100).int(),
  width: z.number().min(1).int().nullable(),
  height: z.number().min(1).int().nullable(),
});

async function optimizeImage(
  fileBuffer: Buffer, 
  settings: OptimizationSettings
): Promise<Buffer> {
  const isAnimated = settings.format === 'gif';
  let image = sharp(fileBuffer, { animated: isAnimated });
  
  const metadata = await image.metadata();
  const originalWidth = metadata.width || 1;
  const originalHeight = metadata.height || 1;

  let targetWidth = originalWidth;
  let targetHeight = originalHeight;
  const aspectRatio = originalWidth / originalHeight;

  if (settings.width && !settings.height) {
    targetWidth = settings.width;
    targetHeight = Math.round(settings.width / aspectRatio);
  } else if (!settings.width && settings.height) {
    targetHeight = settings.height;
    targetWidth = Math.round(settings.height * aspectRatio);
  } else if (settings.width && settings.height) {
    targetWidth = settings.width;
    targetHeight = settings.height;
  }
  
  if (targetWidth !== originalWidth || targetHeight !== originalHeight) {
      image = image.resize(targetWidth, targetHeight, {
        fit: 'inside',
        withoutEnlargement: true,
      });
  }

  const { format, quality } = settings;
  
  switch (format) {
    case 'jpeg':
      image.jpeg({ quality });
      break;
    case 'webp':
      image.webp({ quality });
      break;
    case 'avif':
      image.avif({ quality });
      break;
    case 'tiff':
       image.tiff({ quality });
       break;
    case 'png':
      image.png();
      break;
    case 'gif':
      image.gif();
      break;
    case 'bmp':
       image.bmp();
       break;
    default:
      throw new Error(`Unsupported format: ${format}`);
  }
  
  return image.toBuffer();
}


export async function processImageForPreview(formData: FormData) {
  try {
    const file = formData.get('file') as File | null;
    const settingsString = formData.get('settings') as string | null;

    if (!file || !settingsString) {
      return { success: false, error: 'Missing file or settings.' };
    }
    
    const parsedSettings = optimizationSettingsSchema.safeParse(JSON.parse(settingsString));

    if (!parsedSettings.success) {
      const errorDetails = JSON.stringify(parsedSettings.error.flatten().fieldErrors);
      console.error(`Invalid preview settings: ${errorDetails}`);
      return { success: false, error: `Invalid settings: ${errorDetails}` };
    }
    const settings: OptimizationSettings = parsedSettings.data;

    const fileBuffer = Buffer.from(await file.arrayBuffer());

    const processedBuffer = await optimizeImage(fileBuffer, settings);
    
    return {
      success: true,
      data: {
        buffer: processedBuffer.toString('base64'),
        mimeType: `image/${settings.format}`,
        size: processedBuffer.byteLength,
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
): Promise<{ jobId?: string; error?: string }> {
  try {
    const ip = headers().get('x-forwarded-for') ?? '127.0.0.1';
    const limitCheck = checkRateLimit(ip);
    if (!limitCheck.success) {
      console.warn(`Rate limit exceeded for IP: ${ip}`);
      return { error: 'Too many requests. Please try again in a minute.' };
    }
    
    const files = formData.getAll('files') as File[];
    const settingsString = formData.get('settings') as string;

    if (files.length === 0 || !settingsString) {
        return { error: 'Missing files or settings.' };
    }
    if (files.length > BATCH_LIMIT) {
        return { error: `Batch limit exceeded. Please upload a maximum of ${BATCH_LIMIT} files.` };
    }

    const parsedSettings = optimizationSettingsSchema.safeParse(JSON.parse(settingsString));
    if (!parsedSettings.success) {
        const fieldErrors = JSON.stringify(parsedSettings.error.flatten().fieldErrors);
        console.error(`Invalid job settings: ${fieldErrors}`);
        return { error: `Invalid settings provided. ${fieldErrors}` };
    }
    const settings: OptimizationSettings = parsedSettings.data;

    const jobId = nanoid();
    console.log(`Creating job ${jobId} for ${files.length} files from IP: ${ip}`);

    jobStore.set(jobId, { status: 'processing', progress: 0, total: files.length });

    // Process asynchronously without awaiting
    (async () => {
        try {
            const startTime = Date.now();
            let result: JobResult;

            if (files.length === 1) {
                const file = files[0];
                jobStore.set(jobId, {
                    status: 'processing', progress: 0, total: 1,
                    info: `Optimizing ${file.name}...`
                });

                const fileBuffer = Buffer.from(await file.arrayBuffer());
                const processedBuffer = await optimizeImage(fileBuffer, settings);

                const originalName = file.name.substring(0, file.name.lastIndexOf('.'));
                const newName = `${originalName}.${settings.format}`;
                const dataUrl = `data:image/${settings.format};base64,${processedBuffer.toString('base64')}`;
                
                result = { type: 'file', data: dataUrl, filename: newName };

                jobStore.set(jobId, { status: 'processing', progress: 1, total: 1 });

            } else {
                const zip = new JSZip();
                for (let i = 0; i < files.length; i++) {
                    const file = files[i];
                    jobStore.set(jobId, {
                        status: 'processing', progress: i, total: files.length,
                        info: `Optimizing ${file.name}...`
                    });
                    
                    const fileBuffer = Buffer.from(await file.arrayBuffer());
                    const processedBuffer = await optimizeImage(fileBuffer, settings);
            
                    const originalName = file.name.substring(0, file.name.lastIndexOf('.'));
                    const newName = `${originalName}.${settings.format}`;
                    zip.file(newName, processedBuffer);
                }
                
                jobStore.set(jobId, {
                    status: 'processing', progress: files.length, total: files.length,
                    info: `Compressing into zip...`
                });
                
                const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
                const zipDataUrl = `data:application/zip;base64,${zipBuffer.toString('base64')}`;
                result = { type: 'zip', data: zipDataUrl, filename: 'optimized-images.zip' };
            }

            jobStore.set(jobId, {
                status: 'completed',
                progress: files.length,
                total: files.length,
                result: result,
            });

            const duration = Date.now() - startTime;
            console.log(`Job ${jobId} completed successfully in ${duration}ms.`);

        } catch (error) {
            console.error(`Job ${jobId} failed during processing:`, error);
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

  } catch (error)
 {
    console.error('Error creating image processing job:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return { error: `Failed to create job: ${errorMessage}` };
  }
}

export async function getJobStatus(jobId: string): Promise<Job | null> {
  const job = jobStore.get(jobId);
  if (!job) return null;

  if (job.status === 'completed' || job.status === 'failed') {
    setTimeout(() => {
        jobStore.delete(jobId);
        console.log(`Cleaned up job ${jobId}.`);
    }, 60000); // Clean up after 1 minute
  }

  return job;
}

export async function getAppLimits() {
    return {
        batchLimit: BATCH_LIMIT,
        rateLimit: RATE_LIMIT_MAX_REQUESTS,
    };
}
