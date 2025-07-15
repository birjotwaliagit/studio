'use server';

/**
 * @fileOverview Analyzes an image and suggests optimal compression settings using AI.
 *
 * - suggestOptimizationSettings - A function that handles the image analysis and settings suggestion process.
 * - SuggestOptimizationSettingsInput - The input type for the suggestOptimizationSettings function.
 * - SuggestOptimizationSettingsOutput - The return type for the suggestOptimizationSettings function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const SuggestOptimizationSettingsInputSchema = z.object({
  photoDataUri: z
    .string()
    .describe(
      "A photo of the image to be optimized, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
    ),
});
export type SuggestOptimizationSettingsInput = z.infer<typeof SuggestOptimizationSettingsInputSchema>;

const SuggestOptimizationSettingsOutputSchema = z.object({
  format: z.enum(['jpeg', 'png', 'webp']).describe('The suggested image format.'),
  quality: z.number().min(0).max(100).describe('The suggested image quality (0-100).'),
  resize: z.number().min(0).max(100).optional().describe('The suggested resize percentage (0-100), optional.'),
});
export type SuggestOptimizationSettingsOutput = z.infer<typeof SuggestOptimizationSettingsOutputSchema>;

export async function suggestOptimizationSettings(input: SuggestOptimizationSettingsInput): Promise<SuggestOptimizationSettingsOutput> {
  return suggestOptimizationSettingsFlow(input);
}

const prompt = ai.definePrompt({
  name: 'suggestOptimizationSettingsPrompt',
  input: {schema: SuggestOptimizationSettingsInputSchema},
  output: {schema: SuggestOptimizationSettingsOutputSchema},
  prompt: `You are an expert image optimization specialist. You will analyze the provided image and suggest optimal compression settings to balance file size and image quality.

  Consider the image content and suggest:
  - A suitable image format (jpeg, png, webp).
  - An optimal quality setting (0-100).
  - Optionally, suggest a resize percentage (0-100) if appropriate.

  Provide the output in JSON format.

  Image: {{media url=photoDataUri}}`,
});

const suggestOptimizationSettingsFlow = ai.defineFlow(
  {
    name: 'suggestOptimizationSettingsFlow',
    inputSchema: SuggestOptimizationSettingsInputSchema,
    outputSchema: SuggestOptimizationSettingsOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
