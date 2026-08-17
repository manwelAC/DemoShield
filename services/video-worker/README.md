# DemoShield video worker

The worker is a local JSON-lines process. Electron starts it and writes one JSON request per line to stdin; the worker writes one response per line to stdout.

```powershell
cd services/video-worker
py -3.13 -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe run_worker.py
```

Example:

```json
{"id":"1","command":"ping"}
```

The `metadata` command uses `ffprobe`, so FFmpeg must be installed and available on `PATH`. The local OCR stack requires a PaddlePaddle-supported Python version; on Windows use Python 3.9 through 3.13. Electron automatically prefers this `.venv` when it exists.
