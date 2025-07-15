
'use server';

import type { OptimizationSettings, Job } from '@/types';
import sharp from 'sharp';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { checkRateLimit } from '@/lib/rate-limiter';
import { headers } from 'next/headers';
import JSZip from 'jszip';


// In-memory store for jobs. In a real app, use a database or a service like Redis.
const jobStore = new Map<string, Job>();

const BATCH_LIMIT = 50;

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
  // For animated GIFs, we need to tell sharp to handle all frames.
  const isAnimated = settings.format === 'gif';
  let image = sharp(fileBuffer, { animated: isAnimated });
  
  const metadata = await image.metadata();
  const originalWidth = metadata.width || 1;
  const originalHeight = metadata.height || 1;

  let targetWidth = originalWidth;
  let targetHeight = originalHeight;
  const aspectRatio = originalWidth / originalHeight;

  // Respect aspect ratio if only one dimension is provided
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
        fit: 'inside', // Prevents upscaling by default
        withoutEnlargement: true,
      });
  }

  const { format, quality } = settings;
  
  // Chain the format conversion. Apply quality only where applicable.
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
      image.png(); // No quality setting for lossless PNG
      break;
    case 'gif':
      image.gif();
      break;
    case 'bmp':
       image.bmp();
       break;
    default:
      // This should not be reached due to Zod validation
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
    
    // Return the base64 encoded buffer and mime type for client-side blob creation
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

async function processAndZip(jobId: string, files: File[], settings: OptimizationSettings): Promise<string> {
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
    return `data:application/zip;base64,${zipBuffer.toString('base64')}`;
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
            
            const zipDataUrl = await processAndZip(jobId, files, settings);
            const result: { type: 'zip'; data: string } = { type: 'zip', data: zipDataUrl };
          
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

  // Clean up completed or failed jobs after some time to prevent memory leaks
  if (job.status === 'completed' || job.status === 'failed') {
    setTimeout(() => {
        jobStore.delete(jobId);
        console.log(`Cleaned up job ${jobId}.`);
    }, 60000); // Clean up after 1 minute
  }

  return job;
}
