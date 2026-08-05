export type RedactionMode = 'blur' | 'pixelate' | 'cover';
export type RedactionStatus = 'pending' | 'approved' | 'ignored';

export interface NormalizedRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Redaction {
  id: string;
  category: 'identity' | 'credentials' | 'notification' | 'network' | 'custom';
  label: string;
  detectedText?: string;
  confidence?: number;
  startTime: number;
  endTime: number;
  region: NormalizedRegion;
  mode: RedactionMode;
  strength: number;
  padding: number;
  status: RedactionStatus;
}

export interface SourceVideo {
  path: string;
  fileName: string;
  fileSize: number;
  duration: number;
  width: number;
  height: number;
  hash: string;
}

export interface DemoShieldProject {
  version: number;
  name: string;
  source: SourceVideo;
  redactions: Redaction[];
  currentTime: number;
  createdAt: string;
  updatedAt: string;
}
