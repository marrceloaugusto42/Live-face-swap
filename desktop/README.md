# LiveFace Desktop Call Bridge

This bridge handles the **OS-facing part** of LiveFace.

## What it does

- Starts/stops the OBS Virtual Camera for processed video.
- Provides a call-mode status check.
- Keeps the browser responsible for face transformation and microphone processing.
- The LiveFace Output Window now contains the processed video **and processed microphone audio**.

## One-time audio setup

A browser cannot register a system microphone device itself. For the microphone side, install and select a virtual-audio device such as **VB-CABLE** (or another virtual audio driver you already use).

In OBS:

1. Open the LiveFace Output Window.
2. Add that application/window as a video source.
3. Add its application audio as an OBS audio source on Windows (or the equivalent audio capture source for your OS).
4. Set that source to **Monitor Only** or **Monitor and Output**.
5. Set OBS's audio monitoring device to the virtual-audio device.
6. In WhatsApp/Discord/Zoom/Meet, select the virtual-audio device as the microphone.
7. Select **OBS Virtual Camera** as the camera.

OBS documents application audio capture for Windows and audio monitoring; OBS WebSocket can control source monitoring, but the monitoring-device selection itself is an OBS setting rather than a WebSocket request. citeturn0search14turn0search6turn0search9

## Commands

```bash
npm install
npm run call-status
npm run call-start
npm run call-stop
```

Environment:

```text
OBS_WS_URL=ws://127.0.0.1:4455
OBS_WS_PASSWORD=your_password
LIVEFACE_SCENE=LiveFace Call
LIVEFACE_WINDOW=LiveFace Camera Output
```

The bridge does not modify the call application itself.
