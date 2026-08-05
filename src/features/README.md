# UI feature boundaries

The editor is intentionally organized around the product workflow described in the project specification:

- `media` — source video import and preview
- `playback` — transport controls and current time
- `findings` — detection review and status actions
- `redactions` — manual region editing and modes
- `timeline` — privacy category lanes and segments
- `projects` — local project metadata and save state
- `export` — sanitized video export controls

The current visual prototype is still composed in `src/main.tsx`; these boundaries are the extraction targets for the next UI pass.
