
'use server';

import type { OptimizationSettings, ImageFile } from '@/types';
import sharp from 'sharp';
import JSZip from 'jszip';

async function optimizeImage(
  dataUrl: string, 
  settings: OptimizationSettings, 
  originalWidth: number, 
  originalHeight: number
) {
  const buffer = Buffer.from(dataUrl.split(',')[1], 'base64');
  
  let image = sharp(buffer);

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


export async function processImageForPreview({
  dataUrl,
  settings,
  originalWidth,
  originalHeight,
}: {
  dataUrl: string;
  settings: OptimizationSettings;
  originalWidth: number;
  originalHeight: number;
}) {
  try {
    const processedBuffer = await optimizeImage(dataUrl, settings, originalWidth, originalHeight);
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

export async function processImagesForZip(
  files: ImageFile[],
  settings: OptimizationSettings
) {
  try {
    const zip = new JSZip();

    for (const file of files) {
      const processedBuffer = await optimizeImage(
        file.dataUrl,
        settings,
        file.originalWidth,
        file.originalHeight
      );

      const originalName = file.name.substring(0, file.name.lastIndexOf('.'));
      const newName = `${originalName}.${settings.format}`;
      
      zip.file(newName, processedBuffer);
    }

    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
    const zipBase64 = zipBuffer.toString('base64');
    
    return {
      success: true,
      data: {
        zipData: zipBase64,
      },
    };

  } catch (error) {
    console.error('Image processing for zip failed:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return { success: false, error: `Failed to process images: ${errorMessage}` };
  }
}
