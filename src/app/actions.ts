
'use server';

import type { OptimizationSettings, Job } from '@/types';
import sharp from 'sharp';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { checkRateLimit } from '@/lib/rate-limiter';
import { headers } from 'next/headers';
import axios from 'axios';
import FormData from 'form-data';
import crypto from 'crypto';
import JSZip from 'jszip';


// In-memory store for jobs. In a real app, use a database or a service like Redis.
const jobStore = new Map<string, Job>();

const BATCH_LIMIT = 50;
const POSTIMAGES_ENDPOINT = "https://postimg.cc/json";
const POSTIMAGE_SIZE_LIMIT_BYTES = 30 * 1024 * 1024; // 30 MB

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

async function processAndUploadIndividually(jobId: string, files: File[], settings: OptimizationSettings) {
    const publicUrls: string[] = [];
    const token = await getPostimagesToken();
    const session = crypto.randomBytes(16).toString('hex');

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
        
        jobStore.set(jobId, {
            status: 'uploading', progress: i, total: files.length,
            info: `Uploading ${newName}...`
        });
        
        const form = new FormData();
        form.append('token', token);
        form.append('upload_session', session);
        form.append('file', processedBuffer, newName);
        form.append('numfiles', '1');

        const uploadResponse = await axios.post(POSTIMAGES_ENDPOINT, form, {
            headers: form.getHeaders(),
            maxContentLength: Infinity, maxBodyLength: Infinity,
        });

        if (uploadResponse.data.status !== 'OK') {
            throw new Error(`Postimages upload failed for ${newName}: ${uploadResponse.data.error || 'Unknown error'}`);
        }
        publicUrls.push(uploadResponse.data.url);
    }
    
    return publicUrls;
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
        status: 'uploading', progress: files.length, total: files.length,
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
            let useZipFallback = false;

            // First, check if any file will be oversized
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                jobStore.set(jobId, {
                    status: 'processing', progress: i, total: files.length,
                    info: `Analyzing ${file.name}...`
                });
                const fileBuffer = Buffer.from(await file.arrayBuffer());
                const processedBuffer = await optimizeImage(fileBuffer, settings);
                if (processedBuffer.byteLength > POSTIMAGE_SIZE_LIMIT_BYTES) {
                    useZipFallback = true;
                    console.log(`File ${file.name} exceeds 30MB after optimization. Using zip fallback for job ${jobId}.`);
                    break;
                }
            }
            
            let result: { type: 'urls' | 'zip'; data: string[] | string };

            if (useZipFallback) {
                const zipDataUrl = await processAndZip(jobId, files, settings);
                result = { type: 'zip', data: zipDataUrl };
            } else {
                const urls = await processAndUploadIndividually(jobId, files, settings);
                result = { type: 'urls', data: urls };
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
