import type { SourceVideo } from './types/models';

export {};

declare global {
  interface Window {
    demoShield?: {
      openVideo: () => Promise<{ source: SourceVideo; previewUrl: string } | null>;
      pingWorker: () => Promise<{ worker: string; version: number }>;
      startScan: (options?: { sampleIntervalSeconds?: number; heartbeatSeconds?: number; changeThreshold?: number; ocrMaxWidth?: number; ocrBatchSize?: number }) => Promise<{ canceled: boolean; findings: ScanFinding[]; stats?: ScanStats }>;
      cancelScan: () => Promise<boolean>;
      onScanProgress: (listener: (progress: ScanProgress) => void) => () => void;
      saveProject: (project: unknown) => Promise<string | null>;
    };
  }

  interface ScanProgress {
    phase: 'ocr_loading' | 'sampling' | 'finalizing' | 'complete';
    progress: number;
    sampledFrames: number;
    ocrFrames?: number;
    skippedFrames?: number;
    totalSamples: number;
    timestamp?: number;
    changeScore?: number;
    ocrSeconds?: number;
  }

  interface ScanStats {
    duration: number;
    fps: number;
    frameCount: number;
    sampledFrames: number;
    ocrFrames: number;
    skippedFrames: number;
    sampleIntervalSeconds: number;
    heartbeatSeconds: number;
    changeThreshold: number;
    ocrMaxWidth: number;
    ocrBatchSize: number;
    ocrSeconds: number;
    scanSeconds: number;
    recognizedTexts: number;
    matchedFindings: number;
  }

  interface ScanFinding {
    id: string;
    category: string;
    label: string;
    detectedText: string;
    confidence: number;
    startTime: number;
    endTime: number;
    region: { x: number; y: number; width: number; height: number };
    status: 'pending';
  }
}
