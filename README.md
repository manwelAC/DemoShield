# DemoShield

DemoShield is a local-first Electron desktop application for reviewing screen recordings, identifying sensitive information, applying redactions, and exporting a sanitized video copy.

> Share your screen, not your secrets.

## Current status

DemoShield is under active development. The current build includes:

- Electron desktop shell
- React and TypeScript editor interface
- Native local-video selection
- Secure local video streaming and playback
- Python worker process with a JSON-lines protocol
- FFprobe video metadata extraction
- OpenCV frame sampling with progress and cancellation
- Local PaddleOCR text recognition and sensitive-pattern classification
- Media, Scan, Review, and Export workflow surfaces

Manual redaction editing, project persistence, and rendered video export are still in development.

## Requirements

- Node.js and npm
- Python 3.9–3.13 for the PaddleOCR worker
- FFmpeg and FFprobe available on `PATH`

Install Python worker dependencies:

```powershell
cd services/video-worker
py -3.13 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

Verify the local processing tools:

```powershell
.\.venv\Scripts\python.exe --version
ffmpeg -version
ffprobe -version
```

## Development

Install JavaScript dependencies:

```powershell
npm.cmd install
```

Run the Electron desktop application:

```powershell
npm.cmd run desktop
```

Build the renderer:

```powershell
npm.cmd run build
```

## Privacy model

DemoShield references original recordings in place and does not upload them. Project files contain metadata and redaction instructions rather than copies of source videos. Video processing runs locally through Electron, Python, OpenCV, and FFmpeg.
