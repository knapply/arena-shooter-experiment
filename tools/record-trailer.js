/* Re-record the trailer video from the current build.
   Needs Playwright, ffmpeg and three.js r128 (THREE_PATH). Software WebGL is fine; it takes ~30 min.
     THREE_PATH=/path/to/three.min.js node tools/record-trailer.js
   Output: media/trailer.mp4 (1280x720, 30 fps, with the score) and media/trailer-preview.gif */
const {launch,open,ROOT}=require("../tests/lib/browser.js");const fs=require("fs"),path=require("path"),{execFileSync}=require("child_process");
const FPS=30,W=1280,H=720,TMP=fs.mkdtempSync(path.join(require("os").tmpdir(),"trailer-"));
(async()=>{const b=await launch({gpu:true});const ctx=await b.newContext({viewport:{width:W,height:H}});const p=await open(ctx,{realThree:true});await p.waitForTimeout(2000);
  /* 1. the score, rendered offline to a 16-bit WAV */
  const wav=await p.evaluate(async()=>{const S=KA.trailerScore,sr=44100,oc=new OfflineAudioContext(2,Math.ceil(sr*S.LENGTH),sr);S.score(oc,oc.destination,0);const buf=await oc.startRendering();
    const L=buf.getChannelData(0),R=buf.getChannelData(1),n=L.length;let peak=0;for(let i=0;i<n;i++)peak=Math.max(peak,Math.abs(L[i]),Math.abs(R[i]));const g=peak?Math.min(1,.89/peak):1;
    const v=new DataView(new ArrayBuffer(44+n*4)),ws=(o,s)=>{for(let i=0;i<s.length;i++)v.setUint8(o+i,s.charCodeAt(i));};
    ws(0,"RIFF");v.setUint32(4,36+n*4,true);ws(8,"WAVE");ws(12,"fmt ");v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,2,true);v.setUint32(24,sr,true);v.setUint32(28,sr*4,true);v.setUint16(32,4,true);v.setUint16(34,16,true);ws(36,"data");v.setUint32(40,n*4,true);
    for(let i=0;i<n;i++){v.setInt16(44+i*4,Math.max(-1,Math.min(1,L[i]*g))*32767,true);v.setInt16(46+i*4,Math.max(-1,Math.min(1,R[i]*g))*32767,true);}
    const u=new Uint8Array(v.buffer);let s="";for(let i=0;i<u.length;i+=32768)s+=String.fromCharCode.apply(null,u.subarray(i,i+32768));return btoa(s);});
  fs.writeFileSync(path.join(TMP,"score.wav"),Buffer.from(wav,"base64"));
  /* 2. picture: step the timeline at a fixed rate and capture each frame, overlays included */
  await p.evaluate(()=>{KA.SET.dynRes=false;KA.SET.renderScale=1;KA.SET.upscale="native";KA.applySettings();KA.trailer.record();});
  const END=await p.evaluate(()=>KA.trailer.END),N=Math.ceil(END*FPS);
  for(let i=0;i<N;i++){await p.evaluate(dt=>KA.trailer.step(dt),1/FPS);await p.screenshot({path:path.join(TMP,String(i).padStart(5,"0")+".jpg"),type:"jpeg",quality:93});if(i%150===0)console.log(`frame ${i}/${N}`);}
  if(p.errors.length)console.error(p.errors);await b.close();
  /* 3. encode */
  const out=path.join(ROOT,"media");fs.mkdirSync(out,{recursive:true});
  execFileSync("ffmpeg",["-loglevel","error","-y","-framerate",String(FPS),"-i",path.join(TMP,"%05d.jpg"),"-i",path.join(TMP,"score.wav"),"-t",String(END),"-c:v","libx264","-preset","slow","-crf","21","-pix_fmt","yuv420p",
    "-c:a","aac","-b:a","192k","-af",`afade=t=out:st=${END-1.6}:d=1.6`,"-movflags","+faststart",path.join(out,"trailer.mp4")],{stdio:"inherit"});
  execFileSync("ffmpeg",["-loglevel","error","-y","-ss","14.4","-t","10","-i",path.join(out,"trailer.mp4"),"-vf","fps=12,scale=560:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle",path.join(out,"trailer-preview.gif")],{stdio:"inherit"});
  fs.rmSync(TMP,{recursive:true,force:true});console.log("wrote media/trailer.mp4 and media/trailer-preview.gif");})();
