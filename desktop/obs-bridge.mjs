import OBSWebSocket from "obs-websocket-js";
const obs=new OBSWebSocket();
const url=process.env.OBS_WS_URL||"ws://127.0.0.1:4455";
const password=process.env.OBS_WS_PASSWORD||"";
const cmd=process.argv[2]||"status";
const sceneName=process.env.LIVEFACE_SCENE||"LiveFace Call";
const outputWindow=process.env.LIVEFACE_WINDOW||"LiveFace Camera Output";
const audioSource=process.env.LIVEFACE_AUDIO_SOURCE||"LiveFace Audio";
try {
 await obs.connect(url,password);
 if(cmd==="start"){await obs.call("StartVirtualCam");console.log("LiveFace: OBS Virtual Camera started.");}
 else if(cmd==="stop"){await obs.call("StopVirtualCam");console.log("LiveFace: OBS Virtual Camera stopped.");}
 else {const v=await obs.call("GetVersion");console.log(JSON.stringify({obsVersion:v.obsVersion,websocketVersion:v.obsWebSocketVersion,platform:v.platform}));}
 await obs.disconnect();
} catch(e) {
 console.error("Could not connect to OBS WebSocket.");
 console.error("Start OBS, enable WebSocket Server on port 4455, then retry.");
 console.error(e.message||e); process.exit(1);
}