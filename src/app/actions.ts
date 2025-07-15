
'use server';

import type { OptimizationSettings, ImageFile, Job } from '@/types';
import sharp from 'sharp';
import JSZip from 'jszip';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { checkRateLimit } from '@/lib/rate-limiter';
import { headers } from 'next/headers';
import axios from 'axios';
import FormData from 'form-data';
import crypto from 'crypto';


// In-memory store for jobs. In a real app, use a database or a service like Redis.
const jobStore = new Map<string, Job>();

const BATCH_LIMIT = 50;
const POSTIMAGES_ENDPOINT = "https://postimg.cc/json";

// Zod schema for validation
const optimizationSettingsSchema = z.object({
  format: z.enum(['jpeg', 'png', 'webp']),
  quality: z.number().min(1).max(100).int(),
  width: z.number().min(1).int().nullable(),
  height: z.number().min(1).int().nullable(),
});

// Scrape a valid token from postimages.org. In a real app, this should be cached.
async function getPostimagesToken(): Promise<string> {
    try {
        const response = await axios.get('https://postimages.org', {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const tokenMatch = response.data.match(/token['"]?\s*:\s*['"](\w{32})/);
        if (tokenMatch && tokenMatch[1]) {
            return tokenMatch[1];
        }
        throw new Error('Could not find postimages token');
    } catch (error) {
        console.error("Failed to fetch postimages token:", error);
        throw new Error('Could not fetch postimages token');
    }
}

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
      // This should not be reached due to Zod validation
      throw new Error('Unsupported format');
  }
  
  return processedBuffer;
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


    jobStore.set(jobId, {
        status: 'processing',
        progress: 0,
        total: files.length,
    });

    // Process asynchronously without awaiting
    (async () => {
        try {
          const startTime = Date.now();
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
          
          // Switch to uploading status
          jobStore.set(jobId, {
            status: 'uploading',
            progress: files.length,
            total: files.length,
          });

          // Upload to Postimages
          console.log(`Job ${jobId}: Uploading to Postimages.org...`);
          const form = new FormData();
          const token = await getPostimagesToken();
          const session = crypto.randomBytes(16).toString('hex');
          
          form.append('token', token);
          form.append('upload_session', session);
          form.append('file', zipBuffer, `ImageOptix-batch-${jobId}.zip`);
          form.append('numfiles', '1');

          const uploadResponse = await axios.post(POSTIMAGES_ENDPOINT, form, {
            headers: form.getHeaders(),
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
          });

          if (uploadResponse.data.status !== 'OK') {
              throw new Error(`Postimages upload failed: ${uploadResponse.data.error || 'Unknown error'}`);
          }
          const publicUrl = uploadResponse.data.url;
          
          jobStore.set(jobId, {
              status: 'completed',
              progress: files.length,
              total: files.length,
              result: publicUrl,
          });
          const duration = Date.now() - startTime;
          console.log(`Job ${jobId} completed successfully in ${duration}ms. Public URL: ${publicUrl}`);

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

  } catch (error) {
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
