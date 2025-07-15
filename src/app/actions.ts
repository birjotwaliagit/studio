
'use server';

import { suggestOptimizationSettings } from '@/ai/flows/suggest-optimization-settings';
import type { SuggestOptimizationSettingsInput } from '@/ai/flows/suggest-optimization-settings';
import type { OptimizationSettings } from '@/types';
import sharp from 'sharp';

export async function getAiSuggestions(
  input: SuggestOptimizationSettingsInput
) {
  try {
    const result = await suggestOptimizationSettings(input);
    return { success: true, data: result };
  } catch (error) {
    console.error('AI suggestion failed:', error);
    return { success: false, error: 'Failed to get AI suggestions. Please try again.' };
  }
}

export async function processImageWithSharp({
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
        processedBuffer = await image.png().toBuffer(); // quality is not for png in sharp
        break;
      case 'webp':
        processedBuffer = await image.webp({ quality }).toBuffer();
        break;
      default:
        throw new Error('Unsupported format');
    }
    
    const processedDataUrl = `data:image/${format};base64,${processedBuffer.toString('base64')}`;
    
    return {
      success: true,
      data: {
        optimizedDataUrl: processedDataUrl,
        optimizedSize: processedBuffer.byteLength,
      },
    };

  } catch (error) {
    console.error('Image processing failed:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return { success: false, error: `Failed to process image: ${errorMessage}` };
  }
}
