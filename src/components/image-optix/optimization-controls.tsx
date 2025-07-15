
"use client";

import React, { useTransition } from 'react';
import type { OptimizationSettings, OptimizationFormat, ImageFile } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sparkles, Loader2 } from 'lucide-react';
import { getAiSuggestions } from '@/app/actions';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface OptimizationControlsProps {
  settings: OptimizationSettings;
  setSettings: React.Dispatch<React.SetStateAction<OptimizationSettings>>;
  activeFile: ImageFile | null;
  disabled: boolean;
}

export function OptimizationControls({ settings, setSettings, activeFile, disabled }: OptimizationControlsProps) {
  const [isAiLoading, startAiTransition] = useTransition();
  const { toast } = useToast();

  const handleAiSuggest = () => {
    if (!activeFile) return;
    startAiTransition(async () => {
      const result = await getAiSuggestions({ photoDataUri: activeFile.dataUrl });
      if (result.success && result.data) {
        setSettings(s => ({
          ...s,
          format: result.data.format,
          quality: result.data.quality,
        }));
        toast({
          title: "AI Suggestions Applied",
          description: `Format set to ${result.data.format.toUpperCase()} with ${result.data.quality}% quality.`,
        });
      } else {
        toast({
          variant: 'destructive',
          title: 'AI Suggestion Failed',
          description: result.error,
        });
      }
    });
  };
  
  const handleDimensionChange = (dimension: 'width' | 'height', value: string) => {
    const numValue = value ? parseInt(value, 10) : null;
    if (numValue !== null && (isNaN(numValue) || numValue < 0)) return;

    setSettings(s => ({ ...s, [dimension]: numValue }));
  }

  return (
    <Card className={cn(disabled && "opacity-50 pointer-events-none")}>
      <CardHeader className="flex-row items-center justify-between pb-4">
        <CardTitle className="text-lg">Settings</CardTitle>
        <Button size="sm" variant="outline" onClick={handleAiSuggest} disabled={!activeFile || isAiLoading || disabled}>
          {isAiLoading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="mr-2 h-4 w-4 text-accent" />
          )}
          AI Suggest
        </Button>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="format">Format</Label>
          <Select
            value={settings.format}
            onValueChange={(value: OptimizationFormat) => setSettings(s => ({ ...s, format: value }))}
            disabled={disabled}
          >
            <SelectTrigger id="format">
              <SelectValue placeholder="Select format" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="jpeg">JPEG</SelectItem>
              <SelectItem value="png">PNG</SelectItem>
              <SelectItem value="webp">WEBP</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <Label htmlFor="quality">Quality</Label>
            <span className="text-sm text-muted-foreground">{settings.quality}%</span>
          </div>
          <Slider
            id="quality"
            min={1}
            max={100}
            step={1}
            value={[settings.quality]}
            onValueChange={([value]) => setSettings(s => ({ ...s, quality: value }))}
            disabled={settings.format === 'png' || disabled}
          />
        </div>
        
        <div className="space-y-2">
            <Label>Resize (Pixels)</Label>
            <div className="flex items-center gap-2">
                 <Input 
                    type="number" 
                    placeholder="Width" 
                    value={settings.width ?? ''} 
                    onChange={(e) => handleDimensionChange('width', e.target.value)}
                    min="1"
                    disabled={disabled}
                 />
                 <span className="text-muted-foreground">x</span>
                 <Input 
                    type="number" 
                    placeholder="Height"
                    value={settings.height ?? ''}
                    onChange={(e) => handleDimensionChange('height', e.target.value)}
                    min="1"
                    disabled={disabled}
                />
            </div>
        </div>

      </CardContent>
    </Card>
  );
}
