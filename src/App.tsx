import {useEffect,useRef,useState} from "react";
import {FaceLandmarker,FilesetResolver} from "@mediapipe/tasks-vision";

const MODEL="https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
type OutputWindow=Window & {liveFaceOutput?: HTMLVideoElement};

export default function App(){
 const video=useRef<HTMLVideoElement>(null),canvas=useRef<HTMLCanvasElement>(null),source=useRef<HTMLImageElement>(null);
 const stream=useRef<MediaStream|null>(null),output=useRef<MediaStream|null>(null),landmarker=useRef<FaceLandmarker|null>(null),raf=useRef<number>(0),popup=useRef<Window|null>(null);
 const [running,setRunning]=useState(false),[sourceUrl,setSourceUrl]=useState(""),[status,setStatus]=useState("Camera is off");
 const [mirror,setMirror]=useState(true),[consent,setConsent]=useState(false),[ready,setReady]=useState(false),[outputReady,setOutputReady]=useState(false);\n const [devices,setDevices]=useState<MediaDeviceInfo[]>([]),[deviceId,setDeviceId]=useState("");

 useEffect(()=>()=>{cancelAnimationFrame(raf.current);stream.current?.getTracks().forEach(t=>t.stop());output.current?.getTracks().forEach(t=>t.stop());landmarker.current?.close();popup.current?.close()},[]);

 async function refreshDevices(){\n  try{const all=await navigator.mediaDevices.enumerateDevices();const cams=all.filter(d=>d.kind==="videoinput");setDevices(cams);if(!deviceId&&cams[0])setDeviceId(cams[0].deviceId)}catch(e){console.warn("Could not enumerate cameras",e)}\n }\n async function start(){
  if(!consent){setStatus("Confirm that you have permission to use the source face.");return}
  try{
   setStatus("Requesting camera…");
   stream.current=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:1280},height:{ideal:720},facingMode:"user",...(deviceId?{deviceId:{exact:deviceId}}:{})},audio:true});\n   await refreshDevices();
   if(video.current){video.current.srcObject=stream.current;await video.current.play()}
   setStatus("Loading face tracking…");
   const vision=await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm");
   landmarker.current=await FaceLandmarker.createFromOptions(vision,{baseOptions:{modelAssetPath:MODEL},runningMode:"VIDEO",numFaces:1,minFaceDetectionConfidence:.55,minTrackingConfidence:.55});
   const c=canvas.current;
   if(c&&"captureStream" in c){output.current=c.captureStream(30);setOutputReady(true);(window as Window&{liveFaceOutput?:MediaStream}).liveFaceOutput=output.current}
   setRunning(true);setReady(true);setStatus(sourceUrl?"Live output active":"Live camera active — add a source face for the swap.");
   draw();
  }catch(e){console.error(e);setStatus(e instanceof DOMException ? `Camera error: ${e.name}. Check browser permission and camera availability.` : `Camera/model error: ${e instanceof Error?e.message:"Unknown error"}`)}
 }
 function stop(){cancelAnimationFrame(raf.current);stream.current?.getTracks().forEach(t=>t.stop());stream.current=null;output.current?.getTracks().forEach(t=>t.stop());output.current=null;setOutputReady(false);setRunning(false);setReady(false);setStatus("Camera is off")}
 function draw(){
  const v=video.current,c=canvas.current,l=landmarker.current;if(!v||!c||!l)return;
  const w=v.videoWidth||1280,h=v.videoHeight||720;
  if(c.width!==w||c.height!==h){c.width=w;c.height=h}
  const x=c.getContext("2d")!;x.clearRect(0,0,w,h);
  x.save();if(mirror){x.translate(w,0);x.scale(-1,1)}x.drawImage(v,0,0,w,h);x.restore();
  if(source.current&&sourceUrl&&source.current.complete){
   const res=l.detectForVideo(v,performance.now()),p=res.faceLandmarks?.[0];
   if(p){
    const pt=(i:number)=>({x:p[i].x*w,y:p[i].y*h});
    const left=pt(33),right=pt(263),nose=pt(1),chin=pt(152);
    const dx=right.x-left.x,dy=right.y-left.y,angle=Math.atan2(dy,dx),eyeDist=Math.hypot(dx,dy);
    const fw=eyeDist*2.22,fh=eyeDist*2.68,cx=nose.x,cy=nose.y+eyeDist*.38;
    x.save();x.translate(mirror?w-cx:cx,cy);if(mirror)x.scale(-1,1);x.rotate(angle);
    const g=x.createRadialGradient(0,0,fw*.18,0,0,fw*.62);g.addColorStop(0,"rgba(255,255,255,1)");g.addColorStop(.58,"rgba(255,255,255,.99)");g.addColorStop(.82,"rgba(255,255,255,.72)");g.addColorStop(1,"rgba(255,255,255,0)");
    const mask=document.createElement("canvas");mask.width=Math.ceil(fw);mask.height=Math.ceil(fh);
    const m=mask.getContext("2d")!;m.fillStyle=g;m.beginPath();m.ellipse(fw/2,fh/2,fw*.49,fh*.49,0,0,Math.PI*2);m.fill();
    x.globalCompositeOperation="source-over";x.globalAlpha=.97;
    x.drawImage(source.current,-fw/2,-fh/2,fw,fh);
    x.globalCompositeOperation="destination-in";x.drawImage(mask,-fw/2,-fh/2,fw,fh);
    x.restore();
   }
  }
  raf.current=requestAnimationFrame(draw);
 }
 function upload(e:React.ChangeEvent<HTMLInputElement>){const f=e.target.files?.[0];if(!f)return;const url=URL.createObjectURL(f);setSourceUrl(url);if(source.current)source.current.src=url;setStatus(running?"Source loaded — output updated":"Source loaded — start the camera.")}
 function openOutput(){
  if(!output.current||!running){setStatus("Start the camera before opening the output.");return}
  const w=window.open("","liveface-output","width=960,height=620");
  if(!w){setStatus("Popup blocked. Allow popups for this site.");return}
  popup.current=w;w.document.title="LiveFace Camera Output";w.document.body.style.cssText="margin:0;background:#000;overflow:hidden";
  const v=w.document.createElement("video");v.autoplay=true;v.playsInline=true;v.muted=true;v.style.cssText="width:100vw;height:100vh;object-fit:contain";v.srcObject=output.current;w.document.body.appendChild(v);(w as OutputWindow).liveFaceOutput=v;
 }
 function copyOutput(){if(output.current){(window as Window&{liveFaceOutput?:MediaStream}).liveFaceOutput=output.current;navigator.clipboard?.writeText("LiveFace output stream is available in this page as window.liveFaceOutput").catch(()=>{});setStatus("Output stream exposed as window.liveFaceOutput.")}}
 return <main>
  <header><div className="brand"><span className="mark">◉</span><div><b>LiveFace</b><small>SWAP STUDIO</small></div></div><span className="pill">OUTPUT READY</span></header>
  <section className="hero"><p className="eyebrow">REAL-TIME CAMERA STUDIO</p><h1>One processed stream.<br/><span>Use it wherever you need.</span></h1><p className="sub">The processed canvas is now a real 30 FPS MediaStream output. Open it in a clean window for OBS/virtual-camera workflows, while the swap stays local in the browser.</p></section>
  <section className="workspace">
   <div className="stage"><video ref={video} playsInline muted hidden/><canvas ref={canvas}/><img ref={source} hidden alt="source"/>{!running&&<div className="empty"><div className="orb">◉</div><strong>Camera preview</strong><span>Start your camera to begin face tracking.</span></div>}<div className={"live "+(running?"on":"")}>● {running?"LIVE · 30 FPS":"OFFLINE"}</div></div>
   <aside>
    <div className="card"><div className="cardtitle">1 · Permission</div><label className="check"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/><span>I have permission to use the selected source face.</span></label></div>
    <div className="card"><div className="cardtitle">2 · Source face</div><label className="upload">{sourceUrl?<img src={sourceUrl} alt="Selected source"/>:<div className="uploadicon">＋</div>}<span>{sourceUrl?"Replace source image":"Choose a face image"}</span><input type="file" accept="image/*" onChange={upload}/></label><small className="hint">Use a clear, front-facing image you are authorized to use.</small></div>
    <div className="card"><div className="cardtitle">3 · Camera + output</div><select className="cameraSelect" value={deviceId} disabled={running||devices.length===0} onChange={e=>setDeviceId(e.target.value)}><option value="">{devices.length?"Select camera":"Camera will appear after permission"}</option>{devices.map(d=><option key={d.deviceId} value={d.deviceId}>{d.label||`Camera ${devices.indexOf(d)+1}`}</option>)}</select><button className="primary" onClick={running?stop:start}>{running?"Stop camera":"Start camera"}</button><div className="outputrow"><button className="secondary" disabled={!outputReady||!running} onClick={openOutput}>Open output window</button><button className="secondary" disabled={!outputReady||!running} onClick={copyOutput}>Expose stream</button></div><div className="row"><span>Mirror preview</span><button className={"switch "+(mirror?"active":"")} onClick={()=>setMirror(!mirror)}><i/></button></div></div>
    <div className="status"><span className={ready?"dot ready":"dot"}/>{status}</div>
   </aside>
  </section>
  <section className="how"><b>Virtual-camera workflow</b><span>LiveFace → Output Window → OBS Window Capture → OBS Virtual Camera → WhatsApp / Discord / other desktop apps.</span></section>
  <footer><span>Processed frames remain in the browser in this build.</span><span>Native social apps need a desktop virtual-camera layer; the browser alone cannot register an OS camera device.</span></footer>
 </main>
}