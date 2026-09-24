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
- Mirror preview and responsive controls
- Consent-first source-face confirmation

## Virtual-camera workflow

The browser cannot register an operating-system camera device by itself. The current output layer creates a real `MediaStream` from the processed canvas. For native desktop apps, use:

`LiveFace → Output Window → OBS Window Capture → OBS Virtual Camera → WhatsApp / Discord / other desktop apps`

This gives desktop applications a camera device containing the processed LiveFace output without modifying the native social-media application.

## Run locally

```bash
npm install
npm run dev
```

The face-tracking model is loaded in the browser from MediaPipe's model CDN. Camera frames and the selected source image remain local to the browser in this build.

## Next native bridge

A true one-click system virtual camera requires a signed native camera/virtual-device component (for example a desktop companion). The browser output API is separated now so that component can consume the processed stream in a future release.
