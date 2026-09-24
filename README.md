# LiveFace — Live Face Swap Studio

Browser-first real-time face-swap workspace for video experiences.

## Current foundation
- Live camera + microphone permission flow
- Browser-side MediaPipe face tracking
- Authorized source-face image selection
- Live canvas preview with face-position alignment
- Mirror preview control
- Consent-first source-face confirmation
- Responsive desktop/mobile interface

## Important compatibility note
A normal website cannot directly replace the camera stream inside the native WhatsApp, Instagram, Facebook, or other installed social-media apps. The next integration layer for those native apps is a desktop virtual-camera bridge. Browser-based calls can use the camera/output architecture directly.

## Run locally

```bash
npm install
npm run dev
```

The face-tracking model is loaded in the browser from MediaPipe's model CDN. The selected source image is handled locally by the browser in this foundation build.
