# Demo Assets

This directory contains the proof assets used in the main README.

## What gets generated

- `captures/pull-request-opened.txt` — real output captured from the existing `pull_request.opened` webhook flow.
- `assets/conflictcast-opened-flow.mp4` — VHS render generated inside the official container.
- `assets/conflictcast-opened-flow.gif` — local `ffmpeg` conversion of the rendered MP4 for README embedding.
- `assets/conflictcast-opened-flow.png` — terminal screenshot captured during the VHS run.

## Regenerate the demo

Run these commands from the repository root:

```bash
npm run demo:render
```

If you only want to inspect the raw captured transcript without rendering assets, run:

```bash
npm run demo:capture
```

`demo:render` already runs the capture step first. It follows the Windows-safe flow used in this repository:

1. Capture the real command output first.
2. Create a small staging directory with the tape, transcript, and replay shell script.
3. Copy that staging directory into `ghcr.io/charmbracelet/vhs`.
4. Run VHS entirely inside the container filesystem.
5. Copy the MP4 and screenshot back out.
6. Convert the MP4 to a GIF locally with `ffmpeg` when available.
