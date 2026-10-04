import{useEffect,useRef,useState}from"react";
import{createDecartClient,models}from"@decartai/sdk";

const MODEL=models.realtime("lucy-2.5");
const PROMPT="Substitute the character in the live video with the person in the reference image. Preserve the reference person's identity, face, hair, skin tone, body proportions, clothing, and overall visual appearance. Transfer the live camera person's natural head, facial, arm, hand, torso, hip, and leg movement to the reference person with realistic anatomy, lighting, occlusion, and temporal consistency. Keep the full body visible and centered whenever the camera allows it.";

const err=(e:unknown)=>e instanceof Error?e.message||e.name:String(e);

async function client(){
 const r=await fetch("/api/decart-token",{method:"POST",headers:{"content-type":"application/json"},body:"{}"});
 const data=await r.json().catch(()=>({}));
 if(!r.ok)throw new Error(data.error||"Realtime AI session could not be created.");
 if(!data.apiKey)throw new Error("DECART_API_KEY is not configured.");
 return createDecartClient({apiKey:data.apiKey});
}

export default function App(){
 const watch=new URLSearchParams(location.search).get("watch");
 return watch?<Watch token={watch}/>:<Studio/>;
}

function Watch({token}:{token:string}){
 const video=useRef<HTMLVideoElement>(null),sub=useRef<any>(null);
 const[status,setStatus]=useState("Connecting…"),[live,setLive]=useState(false);
 useEffect(()=>{let dead=false;(async()=>{try{
   const c=await client();
   const s=await c.realtime.subscribe({token,onRemoteStream:(stream:any)=>{
     if(dead)return;const v=video.current;if(!v)return;
     v.srcObject=stream;void v.play().catch(()=>{});setLive(true);setStatus("LIVE · AI transformed output");
   }});
   sub.current=s;s.on("connectionChange",(state:string)=>{
     if(dead)return;
     if(state==="connected"||state==="generating"){setLive(true);setStatus("LIVE · AI transformed output")}
     else if(state==="reconnecting")setStatus("Reconnecting…");
   });
 }catch(e){if(!dead)setStatus("Output connection failed: "+err(e))}})();
 return()=>{dead=true;sub.current?.disconnect();sub.current=null}},[token]);
 return <main className="outputPage"><video ref={video} autoPlay playsInline/><div className="outputOverlay"><span className={"session "+(live?"sessionOn":"")}>● {live?"LIVE":"CONNECTING"}</span><strong>LiveFace AI Output</strong><span>{status}</span></div></main>
}

function Studio(){
 const input=useRef<HTMLVideoElement>(null),output=useRef<HTMLVideoElement>(null),raw=useRef<MediaStream|null>(null),rt=useRef<any>(null),file=useRef<File|null>(null),urlRef=useRef("");
 const[running,setRunning]=useState(false),[ready,setReady]=useState(false),[outReady,setOutReady]=useState(false),[status,setStatus]=useState("Camera is off"),[source,setSource]=useState(""),[sourceName,setSourceName]=useState(""),[consent,setConsent]=useState(false),[mirror,setMirror]=useState(true),[devices,setDevices]=useState<MediaDeviceInfo[]>([]),[deviceId,setDeviceId]=useState(""),[share,setShare]=useState(""),[quality,setQuality]=useState("—"),[view,setView]=useState<"dashboard"|"realtime"|"tools"|"settings">("dashboard");

 useEffect(()=>()=>{rt.current?.disconnect();raw.current?.getTracks().forEach(t=>t.stop());if(urlRef.current)URL.revokeObjectURL(urlRef.current)},[]);
 async function devicesList(){try{const d=await navigator.mediaDevices.enumerateDevices();const cams=d.filter(x=>x.kind==="videoinput");setDevices(cams);if(!deviceId&&cams[0])setDeviceId(cams[0].deviceId)}catch{}}
 function setShareUrl(token:string){const u=new URL(location.href);u.search="";u.searchParams.set("watch",token);setShare(u.toString())}
 function upload(e:React.ChangeEvent<HTMLInputElement>){const f=e.target.files?.[0];if(!f)return;if(!f.type.startsWith("image/")){setStatus("Use a JPG, PNG, or WebP image.");return}if(urlRef.current)URL.revokeObjectURL(urlRef.current);file.current=f;urlRef.current=URL.createObjectURL(f);setSource(urlRef.current);setSourceName(f.name);setStatus(running?"Updating the AI reference…":"Reference loaded — start LiveCam");if(rt.current)void apply(f)}
 async function apply(f:File){try{setStatus("Applying full-body reference…");await rt.current.set({prompt:PROMPT,image:f,enhance:true});setStatus("AI full-body transformation is live.")}catch(e){setStatus("Reference update failed: "+err(e))}}
 async function start(){
  if(!consent){setStatus("Confirm that you have permission to use the source image.");return}
  if(!file.current){setStatus("Upload a full-body source image first.");return}
  let stream:MediaStream|null=null;
  try{
   setStatus("Requesting camera and microphone…");const c=await client();
   stream=await navigator.mediaDevices.getUserMedia({audio:true,video:{facingMode:"user",frameRate:MODEL.fps,width:MODEL.width,height:MODEL.height,...(deviceId?{deviceId:{exact:deviceId}}:{})}});
   raw.current=stream;const v=input.current;if(v){v.srcObject=stream;v.muted=true;v.playsInline=true;await v.play()}
   setReady(true);setStatus("Connecting realtime AI…");
   const session=await c.realtime.connect(stream,{model:MODEL,mirror:mirror?"auto":false,initialState:{prompt:{text:PROMPT,enhance:true},image:file.current},
    onRemoteStream:(s:any)=>{const v=output.current;if(!v)return;v.srcObject=s;v.muted=true;v.playsInline=true;void v.play().catch(()=>{});setOutReady(true);setRunning(true);setStatus("AI full-body LiveCam is live.")},
    onConnectionQuality:(q:any)=>setQuality(q.metrics?.fps?Math.round(q.metrics.fps)+" FPS":q.quality||"—")
   });
   rt.current=session;
   session.on("connectionChange",(state:string)=>{if(state==="connected"||state==="generating"){setRunning(true);setStatus("AI full-body LiveCam is live.");if(session.subscribeToken)setShareUrl(session.subscribeToken)}else if(state==="reconnecting")setStatus("LiveCam reconnecting…");else if(state==="disconnected")setStatus("LiveCam disconnected.")});
   if(session.subscribeToken)setShareUrl(session.subscribeToken);await devicesList();
  }catch(e){
   console.error(e);stream?.getTracks().forEach(t=>t.stop());raw.current=null;rt.current?.disconnect();rt.current=null;setRunning(false);setReady(false);setOutReady(false);
   const m=err(e);setStatus(/DECART|api.?key|configured|401|403/i.test(m)?"AI engine is not configured. Add DECART_API_KEY in Vercel, then redeploy.":"LiveCam error: "+m)
  }
 }
 function stop(){rt.current?.disconnect();rt.current=null;raw.current?.getTracks().forEach(t=>t.stop());raw.current=null;if(input.current)input.current.srcObject=null;if(output.current)output.current.srcObject=null;setRunning(false);setReady(false);setOutReady(false);setShare("");setQuality("—");setStatus("Camera is off")}
 async function copy(){if(!share){setStatus("Start LiveCam first.");return}try{await navigator.clipboard.writeText(share);setStatus("OBS output URL copied.")}catch{setStatus("OBS URL is ready to copy.")}}
 function open(){if(share)window.open(share,"liveface-output","width=1280,height=720");else setStatus("Start LiveCam first.")}

 function Dashboard(){return <div className="dashboard"><div className="welcome"><div><span className="eyebrow">CREATOR WORKSPACE</span><h1>Your studio, ready to create.</h1><p>Full-body reference in. Realtime AI transformation out. Your camera supplies the movement.</p></div><button className="primary heroButton" onClick={()=>setView("realtime")}>Open Realtime Studio <span>→</span></button></div><div className="statgrid"><div className="stat"><span>WORKSPACE</span><b>LiveFace Studio</b><small>Realtime AI creator</small></div><div className="stat"><span>LIVE ENGINE</span><b className={running?"green":"muted"}>{running?"ACTIVE":"READY"}</b><small>Lucy 2.5 realtime</small></div><div className="stat"><span>OUTPUT</span><b>{quality}</b><small>AI transformed stream</small></div><div className="stat"><span>OBS</span><b>{share?"READY":"—"}</b><small>Browser Source</small></div></div><div className="sectionHead"><div><span className="eyebrow">WORKSPACES</span><h2>Launch a creator tool</h2></div></div><div className="toolgrid"><button className="toolcard featured" onClick={()=>setView("realtime")}><div className="toolvisual"><div className="scanline"/><span>AI LIVE</span></div><div className="toolcopy"><small>REALTIME · FULL BODY</small><h3>Realtime Studio</h3><p>AI follows your live movement while preserving the selected persona.</p><strong>Open workspace →</strong></div></button><button className="toolcard" onClick={()=>setView("tools")}><div className="toolicon">✦</div><div className="toolcopy"><small>REFERENCE</small><h3>AI Persona</h3><p>Swap the reference image during an active session.</p><strong>Explore controls →</strong></div></button><button className="toolcard" onClick={()=>setView("settings")}><div className="toolicon voice">◌</div><div className="toolcopy"><small>OUTPUT</small><h3>OBS & Streaming</h3><p>Use a clean subscriber URL for OBS Browser Source.</p><strong>Open settings →</strong></div></button></div></div>}

 function Tools(){return <div className="simplePage"><span className="eyebrow">CREATOR TOOLS</span><h1>Realtime AI controls.</h1><p>Lucy 2.5 performs the live transformation; the workspace controls the reference and output.</p><div className="toolgrid"><div className="toolcard"><div className="toolicon">✦</div><div className="toolcopy"><small>REFERENCE IMAGE</small><h3>Full-body persona</h3><p>Use a clear, unobstructed full-body image. Match the framing to the camera.</p><button className="secondary" onClick={()=>setView("realtime")}>Open source controls</button></div></div><div className="toolcard"><div className="toolicon voice">◌</div><div className="toolcopy"><small>ENGINE</small><h3>Lucy 2.5</h3><p>Realtime WebRTC transformation stream with reference-image support.</p></div></div></div></div>}
 function Settings(){return <div className="simplePage"><span className="eyebrow">SETTINGS</span><h1>Streaming preferences.</h1><p>Paste the generated subscriber URL into OBS as a Browser Source.</p><div className="settingsPanel"><div><strong>Mirror preview</strong><span>{mirror?"Creator preview is mirrored.":"Creator preview is not mirrored."}</span></div><button className={"switch "+(mirror?"active":"")} onClick={()=>setMirror(!mirror)}><i/></button></div><div className="settingsPanel"><div><strong>OBS output</strong><span>{share?"Live subscriber URL available.":"Start LiveCam to create it."}</span></div><button className="secondary" disabled={!share} onClick={copy}>Copy OBS URL</button></div><div className="settingsPanel"><div><strong>AI engine</strong><span>Decart Lucy 2.5 realtime video transformation.</span></div><span className={"badge "+(running?"good":"warn")}>{running?"CONNECTED":"READY"}</span></div></div>}
 function Realtime(){return <div className="studio"><div className="studioTop"><div><span className="eyebrow">REALTIME · FULL BODY</span><h1>Realtime Studio</h1><p>AI replaces the live person with the selected full-body persona while following live movement.</p></div><div className="studioActions"><span className={"session "+(running?"sessionOn":"")}>● {running?"LIVE":"READY"}</span><button className="secondary compact" onClick={()=>setView("dashboard")}>Dashboard</button></div></div><div className="studioGrid"><div className="stageWrap"><div className="stage"><video ref={input} className="inputPreview" playsInline muted autoPlay/><video ref={output} className="aiPreview" playsInline muted autoPlay/>{!running&&<div className="empty"><div className="orb">◉</div><strong>Realtime AI preview</strong><span>Upload a full-body reference and start LiveCam.</span></div>}<div className={"live "+(running?"on":"")}>● {running?"LIVE · AI FULL BODY":"READY"}</div></div><div className="stageFoot"><span>AI transformed preview</span><span>{outReady?(quality==="—"?"Realtime output connected":quality):"Output appears after LiveCam connects"}</span></div></div><aside className="controlRail"><div className="card"><div className="cardtitle">SOURCE PERSON</div><label className="upload large">{source?<img src={source} alt="Selected source"/>:<><div className="uploadicon">＋</div><span>Upload full-body image</span></>}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={upload}/></label>{sourceName&&<small className="hint">{sourceName}</small>}<small className="hint">Use an image you own or have permission to use. Clear full-body references produce better results.</small></div><div className="card"><div className="cardtitle">LIVE INPUT</div><select className="cameraSelect" value={deviceId} disabled={running||!devices.length} onChange={e=>setDeviceId(e.target.value)}><option value="">{devices.length?"Select camera":"Camera appears after permission"}</option>{devices.map((d,i)=><option key={d.deviceId} value={d.deviceId}>{d.label||`Camera ${i+1}`}</option>)}</select><label className="check"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/><span>I have permission to use this source image.</span></label><button className="primary" onClick={running?stop:start}>{running?"Stop LiveCam":"Start LiveCam"}</button></div><div className="card"><div className="cardtitle">OBS / OUTPUT</div><div className="outputrow"><button className="secondary" disabled={!share} onClick={open}>Open output</button><button className="secondary" disabled={!share} onClick={copy}>Copy OBS URL</button></div><small className="hint">In OBS add a Browser Source and paste the copied URL. It subscribes to the transformed WebRTC stream, not the raw camera.</small></div><div className="status"><span className={ready?"dot ready":"dot"}/>{status}</div></aside></div><div className="workflow"><div><span>OUTPUT WORKFLOW</span><strong>Camera → Lucy 2.5 realtime AI → transformed WebRTC stream → OBS Browser Source</strong></div><div><span>CONSENT</span><strong>Only use reference images you own or have explicit permission to use.</strong></div></div></div>}

 return <main><div className="appShell"><nav className="sidebar"><div className="sideBrand"><span className="mark">◉</span><div><b>LiveFace</b><small>CREATOR STUDIO</small></div></div><div className="navGroup"><span className="navLabel">WORKSPACE</span><button className={view==="dashboard"?"navItem active":"navItem"} onClick={()=>setView("dashboard")}>⌂ <span>Dashboard</span></button><button className={view==="realtime"?"navItem active":"navItem"} onClick={()=>setView("realtime")}>◉ <span>Realtime Full Body</span><em>AI</em></button></div><div className="navGroup"><span className="navLabel">CREATE</span><button className={view==="tools"?"navItem active":"navItem"} onClick={()=>setView("tools")}>✦ <span>Creative Tools</span></button><button className="navItem" onClick={()=>setView("tools")}>◌ <span>Voice</span></button></div><div className="navBottom"><button className={view==="settings"?"navItem active":"navItem"} onClick={()=>setView("settings")}>⚙ <span>Settings</span></button><div className="sideStatus"><span className="statusDot"/><div><b>{running?"AI LiveCam active":"Studio ready"}</b><small>{running?"Lucy 2.5 realtime":"Browser workspace"}</small></div></div></div></nav><div className="content">{view==="dashboard"?<Dashboard/>:view==="realtime"?<Realtime/>:view==="tools"?<Tools/>:<Settings/>}</div></div></main>
}