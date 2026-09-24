# LiveFace — Live Face Swap Studio

Browser-first real-time face-swap workspace for video experiences.

## Current build
- Live camera + microphone permission flow
- MediaPipe Face Landmarker tracking
- Improved eye-line/face-size/rotation alignment
- Feathered source-face mask for cleaner edges
- 30 FPS processed `canvas.captureStream()` output
- Output stream exposed as `window.liveFaceOutput`
- Dedicated output window for OBS/window-capture workflows
- Consent-first source-face confirmation

## Desktop virtual camera

The browser cannot register an operating-system camera device by itself. LiveFace now includes a small OBS WebSocket bridge under `desktop/` that can start/stop OBS Virtual Camera.

Workflow:

`LiveFace → Output Window → OBS Window Capture → OBS Virtual Camera → WhatsApp / Discord / other desktop apps`

Setup details are in `desktop/README.md`.

## Run locally

```bash
npm install
npm run dev
```

The face-tracking model is loaded in the browser from MediaPipe's model CDN. Camera frames and the selected source image remain local to the browser in this build.

## Native driver note

A completely standalone OS camera device without OBS still requires a signed native virtual-camera driver/extension for the target operating system. The current bridge deliberately uses OBS's established virtual-camera implementation rather than installing an unsigned camera driver.
