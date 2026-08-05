# DemoShield video worker

The worker is a local JSON-lines process. Electron starts it and writes one JSON request per line to stdin; the worker writes one response per line to stdout.

```powershell
cd services/video-worker
python -m pip install -r requirements.txt
python run_worker.py
```

Example:

```json
{"id":"1","command":"ping"}
```

The `metadata` command uses `ffprobe`, so FFmpeg must be installed and available on `PATH`. The scan command currently exposes the deterministic detection layer and an OCR adapter seam; PaddleOCR can be enabled once the local runtime is chosen.
