# LiveFace Desktop Virtual-Camera Bridge

This companion automates the desktop step of starting OBS's OS-level Virtual Camera. The browser produces the processed LiveFace stream; OBS supplies the camera device that native desktop apps can select.

## Requirements

- OBS Studio with Virtual Camera support
- OBS WebSocket 5.x enabled (Tools -> WebSocket Server Settings)
- Node.js 18+

## Setup

1. Run the LiveFace web app.
2. Start the camera and open its Output Window.
3. In OBS, add a Window Capture source for the LiveFace Output Window and fit it to the canvas.
4. Start OBS WebSocket on the default 4455 port.
5. From this folder run:

    npm install
    npm run virtual-camera

6. Select OBS Virtual Camera as the camera in the desktop app.

Optional password/environment:

    OBS_WS_URL=ws://127.0.0.1:4455 OBS_WS_PASSWORD=your_password npm run virtual-camera

## Commands

    npm run start
    npm run virtual-camera
    npm run stop

This bridge does not modify WhatsApp, Instagram, Discord, or other applications. It exposes the processed LiveFace frames through the operating-system camera device supplied by OBS.
