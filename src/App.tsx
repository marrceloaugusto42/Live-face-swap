import {useEffect,useRef,useState} from "react";
import {FaceLandmarker,FilesetResolver,PoseLandmarker} from "@mediapipe/tasks-vision";

const MODEL="https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const POSE_MODEL="https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";
type OutputWindow=Window & {liveFaceOutput?: HTMLVideoElement};
type LiveFaceWindow=Window & {liveFaceOutput?: MediaStream;liveFaceAudioOutput?: MediaStream;liveFaceCallOutput?: MediaStream};

// Stable, unique landmarks around the face plus key expression/pose points.
const SWAP_POINTS=[10,33,54,67,109,127,143,152,162,172,176,234,263,284,297,338,356,366,377,389,397,400,454,61,291,13,14,78,308,93,323,132,361,58,288,149,378,150,379,197,5,4,1,168,6,9,195,2,98,327,129,358,130,359,174,399,175];
const POSE_CONNECTIONS:number[][]=[[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],[23,25],[25,27],[27,29],[29,31],[24,26],[26,28],[28,30],[30,32],[0,11],[0,12],[0,1],[1,3],[0,2],[2,4],[5,7],[7,9],[6,8],[8,10]];
const POSE_POINTS=Array.from({length:33},(_,i)=>i);

let swapTriangles:number[][]|null=null;let poseTriangles:number[][]|null=null;
function triangulate(points:{x:number;y:number}[]){const n=points.length,minX=Math.min(...points.map(p=>p.x)),maxX=Math.max(...points.map(p=>p.x)),minY=Math.min(...points.map(p=>p.y)),maxY=Math.max(...points.map(p=>p.y)),d=Math.max(maxX-minX,maxY-minY)*20||100,mx=(minX+maxX)/2,my=(minY+maxY)/2;const pts=points.map((p,i)=>({x:p.x,y:p.y,i})).concat([{x:mx-d,y:my-d,i:n},{x:mx,y:my+d,i:n+1},{x:mx+d,y:my-d,i:n+2}]);const cc=(a:any,b:any,c:any)=>{const q=2*(a.x*(b.y-c.y)+b.x*(c.y-a.y)+c.x*(a.y-b.y));if(Math.abs(q)<1e-8)return{x:0,y:0,r:Infinity};const ux=((a.x*a.x+a.y*a.y)*(b.y-c.y)+(b.x*b.x+b.y*b.y)*(c.y-a.y)+(c.x*c.x+c.y*c.y)*(a.y-b.y))/q,uy=((a.x*a.x+a.y*a.y)*(c.x-b.x)+(b.x*b.x+b.y*b.y)*(a.x-c.x)+(c.x*c.x+c.y*c.y)*(b.x-a.x))/q;return{x:ux,y:uy,r:Math.hypot(ux-a.x,uy-a.y)}};let ts:number[][]=[[n,n+1,n+2]];for(let i=0;i<n;i++){const p=pts[i],bad=ts.filter(t=>{const z=cc(pts[t[0]],pts[t[1]],pts[t[2]]);return Math.hypot(p.x-z.x,p.y-z.y)<=z.r+1e-6}),edges:number[][]=[];for(const t of bad)for(let k=0;k<3;k++){const e=[t[k],t[(k+1)%3]],j=edges.findIndex(q=>q[0]===e[1]&&q[1]===e[0]);j>=0?edges.splice(j,1):edges.push(e)}ts=ts.filter(t=>!bad.includes(t));for(const e of edges)ts.push([e[0],e[1],i])}return ts.filter(t=>t.every(i=>i<n));}
function convexHull(points:{x:number;y:number}[]){const pts=points.map((p,i)=>({x:p.x,y:p.y,i})).sort((a,b)=>a.x-b.x||a.y-b.y);const cross=(o:any,a:any,b:any)=>(a.x-o.x)*(b.y-o.y)-(a.y-o.y)*(b.x-o.x);const lo:any[]=[];for(const p of pts){while(lo.length>=2&&cross(lo[lo.length-2],lo[lo.length-1],p)<=0)lo.pop();lo.push(p)}const hi:any[]=[];for(let i=pts.length-1;i>=0;i--){const p=pts[i];while(hi.length>=2&&cross(hi[hi.length-2],hi[hi.length-1],p)<=0)hi.pop();hi.push(p)}return lo.slice(0,-1).concat(hi.slice(0,-1)).map(p=>p.i)}
function warpTriangle(ctx:CanvasRenderingContext2D,img:HTMLImageElement,s:number[],d:number[],alpha:number){const [x0,y0,x1,y1,x2,y2]=s,[u0,v0,u1,v1,u2,v2]=d,den=x0*(y1-y2)+x1*(y2-y0)+x2*(y0-y1);if(Math.abs(den)<1e-5)return;const a=(u0*(y1-y2)+u1*(y2-y0)+u2*(y0-y1))/den,b=(v0*(y1-y2)+v1*(y2-y0)+v2*(y0-y1))/den,c=(u0*(x2-x1)+u1*(x0-x2)+u2*(x1-x0))/den,dv=(v0*(x2-x1)+v1*(x0-x2)+v2*(x1-x0))/den,e=(u0*(x1*y2-x2*y1)+u1*(x2*y0-x0*y2)+u2*(x0*y1-x1*y0))/den,f=(v0*(x1*y2-x2*y1)+v1*(x2*y0-x0*y2)+v2*(x0*y1-x1*y0))/den;ctx.save();ctx.globalAlpha=alpha;ctx.beginPath();ctx.moveTo(u0,v0);ctx.lineTo(u1,v1);ctx.lineTo(u2,v2);ctx.closePath();ctx.clip();ctx.setTransform(a,b,c,dv,e,f);ctx.drawImage(img,0,0);ctx.restore();}

export default function App(){
const video=useRef<HTMLVideoElement>(null),canvas=useRef<HTMLCanvasElement>(null),source=useRef<HTMLImageElement>(null),sourcePerson=useRef<HTMLCanvasElement|null>(null);
const stream=useRef<MediaStream|null>(null),output=useRef<MediaStream|null>(null),landmarker=useRef<FaceLandmarker|null>(null),poseLandmarker=useRef<PoseLandmarker|null>(null),raf=useRef<number>(0),popup=useRef<Window|null>(null),sourcePoints=useRef<{x:number;y:number}[]|null>(null),sourcePosePoints=useRef<{x:number;y:number}[]|null>(null);
const audioContext=useRef<AudioContext|null>(null),audioSource=useRef<MediaStreamAudioSourceNode|null>(null),audioDestination=useRef<MediaStreamAudioDestinationNode|null>(null),lastVideoTime=useRef(-1),lastDetectAt=useRef(0),lastPoseAt=useRef(0),lastLivePoints=useRef<any[]|null>(null),lastLivePose=useRef<any[]|null>(null),stableLivePoints=useRef<{x:number;y:number;z?:number}[]|null>(null),stableLivePose=useRef<{x:number;y:number;z?:number;visibility?:number}[]|null>(null),sourceAnalyzing=useRef(false);
const [running,setRunning]=useState(false),[sourceUrl,setSourceUrl]=useState(""),[status,setStatus]=useState("Camera is off");
const [mirror,setMirror]=useState(true),[consent,setConsent]=useState(false),[ready,setReady]=useState(false),[outputReady,setOutputReady]=useState(false);
const [devices,setDevices]=useState<MediaDeviceInfo[]>([]),[deviceId,setDeviceId]=useState("");
const [voiceStyle,setVoiceStyle]=useState<"natural"|"male"|"female">("natural");

useEffect(()=>()=>{cancelAnimationFrame(raf.current);stream.current?.getTracks().forEach(t=>t.stop());output.current?.getTracks().forEach(t=>t.stop());audioContext.current?.close().catch(()=>{});landmarker.current?.close();poseLandmarker.current?.close();popup.current?.close()},[]);
useEffect(()=>{if(running) setupAudioProcessing()},[voiceStyle]);
async function setupAudioProcessing(){const input=stream.current;if(!input||input.getAudioTracks().length===0)return;try{if(audioContext.current)await audioContext.current.close();const ctx=new AudioContext();audioContext.current=ctx;await ctx.resume();const src=ctx.createMediaStreamSource(new MediaStream([input.getAudioTracks()[0]]));audioSource.current=src;const high=ctx.createBiquadFilter();high.type="highpass";high.frequency.value=voiceStyle==="female"?110:voiceStyle==="male"?65:75;high.Q.value=.7;const low=ctx.createBiquadFilter();low.type="lowshelf";low.frequency.value=180;low.gain.value=voiceStyle==="female"?-2:voiceStyle==="male"?4:0;const presence=ctx.createBiquadFilter();presence.type="peaking";presence.frequency.value=voiceStyle==="female"?3200:voiceStyle==="male"?1800:2500;presence.Q.value=1;presence.gain.value=voiceStyle==="female"?2:voiceStyle==="male"?-1.5:0;const air=ctx.createBiquadFilter();air.type="highshelf";air.frequency.value=voiceStyle==="female"?5000:voiceStyle==="male"?4000:6000;air.gain.value=voiceStyle==="female"?4:voiceStyle==="male"?-4:0;const comp=ctx.createDynamicsCompressor();comp.threshold.value=-24;comp.knee.value=12;comp.ratio.value=3;comp.attack.value=.003;comp.release.value=.18;const dest=ctx.createMediaStreamDestination();audioDestination.current=dest;src.connect(high).connect(low).connect(presence).connect(air).connect(comp).connect(dest);const canvasStream=canvas.current?.captureStream(30);if(canvasStream)output.current=new MediaStream([canvasStream.getVideoTracks()[0],...dest.stream.getAudioTracks()]);const win=window as LiveFaceWindow;win.liveFaceAudioOutput=dest.stream;win.liveFaceCallOutput=output.current||undefined;setOutputReady(!!output.current)}catch(e){console.error("Voice processing setup failed",e);setStatus("Voice processor could not start; camera output remains available.")}}
async function refreshDevices(){try{const all=await navigator.mediaDevices.enumerateDevices();const cams=all.filter(d=>d.kind==="videoinput");setDevices(cams);if(!deviceId&&cams[0])setDeviceId(cams[0].deviceId)}catch(e){console.warn("Could not enumerate cameras",e)}}

async function loadFaceLandmarker(){
try{
setStatus("Loading face tracking engine…");
const vision=await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm");
setStatus("Loading face model…");
const lm=await FaceLandmarker.createFromModelPath(vision,MODEL);
const pl=await PoseLandmarker.createFromModelPath(vision,POSE_MODEL);
setStatus("Starting face tracking…");
await lm.setOptions({runningMode:"VIDEO",numFaces:1,minFaceDetectionConfidence:.5,minFacePresenceConfidence:.5,minTrackingConfidence:.5,outputFaceBlendshapes:false,outputFacialTransformationMatrixes:true});
landmarker.current=lm;
await pl.setOptions({runningMode:"VIDEO",numPoses:1,minPoseDetectionConfidence:.5,minPosePresenceConfidence:.5,minTrackingConfidence:.5,outputSegmentationMasks:true});
poseLandmarker.current=pl;
setStatus(source.current?.complete&&sourceUrl?"Motion-transfer engine ready — source analysis starting…":"Live camera active — add a full-body source image for motion transfer.");
if(source.current?.complete&&sourceUrl)void analyzeSource();
return true;
}catch(e){
console.error("Face tracking initialization failed:",e);
landmarker.current=null;
const detail=e instanceof Error?e.name+": "+(e.message||""):e instanceof DOMException?e.name+": "+(e.message||""):typeof e==="object"&&e!==null?JSON.stringify(e):String(e);
setStatus("Body/face tracking failed: "+(detail||"Unknown model error")+". Camera is still live; retry face tracking.");
return false;
}
}
async function start(){if(!consent){setStatus("Confirm that you have permission to use the source face.");return}try{setStatus("Requesting camera and microphone…");stream.current=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:1280},height:{ideal:720},facingMode:"user",...(deviceId?{deviceId:{exact:deviceId}}:{})},audio:true});await refreshDevices();if(video.current){video.current.srcObject=stream.current;await video.current.play()}setRunning(true);setReady(true);setStatus("Live camera active — loading face tracking…");const c=canvas.current;if(c&&"captureStream" in c){await setupAudioProcessing();const base=c.captureStream(30);if(!output.current)output.current=base;const win=window as LiveFaceWindow;win.liveFaceOutput=output.current;win.liveFaceCallOutput=output.current;setOutputReady(true)}draw();await loadFaceLandmarker()}catch(e){console.error("LiveFace camera startup error:",e);const detail=e instanceof DOMException?e.name+(e.message?": "+e.message:""):e instanceof Error?e.name+": "+e.message:typeof e==="object"&&e!==null?String(e):String(e);setStatus("Camera error: "+(detail||"Unknown error")+". Check browser camera/microphone permission.");stream.current?.getTracks().forEach(t=>t.stop());stream.current=null;audioContext.current?.close().catch(()=>{});audioContext.current=null;audioSource.current=null;audioDestination.current=null;output.current?.getTracks().forEach(t=>t.stop());output.current=null;setOutputReady(false);setRunning(false);setReady(false)}}
function stop(){cancelAnimationFrame(raf.current);stream.current?.getTracks().forEach(t=>t.stop());stream.current=null;audioContext.current?.close().catch(()=>{});audioContext.current=null;audioSource.current=null;audioDestination.current=null;output.current?.getTracks().forEach(t=>t.stop());output.current=null;const win=window as LiveFaceWindow;delete win.liveFaceAudioOutput;delete win.liveFaceCallOutput;delete win.liveFaceOutput;setOutputReady(false);setRunning(false);setReady(false);setStatus("Camera is off")}
function draw(){
const v=video.current,c=canvas.current,pl=poseLandmarker.current,lm=landmarker.current,img=source.current;
if(!v||!c){raf.current=requestAnimationFrame(draw);return}
const w=v.videoWidth||1280,h=v.videoHeight||720;
if(c.width!==w||c.height!==h){c.width=w;c.height=h}
const x=c.getContext("2d")!;
x.clearRect(0,0,w,h);

// The live camera supplies the motion. The uploaded full-body image supplies
// the visible person. We do NOT render the uploaded photo as a rectangular
// image or use the live person's body as the final body.
x.save();
if(mirror){x.translate(w,0);x.scale(-1,1)}
x.drawImage(v,0,0,w,h);
x.restore();

if(img&&sourceUrl&&img.complete&&img.naturalWidth&&pl&&sourcePosePoints.current&&!sourceAnalyzing.current){
  try{
    const now=performance.now();
    if(now-lastPoseAt.current>=33){
      const pr=pl.detectForVideo(v,now);
      const live=pr.landmarks?.[0];
      if(live){
        const raw=live.map((q:any)=>({x:q.x,y:q.y,z:q.z,visibility:q.visibility}));
        const prev=stableLivePose.current;
        const alpha=.42;
        stableLivePose.current=raw.map((q:any,i:number)=>{
          const p=prev?.[i];
          if(!p)return q;
          return {
            x:p.x+(q.x-p.x)*alpha,
            y:p.y+(q.y-p.y)*alpha,
            z:(p.z??0)+((q.z??0)-(p.z??0))*alpha,
            visibility:q.visibility
          };
        });
        lastLivePose.current=stableLivePose.current;
      }
      lastPoseAt.current=now;
    }

    const livePose=lastLivePose.current;
    const srcPose=sourcePosePoints.current;
    if(livePose&&srcPose&&livePose.length===srcPose.length){
      // Map the uploaded person's complete body pose onto the live pose.
      // The uploaded person's original body proportions are preserved by
      // anchoring the source mesh around the torso and scaling by torso width.
      const sourceShoulders=Math.hypot(srcPose[11].x-srcPose[12].x,srcPose[11].y-srcPose[12].y)||1;
      const liveShoulders=Math.hypot(livePose[11].x-livePose[12].x,livePose[11].y-livePose[12].y)||.1;
      const scale=liveShoulders/sourceShoulders;

      const srcCx=(srcPose[11].x+srcPose[12].x)/2;
      const srcCy=(srcPose[11].y+srcPose[12].y)/2;
      const liveCx=(livePose[11].x+livePose[12].x)/2;
      const liveCy=(livePose[11].y+livePose[12].y)/2;

      const sourceMesh=srcPose.map((q:any)=>({
        x:(q.x-srcCx)*scale+srcCx,
        y:(q.y-srcCy)*scale+srcCy
      }));
      const targetMesh=livePose.map((q:any)=>({
        x:(mirror?(1-q.x):q.x)*w,
        y:q.y*h
      }));

      // Scale/translate the source mesh into the live person's coordinate
      // system while retaining the uploaded person's body shape.
      const srcAnchor={x:srcCx,y:srcCy};
      const dstAnchor={x:liveCx,y:liveCy};
      const srcPx=sourceMesh.map((q:any)=>({x:q.x*img.naturalWidth,y:q.y*img.naturalHeight}));
      const srcAnchorPx={x:srcAnchor.x*img.naturalWidth,y:srcAnchor.y*img.naturalHeight};

      // Triangulate the full 33-point human skeleton. Each triangle carries
      // actual pixels from the uploaded person, so clothing, hair, skin and
      // body appearance move with the live pose instead of using the live body.
      const meshTriangles=triangulate(srcPx);
      // Render the uploaded person into an isolated layer first. This is
      // important: clipping must never erase the live camera background.
      const personLayer=document.createElement("canvas");
      personLayer.width=w;
      personLayer.height=h;
      const px=personLayer.getContext("2d")!;
      for(const tri of meshTriangles){
        const src=tri.flatMap(i=>[srcPx[i].x,srcPx[i].y]);
        const dst=tri.flatMap(i=>[targetMesh[i].x,targetMesh[i].y]);
        warpTriangle(px,img,src,dst,1);
      }

      // Keep the source person's pixels inside the live person's pose hull
      // while leaving the live environment untouched.
      const hull=convexHull(targetMesh.map((p:any)=>({x:p.x,y:p.y})));
      if(hull.length>=3){
        px.save();
        px.globalCompositeOperation="destination-in";
        px.beginPath();
        hull.forEach((i:number,j:number)=>{
          const p=targetMesh[i];
          if(j===0)px.moveTo(p.x,p.y);else px.lineTo(p.x,p.y);
        });
        px.closePath();
        px.fill();
        px.restore();
      }
      x.save();
      x.globalCompositeOperation="source-over";
      x.drawImage(personLayer,0,0);
      x.restore();
    }else if(sourcePosePoints.current){
      setStatus("Stand fully in frame so the live body can drive the uploaded person.");
    }
  }catch(err){
    console.error("Full-body motion transfer failed:",err);
  }
}else if(img&&sourceUrl&&!sourcePosePoints.current&&!sourceAnalyzing.current){
  setStatus("Upload a clear full-body person image for motion transfer.");
}

raf.current=requestAnimationFrame(draw);
}
async function analyzeSource(){
const img=source.current,l=landmarker.current,pl=poseLandmarker.current;
if(!img||!img.complete||!img.naturalWidth||!l||!pl||sourceAnalyzing.current)return false;
sourceAnalyzing.current=true;
try{
  setStatus("Analyzing full-body source image…");
  await l.setOptions({runningMode:"IMAGE"});
  await pl.setOptions({runningMode:"IMAGE"});
  const max=1024;
  const scale=Math.min(1,max/img.naturalWidth,max/img.naturalHeight);
  const sw=Math.max(1,Math.round(img.naturalWidth*scale));
  const sh=Math.max(1,Math.round(img.naturalHeight*scale));
  const probe=document.createElement("canvas");
  probe.width=sw;probe.height=sh;
  probe.getContext("2d")!.drawImage(img,0,0,sw,sh);

  const body=pl.detect(probe);
  const bp=body.landmarks?.[0];
  if(!bp){
    sourcePoints.current=null;
    sourcePosePoints.current=null;
    swapTriangles=null;
    setStatus("No full body detected — upload a clear full-body person image.");
    return false;
  }

  // Face tracking is retained for alignment/expression support, but the
  // uploaded source is now treated as a complete person, not a face crop.
  const r=l.detect(probe);
  const p=r.faceLandmarks?.[0];

  sourcePosePoints.current=bp.map((q:any)=>({x:q.x,y:q.y,z:q.z}));
  sourcePoints.current=p?SWAP_POINTS.map(i=>({x:p[i].x*img.naturalWidth,y:p[i].y*img.naturalHeight})):null;
  swapTriangles=null;

  await l.setOptions({runningMode:"VIDEO"});
  await pl.setOptions({runningMode:"VIDEO"});
  setStatus("Full-body source ready — live pose now drives the uploaded person.");
  return true;
}catch(e){
  console.error("Source full-body analysis failed",e);
  try{await l.setOptions({runningMode:"VIDEO"})}catch{}
  try{await pl.setOptions({runningMode:"VIDEO"})}catch{}
  sourcePoints.current=null;
  sourcePosePoints.current=null;
  swapTriangles=null;
  setStatus("Full-body source analysis failed — upload a clear full-body image and retry.");
  return false;
}finally{sourceAnalyzing.current=false}
}
function upload(e:React.ChangeEvent<HTMLInputElement>){const f=e.target.files?.[0];if(!f)return;const url=URL.createObjectURL(f);setSourceUrl(url);sourcePoints.current=null;sourcePosePoints.current=null;sourcePerson.current=null;poseTriangles=null;swapTriangles=null;lastLivePose.current=null;stableLivePose.current=null;stableLivePoints.current=null;if(source.current){source.current.onload=async()=>{const ok=await analyzeSource();if(!ok&&!landmarker.current)setStatus("Source loaded — face tracker is still loading…");};source.current.src=url}setStatus(running?"Analyzing full-body source…":"Source loaded — start the camera and use a full-body source.")}
function openOutput(){if(!output.current||!running){setStatus("Start the camera before opening the output.");return}const w=window.open("","liveface-output","width=960,height=620");if(!w){setStatus("Popup blocked. Allow popups for this site.");return}popup.current=w;w.document.title="LiveFace Camera Output";w.document.body.style.cssText="margin:0;background:#000;overflow:hidden";const v=w.document.createElement("video");v.autoplay=true;v.playsInline=true;v.muted=false;v.volume=1;v.style.cssText="width:100vw;height:100vh;object-fit:contain";v.srcObject=output.current;w.document.body.appendChild(v);(w as OutputWindow).liveFaceOutput=v}
function copyOutput(){if(output.current){const win=window as LiveFaceWindow;win.liveFaceOutput=output.current;win.liveFaceCallOutput=output.current;navigator.clipboard?.writeText("LiveFace processed call stream is available as window.liveFaceCallOutput").catch(()=>{});setStatus("Processed camera + microphone stream exposed as window.liveFaceCallOutput.")}}
return <main>
<header><div className="brand"><span className="mark">◉</span><div><b>LiveFace</b><small>SWAP STUDIO</small></div></div><span className="pill">OUTPUT READY</span></header>
<section className="hero"><p className="eyebrow">REAL-TIME CAMERA STUDIO</p><h1>One processed stream.<br/><span>Use it wherever you need.</span></h1><p className="sub">The processed canvas is now a real 30 FPS MediaStream output. Open it in a clean window for OBS/virtual-camera workflows, while the swap stays local in the browser.</p></section>
<section className="workspace"><div className="stage"><video ref={video} playsInline muted hidden/><canvas ref={canvas}/><img ref={source} hidden alt="source"/>{!running&&<div className="empty"><div className="orb">◉</div><strong>Camera preview</strong><span>Start your camera to begin face tracking.</span></div>}<div className={"live "+(running?"on":"")}>● {running?"LIVE · 30 FPS":"OFFLINE"}</div></div>
<aside><div className="card"><div className="cardtitle">1 · Permission</div><label className="check"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/><span>I have permission to use the selected source face.</span></label></div>
<div className="card"><div className="cardtitle">2 · Source face</div><label className="upload">{sourceUrl?<img src={sourceUrl} alt="Selected source"/>:<div className="uploadicon">＋</div>}<span>{sourceUrl?"Replace source image":"Choose a clear full-body image"}</span><input type="file" accept="image/*" onChange={upload}/></label><small className="hint">Use a clear full-body image of a person you are authorized to use.</small></div>
<div className="card"><div className="cardtitle">3 · Camera + voice + output</div><select className="cameraSelect" value={deviceId} disabled={running||devices.length===0} onChange={e=>setDeviceId(e.target.value)}><option value="">{devices.length?"Select camera":"Camera will appear after permission"}</option>{devices.map(d=><option key={d.deviceId} value={d.deviceId}>{d.label||`Camera ${devices.indexOf(d)+1}`}</option>)}</select><div className="voiceRow"><label>Voice style</label><select className="voiceSelect" value={voiceStyle} disabled={!running} onChange={e=>setVoiceStyle(e.target.value as "natural"|"male"|"female")}><option value="natural">Natural</option><option value="male">Male style</option><option value="female">Female style</option></select></div><button className="primary" onClick={running?stop:start}>{running?"Stop call stream":"Start camera + microphone"}</button><div className="outputrow"><button className="secondary" disabled={!outputReady||!running} onClick={openOutput}>Open output window</button><button className="secondary" disabled={!outputReady||!running} onClick={copyOutput}>Expose stream</button></div><div className="row"><span>Mirror preview</span><button className={"switch "+(mirror?"active":"")} onClick={()=>setMirror(!mirror)}><i/></button></div></div>
<div className="status"><span className={ready?"dot ready":"dot"}/>{status}{running&&!landmarker.current&&<button className="secondary" onClick={loadFaceLandmarker}>Retry body tracking</button>}</div></aside></section>
<section className="how"><b>Video-call workflow</b><span>LiveFace → processed camera + microphone → desktop bridge → virtual camera + virtual microphone → WhatsApp / Discord / Zoom / Meet.</span></section>
<footer><span>Camera and microphone processing stays local in the browser.</span><span>The next desktop layer will route this combined stream into virtual camera + virtual microphone devices for call apps.</span></footer>
</main>
}