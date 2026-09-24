import {useEffect,useRef,useState} from "react";
import {FaceLandmarker,FilesetResolver} from "@mediapipe/tasks-vision";

const MODEL="https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
type OutputWindow=Window & {liveFaceOutput?: HTMLVideoElement};

// Stable, unique landmarks around the face plus key expression/pose points.
const SWAP_POINTS=[10,33,54,67,109,127,143,152,162,172,176,234,263,284,297,338,356,366,377,389,397,400,454,61,291,13,14,78,308,93,323,132,361,58,288,149,378,150,379,197,5,4,1,168,6,9,195,2,98,327,129,358,130,359,174,399,175];

let swapTriangles:number[][]|null=null;
function triangulate(points:{x:number;y:number}[]){
 const n=points.length,minX=Math.min(...points.map(p=>p.x)),maxX=Math.max(...points.map(p=>p.x)),minY=Math.min(...points.map(p=>p.y)),maxY=Math.max(...points.map(p=>p.y)),d=Math.max(maxX-minX,maxY-minY)*20||100,mx=(minX+maxX)/2,my=(minY+maxY)/2;
 const pts=points.map((p,i)=>({x:p.x,y:p.y,i})).concat([{x:mx-d,y:my-d,i:n},{x:mx,y:my+d,i:n+1},{x:mx+d,y:my-d,i:n+2}]);
 const cc=(a:any,b:any,c:any)=>{const q=2*(a.x*(b.y-c.y)+b.x*(c.y-a.y)+c.x*(a.y-b.y));if(Math.abs(q)<1e-8)return{x:0,y:0,r:Infinity};const ux=((a.x*a.x+a.y*a.y)*(b.y-c.y)+(b.x*b.x+b.y*b.y)*(c.y-a.y)+(c.x*c.x+c.y*c.y)*(a.y-b.y))/q,uy=((a.x*a.x+a.y*a.y)*(c.x-b.x)+(b.x*b.x+b.y*b.y)*(a.x-c.x)+(c.x*c.x+c.y*c.y)*(b.x-a.x))/q;return{x:ux,y:uy,r:Math.hypot(ux-a.x,uy-a.y)}};
 let ts:number[][]=[[n,n+1,n+2]];
 for(let i=0;i<n;i++){const p=pts[i],bad=ts.filter(t=>{const z=cc(pts[t[0]],pts[t[1]],pts[t[2]]);return Math.hypot(p.x-z.x,p.y-z.y)<=z.r+1e-6}),edges:number[][]=[];for(const t of bad)for(let k=0;k<3;k++){const e=[t[k],t[(k+1)%3]],j=edges.findIndex(q=>q[0]===e[1]&&q[1]===e[0]);j>=0?edges.splice(j,1):edges.push(e)}ts=ts.filter(t=>!bad.includes(t));for(const e of edges)ts.push([e[0],e[1],i])}
 return ts.filter(t=>t.every(i=>i<n));
}
function warpTriangle(ctx:CanvasRenderingContext2D,img:HTMLImageElement,s:number[],d:number[],alpha:number){
 const [x0,y0,x1,y1,x2,y2]=s,[u0,v0,u1,v1,u2,v2]=d,den=x0*(y1-y2)+x1*(y2-y0)+x2*(y0-y1);if(Math.abs(den)<1e-5)return;
 const a=(u0*(y1-y2)+u1*(y2-y0)+u2*(y0-y1))/den,b=(v0*(y1-y2)+v1*(y2-y0)+v2*(y0-y1))/den,c=(u0*(x2-x1)+u1*(x0-x2)+u2*(x1-x0))/den,dv=(v0*(x2-x1)+v1*(x0-x2)+v2*(x1-x0))/den,e=(u0*(x1*y2-x2*y1)+u1*(x2*y0-x0*y2)+u2*(x0*y1-x1*y0))/den,f=(v0*(x1*y2-x2*y1)+v1*(x2*y0-x0*y2)+v2*(x0*y1-x1*y0))/den;
 ctx.save();ctx.globalAlpha=alpha;ctx.beginPath();ctx.moveTo(u0,v0);ctx.lineTo(u1,v1);ctx.lineTo(u2,v2);ctx.closePath();ctx.clip();ctx.setTransform(a,b,c,dv,e,f);ctx.drawImage(img,0,0);ctx.restore();
}

export default function App(){
 const video=useRef<HTMLVideoElement>(null),canvas=useRef<HTMLCanvasElement>(null),source=useRef<HTMLImageElement>(null);
 const stream=useRef<MediaStream|null>(null),output=useRef<MediaStream|null>(null),landmarker=useRef<FaceLandmarker|null>(null),raf=useRef<number>(0),popup=useRef<Window|null>(null),sourcePoints=useRef<{x:number;y:number}[]|null>(null);
 const [running,setRunning]=useState(false),[sourceUrl,setSourceUrl]=useState(""),[status,setStatus]=useState("Camera is off");
 const [mirror,setMirror]=useState(true),[consent,setConsent]=useState(false),[ready,setReady]=useState(false),[outputReady,setOutputReady]=useState(false);
 const [devices,setDevices]=useState<MediaDeviceInfo[]>([]),[deviceId,setDeviceId]=useState("");

 useEffect(()=>()=>{cancelAnimationFrame(raf.current);stream.current?.getTracks().forEach(t=>t.stop());output.current?.getTracks().forEach(t=>t.stop());landmarker.current?.close();popup.current?.close()},[]);

 async function refreshDevices(){
  try{const all=await navigator.mediaDevices.enumerateDevices();const cams=all.filter(d=>d.kind==="videoinput");setDevices(cams);if(!deviceId&&cams[0])setDeviceId(cams[0].deviceId)}catch(e){console.warn("Could not enumerate cameras",e)}
 }
 async function start(){
  if(!consent){setStatus("Confirm that you have permission to use the source face.");return}
  let stage="camera permission";
  try{
   setStatus("Requesting camera…");
   stream.current=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:1280},height:{ideal:720},facingMode:"user",...(deviceId?{deviceId:{exact:deviceId}}:{})},audio:true});
   await refreshDevices();
   if(video.current){video.current.srcObject=stream.current;await video.current.play()}
   stage="MediaPipe WASM";setStatus("Loading face tracking engine…");
   const vision=await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm");
   stage="face landmark model";setStatus("Loading face landmark model…");
   try{landmarker.current=await FaceLandmarker.createFromOptions(vision,{baseOptions:{modelAssetPath:MODEL,delegate:"CPU"},runningMode:"IMAGE",numFaces:1,minFaceDetectionConfidence:.55,minFacePresenceConfidence:.55,minTrackingConfidence:.55});await landmarker.current.setOptions({runningMode:"VIDEO"});}catch(primary){console.warn("MediaPipe model-path initialization failed; retrying from model buffer.",primary);const response=await fetch(MODEL,{mode:"cors",cache:"no-store"});if(!response.ok)throw new Error("Face model download failed: HTTP "+response.status);const buffer=await response.arrayBuffer();landmarker.current=await FaceLandmarker.createFromOptions(vision,{baseOptions:{modelAssetBuffer:new Uint8Array(buffer),delegate:"CPU"},runningMode:"IMAGE",numFaces:1,minFaceDetectionConfidence:.55,minFacePresenceConfidence:.55,minTrackingConfidence:.55});await landmarker.current.setOptions({runningMode:"VIDEO"});}
   const c=canvas.current;
   if(c&&"captureStream" in c){output.current=c.captureStream(30);setOutputReady(true);(window as Window&{liveFaceOutput?:MediaStream}).liveFaceOutput=output.current}
   setRunning(true);setReady(true);setStatus(sourceUrl?"Live output active":"Live camera active — add a source face for the swap.");draw();
  }catch(e){
   console.error("LiveFace startup error:",{stage,error:e});
   const detail=e instanceof DOMException?e.name+(e.message?": "+e.message:""):e instanceof Error?e.name+": "+e.message:e instanceof Event?(e.type||"resource")+" event":typeof e==="object"&&e!==null?String(e):String(e);
   setStatus("Camera/model error ["+stage+"]: "+(detail||"Unknown error")+". MediaPipe could not initialize. Check the model download/network or browser permissions.");
   stream.current?.getTracks().forEach(t=>t.stop());stream.current=null;output.current?.getTracks().forEach(t=>t.stop());output.current=null;setOutputReady(false);setRunning(false);setReady(false);
  }
 }
 function stop(){cancelAnimationFrame(raf.current);stream.current?.getTracks().forEach(t=>t.stop());stream.current=null;output.current?.getTracks().forEach(t=>t.stop());output.current=null;setOutputReady(false);setRunning(false);setReady(false);setStatus("Camera is off")}
 function draw(){
  const v=video.current,c=canvas.current,l=landmarker.current,img=source.current;if(!v||!c||!l)return;
  const w=v.videoWidth||1280,h=v.videoHeight||720;if(c.width!==w||c.height!==h){c.width=w;c.height=h}
  const x=c.getContext("2d")!;x.clearRect(0,0,w,h);x.save();if(mirror){x.translate(w,0);x.scale(-1,1)}x.drawImage(v,0,0,w,h);x.restore();
  if(img&&sourceUrl&&img.complete&&sourcePoints.current&&swapTriangles){const res=l.detectForVideo(v,performance.now()),p=res.faceLandmarks?.[0];if(p){const target=SWAP_POINTS.map(i=>({x:p[i].x*w,y:p[i].y*h}));x.save();for(const t of swapTriangles){const s=t.flatMap(i=>[sourcePoints.current![i].x,sourcePoints.current![i].y]);const d=t.flatMap(i=>{const q=target[i];return[mirror?w-q.x:q.x,q.y]});warpTriangle(x,img,s,d,.96)}x.restore()}}
  raf.current=requestAnimationFrame(draw);
 }
 function upload(e:React.ChangeEvent<HTMLInputElement>){const f=e.target.files?.[0];if(!f)return;const url=URL.createObjectURL(f);setSourceUrl(url);sourcePoints.current=null;swapTriangles=null;if(source.current){source.current.onload=()=>{if(landmarker.current&&source.current){const r=landmarker.current.detect(source.current),p=r.faceLandmarks?.[0];if(p){sourcePoints.current=SWAP_POINTS.map(i=>({x:p[i].x*source.current!.naturalWidth,y:p[i].y*source.current!.naturalHeight}));swapTriangles=triangulate(sourcePoints.current);setStatus("Source face mapped — live swap ready")}else setStatus("No face detected in source image.")}};source.current.src=url}setStatus(running?"Analyzing source face…":"Source loaded — start the camera.")}
 function openOutput(){if(!output.current||!running){setStatus("Start the camera before opening the output.");return}const w=window.open("","liveface-output","width=960,height=620");if(!w){setStatus("Popup blocked. Allow popups for this site.");return}popup.current=w;w.document.title="LiveFace Camera Output";w.document.body.style.cssText="margin:0;background:#000;overflow:hidden";const v=w.document.createElement("video");v.autoplay=true;v.playsInline=true;v.muted=true;v.style.cssText="width:100vw;height:100vh;object-fit:contain";v.srcObject=output.current;w.document.body.appendChild(v);(w as OutputWindow).liveFaceOutput=v}
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