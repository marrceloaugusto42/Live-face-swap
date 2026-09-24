import {useEffect,useRef,useState} from "react";
import {FaceLandmarker,FilesetResolver} from "@mediapipe/tasks-vision";

const MODEL="https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

export default function App(){
 const video=useRef<HTMLVideoElement>(null), canvas=useRef<HTMLCanvasElement>(null), source=useRef<HTMLImageElement>(null);
 const stream=useRef<MediaStream|null>(null), landmarker=useRef<FaceLandmarker|null>(null), raf=useRef<number>(0);
 const [running,setRunning]=useState(false),[sourceUrl,setSourceUrl]=useState(""),[status,setStatus]=useState("Camera is off");
 const [mirror,setMirror]=useState(true),[consent,setConsent]=useState(false),[ready,setReady]=useState(false);

 useEffect(()=>()=>{cancelAnimationFrame(raf.current);stream.current?.getTracks().forEach(t=>t.stop());landmarker.current?.close()},[]);

 async function start(){
   if(!consent){setStatus("Confirm that you have permission to use the source face.");return}
   try{
    setStatus("Requesting camera…");
    stream.current=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:1280},height:{ideal:720},facingMode:"user"},audio:true});
    if(video.current){video.current.srcObject=stream.current;await video.current.play();}
    setStatus("Loading face tracking…");
    const vision=await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm");
    landmarker.current=await FaceLandmarker.createFromOptions(vision,{baseOptions:{modelAssetPath:MODEL},runningMode:"VIDEO",numFaces:1,minFaceDetectionConfidence:.5,minTrackingConfidence:.5});
    setRunning(true);setReady(true);setStatus(sourceUrl?"Live preview active":"Live camera active — add a source face to preview the effect.");
    draw();
   }catch(e){console.error(e);setStatus("Camera or model could not start. Check browser permissions and HTTPS.");}
 }
 function stop(){cancelAnimationFrame(raf.current);stream.current?.getTracks().forEach(t=>t.stop());stream.current=null;setRunning(false);setStatus("Camera is off");}
 function draw(){
   const v=video.current,c=canvas.current,l=landmarker.current;if(!v||!c||!l)return;
   const w=v.videoWidth||1280,h=v.videoHeight||720;c.width=w;c.height=h;const x=c.getContext("2d")!;
   x.save();if(mirror){x.translate(w,0);x.scale(-1,1)}x.drawImage(v,0,0,w,h);x.restore();
   if(source.current&&sourceUrl){const res=l.detectForVideo(v,performance.now());const p=res.faceLandmarks?.[0];if(p){
      const xs=p.map(q=>q.x*w),ys=p.map(q=>q.y*h),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
      const fw=(maxX-minX)*1.18,fh=fw*1.2,cx=(minX+maxX)/2,cy=minY+(maxY-minY)*.53;
      x.save();x.translate(mirror?w-cx:cx,cy);if(mirror)x.scale(-1,1);x.beginPath();x.ellipse(0,0,fw/2,fh/2,0,0,Math.PI*2);x.clip();x.globalAlpha=.96;x.drawImage(source.current,-fw/2,-fh/2,fw,fh);x.restore();
   }}
   raf.current=requestAnimationFrame(draw);
 }
 function upload(e:React.ChangeEvent<HTMLInputElement>){const f=e.target.files?.[0];if(!f)return;setSourceUrl(URL.createObjectURL(f));setStatus(running?"Source loaded — live preview active":"Source loaded — start the camera.");}
 return <main>
  <header><div className="brand"><span className="mark">◉</span><div><b>LiveFace</b><small>SWAP STUDIO</small></div></div><span className="pill">BROWSER PREVIEW</span></header>
  <section className="hero"><div><p className="eyebrow">REAL-TIME CAMERA STUDIO</p><h1>Bring your chosen face<br/><span>into the live preview.</span></h1><p className="sub">A consent-first camera workspace designed for browser video calls. Your camera stays in the browser; nothing is uploaded by this demo.</p></div></section>
  <section className="workspace">
   <div className="stage"><video ref={video} playsInline muted hidden/><canvas ref={canvas}/>{!running&&<div className="empty"><div className="orb">◉</div><strong>Camera preview</strong><span>Start your camera to begin face tracking.</span></div>}<div className={"live "+(running?"on":"")}>● {running?"LIVE":"OFFLINE"}</div></div>
   <aside>
    <div className="card"><div className="cardtitle">1 · Permission</div><label className="check"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/><span>I have permission to use the selected source face.</span></label></div>
    <div className="card"><div className="cardtitle">2 · Source face</div><label className="upload">{sourceUrl?<img src={sourceUrl} alt="Selected source"/>:<div className="uploadicon">＋</div>}<span>{sourceUrl?"Replace source image":"Choose a face image"}</span><input type="file" accept="image/*" onChange={upload}/></label><small className="hint">Use a clear, front-facing image you are authorized to use.</small></div>
    <div className="card"><div className="cardtitle">3 · Camera</div><button className="primary" onClick={running?stop:start}>{running?"Stop camera":"Start camera"}</button><div className="row"><span>Mirror preview</span><button className={"switch "+(mirror?"active":"")} onClick={()=>setMirror(!mirror)}><i/></button></div></div>
    <div className="status"><span className={ready?"dot ready":"dot"}/>{status}</div>
   </aside>
  </section>
  <footer><span>Built for browser-based video experiences.</span><span>Native WhatsApp/Instagram calls require a virtual-camera bridge; this web app cannot directly replace a native app camera stream.</span></footer>
 </main>
}