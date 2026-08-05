import type { SourceVideo } from './types/models';

export {};

declare global {
  interface Window {
    demoShield?: {
      openVideo: () => Promise<{ source: SourceVideo; previewUrl: string } | null>;
      pingWorker: () => Promise<{ worker: string; version: number }>;
      saveProject: (project: unknown) => Promise<string | null>;
    };
  }
}
