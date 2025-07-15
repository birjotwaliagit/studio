
'use server';

import { suggestOptimizationSettings } from '@/ai/flows/suggest-optimization-settings';
import type { SuggestOptimizationSettingsInput } from '@/ai/flows/suggest-optimization-settings';

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
