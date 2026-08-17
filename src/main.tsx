import { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { SourceVideo } from './types/models';
import './styles.css';

type Section = 'media' | 'scan' | 'review' | 'export';
type FindingStatus = 'exposed' | 'protected' | 'ignored';
type Finding = {
  id: string;
  category: string;
  label: string;
  value: string;
  startTime: number;
  endTime: number;
  confidence: number;
  status: FindingStatus;
  region: { x: number; y: number; width: number; height: number };
};

const formatTime = (seconds: number) => {
  if (!Number.isFinite(seconds)) return '00:00';
  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
  const remaining = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${minutes}:${remaining}`;
};

function App() {
  const [section, setSection] = useState<Section>('media');
  const [sourceVideo, setSourceVideo] = useState<SourceVideo | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [timelineExpanded, setTimelineExpanded] = useState(false);
  const [scanState, setScanState] = useState<'idle' | 'running' | 'complete' | 'canceled' | 'error'>('idle');
  const [scanProgress, setScanProgress] = useState<ScanProgress | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanStats, setScanStats] = useState<ScanStats | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const protectedCount = findings.filter((finding) => finding.status === 'protected').length;
  const exposedCount = findings.filter((finding) => finding.status === 'exposed').length;

  useEffect(() => window.demoShield?.onScanProgress((progress) => setScanProgress(progress)), []);

  const importVideo = async () => {
    if (!window.demoShield) {
      setImportError('Native import is available in the Electron desktop app.');
      return;
    }
    setImporting(true);
    setImportError(null);
    try {
      const result = await window.demoShield.openVideo();
      if (!result) return;
      setSourceVideo(result.source);
      setVideoUrl(result.previewUrl);
      setDuration(result.source.duration);
      setCurrentTime(0);
      setVideoError(null);
      setFindings([]);
      setSelectedId(null);
      setScanState('idle');
      setScanProgress(null);
      setScanError(null);
      setScanStats(null);
      setSection('media');
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Unable to import video');
    } finally {
      setImporting(false);
    }
  };

  const runScan = async () => {
    if (!sourceVideo || !window.demoShield || scanState === 'running') return;
    setSection('scan');
    setScanState('running');
    setScanProgress(null);
    setScanError(null);
    setScanStats(null);
    try {
      const result = await window.demoShield.startScan({
        sampleIntervalSeconds: 0.5,
        heartbeatSeconds: 2,
        changeThreshold: 0.035,
        ocrMaxWidth: 1280,
        ocrBatchSize: 4,
      });
      if (result.canceled) {
        setScanState('canceled');
        return;
      }
      setFindings(result.findings.map((finding) => ({
        id: finding.id,
        category: finding.category,
        label: finding.label,
        value: finding.detectedText,
        startTime: finding.startTime,
        endTime: Math.min(finding.endTime, sourceVideo.duration),
        confidence: finding.confidence,
        status: 'exposed',
        region: finding.region,
      })));
      setSelectedId(result.findings[0]?.id || null);
      setScanStats(result.stats || null);
      setScanState('complete');
      if (result.findings.length > 0) {
        const firstTime = result.findings[0].startTime;
        setCurrentTime(firstTime);
        if (videoRef.current) {
          videoRef.current.pause();
          videoRef.current.currentTime = firstTime;
        }
        setSection('review');
      }
    } catch (error) {
      setScanError(error instanceof Error ? error.message : 'Privacy scan failed');
      setScanState('error');
    }
  };

  const cancelScan = async () => {
    if (!window.demoShield || scanState !== 'running') return;
    await window.demoShield.cancelScan();
  };

  const togglePlayback = async () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) await video.play();
    else video.pause();
  };

  const seek = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextTime = Number(event.target.value);
    setCurrentTime(nextTime);
    if (videoRef.current) videoRef.current.currentTime = nextTime;
  };

  const selectFinding = (id: string) => {
    setSelectedId(id);
    const finding = findings.find((item) => item.id === id);
    if (!finding) return;
    setCurrentTime(finding.startTime);
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = finding.startTime;
    }
  };

  return (
    <div className="app">
      <TopBar source={sourceVideo} protectedCount={protectedCount} findingCount={findings.length} />
      <div className="body">
        <Navigation section={section} exposedCount={exposedCount} onChange={setSection} />
        <main className={`workspace section-${section}`}>
          <WorkspaceHeader
            section={section}
            importing={importing}
            importError={importError}
            canScan={Boolean(sourceVideo)}
            onImport={importVideo}
            onScan={() => void runScan()}
          />
          {(section === 'media' || section === 'review') && (
            <MediaWorkspace
              source={sourceVideo}
              videoUrl={videoUrl}
              videoRef={videoRef}
              findings={findings}
              selectedId={selectedId}
              playing={playing}
              currentTime={currentTime}
              duration={duration}
              videoError={videoError}
              timelineExpanded={timelineExpanded}
              onImport={importVideo}
              onSelect={selectFinding}
              onPlay={togglePlayback}
              onSeek={seek}
              onPlayingChange={setPlaying}
              onTimeChange={setCurrentTime}
              onDurationChange={setDuration}
              onVideoError={setVideoError}
              onTimelineToggle={() => setTimelineExpanded((value) => !value)}
            />
          )}
          {(section === 'scan' || section === 'export') && (
            <WorkflowView
              section={section}
              source={sourceVideo}
              findings={findings}
              protectedCount={protectedCount}
              scanState={scanState}
              scanProgress={scanProgress}
              scanError={scanError}
              scanStats={scanStats}
              onImport={importVideo}
              onNavigate={setSection}
              onStartScan={() => void runScan()}
              onCancelScan={() => void cancelScan()}
            />
          )}
        </main>
      </div>
    </div>
  );
}

function TopBar({ source, protectedCount, findingCount }: { source: SourceVideo | null; protectedCount: number; findingCount: number }) {
  return (
    <header className="topbar">
      <div className="brand"><div className="brandmark"><i /><i /><i /></div><div><strong>DemoShield</strong><small>LOCAL PRIVACY WORKSTATION</small></div></div>
      <div className="file-title"><span className={`dot ${source ? '' : 'inactive'}`} />{source?.fileName ?? 'No video imported'}{source && <em>{source.width} × {source.height} · {formatTime(source.duration)}</em>}</div>
      <div className="top-actions"><div className="summary"><b>{protectedCount}</b><span> / {findingCount}<small> PROTECTED</small></span></div></div>
    </header>
  );
}

function Navigation({ section, exposedCount, onChange }: { section: Section; exposedCount: number; onChange: (section: Section) => void }) {
  return (
    <nav className="rail">
      <div className="rail-top">
        <Nav icon="▣" label="Media" active={section === 'media'} onClick={() => onChange('media')} />
        <Nav icon="⌁" label="Scan" active={section === 'scan'} onClick={() => onChange('scan')} />
        <Nav icon="◌" label="Review" badge={exposedCount || undefined} active={section === 'review'} onClick={() => onChange('review')} />
        <Nav icon="↗" label="Export" active={section === 'export'} onClick={() => onChange('export')} />
      </div>
      <Nav icon="⚙" label="Settings" />
    </nav>
  );
}

function WorkspaceHeader({ section, importing, importError, canScan, onImport, onScan }: { section: Section; importing: boolean; importError: string | null; canScan: boolean; onImport: () => void; onScan: () => void }) {
  const titles: Record<Section, string> = { media: 'Protect your recording', scan: 'Scan for exposure', review: 'Review privacy findings', export: 'Export a protected copy' };
  return (
    <div className="workspace-head">
      <div><span className="eyebrow">{section.toUpperCase()}</span><h1>{titles[section]}</h1>{importError && <span className="import-error">{importError}</span>}</div>
      <div className="head-actions">
        <button className="import" onClick={onImport} disabled={importing}>{importing ? 'Reading metadata…' : '＋ Import video'}</button>
        <button className="scan" onClick={onScan} disabled={!canScan}>✦ Run privacy scan</button>
      </div>
    </div>
  );
}

function MediaWorkspace(props: {
  source: SourceVideo | null; videoUrl: string | null; videoRef: React.RefObject<HTMLVideoElement | null>; findings: Finding[];
  selectedId: string | null; playing: boolean; currentTime: number; duration: number; videoError: string | null; timelineExpanded: boolean;
  onImport: () => void; onSelect: (id: string) => void; onPlay: () => void; onSeek: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onPlayingChange: (playing: boolean) => void; onTimeChange: (time: number) => void; onDurationChange: (duration: number) => void; onVideoError: (error: string) => void; onTimelineToggle: () => void;
}) {
  return (
    <>
      <section className="editor">
        <div className="stage">
          <div className="stage-label"><span className="live-dot" /> PREVIEW {props.source && <><span>·</span> {formatTime(props.currentTime)}</>}</div>
          <div className={`fake-video ${props.videoUrl ? 'real-video' : 'empty-video'}`}>
            {props.videoUrl ? (
              <><video ref={props.videoRef} className="video-element" src={props.videoUrl} onPlay={() => props.onPlayingChange(true)} onPause={() => props.onPlayingChange(false)} onTimeUpdate={(event) => props.onTimeChange(event.currentTarget.currentTime)} onLoadedMetadata={(event) => props.onDurationChange(event.currentTarget.duration)} onError={(event) => props.onVideoError(event.currentTarget.error?.message || 'This video codec cannot be decoded by Electron.')} />{props.findings.filter((finding) => props.currentTime >= finding.startTime && props.currentTime <= finding.endTime).map((finding) => <button key={finding.id} className={`finding-overlay ${finding.status} ${props.selectedId === finding.id ? 'selected' : ''}`} style={{ left: `${finding.region.x * 100}%`, top: `${finding.region.y * 100}%`, width: `${finding.region.width * 100}%`, height: `${finding.region.height * 100}%` }} onClick={() => props.onSelect(finding.id)}><span>{finding.label}</span></button>)}{props.videoError && <div className="video-error"><b>Preview unavailable</b><p>{props.videoError}</p></div>}</>
            ) : (
              <div className="empty-preview"><div className="empty-preview-mark">▣</div><b>Import a screen recording</b><p>Select a local video to begin reviewing it for sensitive information.</p><button className="import" onClick={props.onImport}>＋ Choose video</button></div>
            )}
          </div>
          <div className="player-controls">
            <button className="play" onClick={props.onPlay} disabled={!props.videoUrl}>{props.playing ? 'Ⅱ' : '▶'}</button>
            <span className="time">{formatTime(props.currentTime)} <small>/ {formatTime(props.duration)}</small></span>
            <input className="scrub-input" type="range" min="0" max={props.duration || 0} step="0.01" value={Math.min(props.currentTime, props.duration || 0)} onChange={props.onSeek} disabled={!props.videoUrl} />
          </div>
        </div>
        <FindingsPanel findings={props.findings} selectedId={props.selectedId} onSelect={props.onSelect} />
      </section>
      <Timeline findings={props.findings} duration={props.duration} currentTime={props.currentTime} expanded={props.timelineExpanded} onToggle={props.onTimelineToggle} onSelect={props.onSelect} />
    </>
  );
}

function FindingsPanel({ findings, selectedId, onSelect }: { findings: Finding[]; selectedId: string | null; onSelect: (id: string) => void }) {
  return (
    <aside className="findings">
      <div className="panel-head"><div><span className="eyebrow">PRIVACY REVIEW</span><h2>Findings <span>{findings.length}</span></h2></div></div>
      {findings.length === 0 ? <div className="panel-empty"><b>No findings yet</b><p>Run a privacy scan or add a manual redaction.</p></div> : <div className="finding-list">{findings.map((finding) => <button key={finding.id} className={`finding ${selectedId === finding.id ? 'selected' : ''}`} onClick={() => onSelect(finding.id)}><div className="finding-top"><span className="category">{finding.category}</span><span className="confidence">{Math.round(finding.confidence * 100)}%</span></div><b>{finding.label}</b><code>{finding.value}</code><div className="finding-bottom"><span>{formatTime(finding.startTime)} – {formatTime(finding.endTime)}</span><span className={`status ${finding.status}`}>{finding.status}</span></div></button>)}</div>}
      <button className="add-finding" disabled>＋ Add manual redaction</button>
    </aside>
  );
}

function Timeline({ findings, duration, currentTime, expanded, onToggle, onSelect }: { findings: Finding[]; duration: number; currentTime: number; expanded: boolean; onToggle: () => void; onSelect: (id: string) => void }) {
  const position = duration ? Math.min(100, currentTime / duration * 100) : 0;
  return (
    <section className={`timeline ${expanded ? 'expanded' : ''}`}>
      <div className="timeline-head"><div><span className="eyebrow">TIMELINE</span><h2>Exposure map</h2></div><div className="timeline-tools"><button onClick={onToggle}>{expanded ? 'Collapse lanes' : 'Expand lanes'}</button><button>Fit</button></div></div>
      <div className="lane lane-0"><label>Exposure</label><div className="lane-track">{findings.map((finding) => <button key={finding.id} className={`segment ${finding.status}`} style={{ left: `${duration ? finding.startTime / duration * 100 : 0}%`, width: `${duration ? Math.max(0.5, (finding.endTime - finding.startTime) / duration * 100) : 0}%` }} onClick={() => onSelect(finding.id)} />)}</div></div>
      {findings.length === 0 && <span className="timeline-empty">No exposure data</span>}
      <div className="playhead" style={{ left: `calc(88px + (100% - 102px) * ${position / 100})` }}><span>{formatTime(currentTime)}</span></div>
    </section>
  );
}

function WorkflowView(props: {
  section: Exclude<Section, 'media'>;
  source: SourceVideo | null;
  findings: Finding[];
  protectedCount: number;
  scanState: 'idle' | 'running' | 'complete' | 'canceled' | 'error';
  scanProgress: ScanProgress | null;
  scanError: string | null;
  scanStats: ScanStats | null;
  onImport: () => void;
  onNavigate: (section: Section) => void;
  onStartScan: () => void;
  onCancelScan: () => void;
}) {
  if (!props.source) return <section className="workflow"><div className="workflow-intro"><span className="eyebrow">NO SOURCE VIDEO</span><h2>Import a recording first.</h2><p>DemoShield needs a local source video before this workflow is available.</p><button className="import large" onClick={props.onImport}>＋ Import video</button></div></section>;
  if (props.section === 'scan') {
    const percent = Math.round((props.scanProgress?.progress || 0) * 100);
    const headings = { idle: 'Ready to scan this recording.', running: 'Inspecting sampled frames…', complete: 'Frame sampling complete.', canceled: 'Scan canceled.', error: 'Scan failed.' };
    const phaseLabel = props.scanProgress?.phase === 'ocr_loading' ? 'LOADING OCR' : props.scanProgress?.phase === 'finalizing' ? 'FINALIZING RESULTS' : props.scanProgress?.phase === 'complete' ? 'SCAN COMPLETE' : props.scanState === 'running' ? 'ADAPTIVE SCAN' : 'SCAN STATUS';
    return <section className="workflow scan-workflow"><div className="workflow-intro"><span className="eyebrow">LOCAL DETECTION</span><h2>{headings[props.scanState]}</h2><p>{props.scanState === 'complete' ? props.findings.length ? `OCR read ${props.scanStats?.recognizedTexts || 0} text regions and classified ${props.findings.length} sensitive exposure${props.findings.length === 1 ? '' : 's'}.` : `OCR read ${props.scanStats?.recognizedTexts || 0} text regions, but none matched the enabled privacy rules.` : props.scanState === 'error' ? props.scanError : 'DemoShield inspects lightweight frames and runs OCR only on meaningful visual changes. Nothing leaves this device.'}</p><div className="scan-actions">{props.scanState === 'running' ? <button className="quiet large" onClick={props.onCancelScan}>Cancel scan</button> : props.scanState === 'complete' && props.findings.length ? <button className="scan large" onClick={() => props.onNavigate('review')}>Review findings →</button> : <button className="scan large" onClick={props.onStartScan}>✦ Scan again</button>}</div></div><div className="scan-monitor"><div className="scan-monitor-head"><span>{phaseLabel}</span><b>{percent}%</b></div><div className="scan-progress"><i style={{ width: `${percent}%` }} /></div><div className="scan-monitor-meta"><span>{props.scanProgress?.sampledFrames || 0} inspected · {props.scanProgress?.ocrFrames || 0} OCR · {props.scanProgress?.skippedFrames || 0} skipped</span><span>{props.scanStats ? `${props.scanStats.ocrSeconds.toFixed(1)}s OCR` : props.scanProgress?.timestamp !== undefined ? formatTime(props.scanProgress.timestamp) : '—'}</span></div></div></section>;
  }
  if (props.section === 'review') return <section className="workflow"><div className="workflow-intro"><span className="eyebrow">REVIEW QUEUE</span><h2>{props.findings.length ? 'Review detected exposure.' : 'Nothing to review yet.'}</h2><p>{props.findings.length ? 'Approve, adjust, or ignore every finding.' : 'Complete a privacy scan to populate this queue.'}</p><button className="import large" onClick={() => props.onNavigate('media')}>Return to editor</button></div></section>;
  return <section className="workflow export-view"><div className="workflow-intro"><span className="eyebrow">SANITIZED OUTPUT</span><h2>{props.findings.length && props.protectedCount === props.findings.length ? 'Ready to export.' : 'Protection review incomplete.'}</h2><p>{props.protectedCount} of {props.findings.length} findings are protected. Export rendering is not connected yet.</p><button className="export large" disabled>Export unavailable</button></div><div className="export-spec"><div><span>OUTPUT FORMAT</span><b>MP4 · H.264</b></div><div><span>SOURCE</span><b>{props.source.fileName}</b></div></div></section>;
}

function Nav({ icon, label, active, badge, onClick }: { icon: string; label: string; active?: boolean; badge?: number; onClick?: () => void }) {
  return <button onClick={onClick} className={`nav ${active ? 'active' : ''}`}><span className="icon">{icon}</span><span>{label}</span>{badge ? <b>{badge}</b> : null}</button>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
