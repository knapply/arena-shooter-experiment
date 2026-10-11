/* ===== Trailer score: an original piece synthesized live with Web Audio (no samples).
   Choir chant over a drone -> synthwave drop -> lead theme -> breakdown -> title hit.
   score(ctx, out, t0) schedules everything on any AudioContext, including OfflineAudioContext for rendering to a file. ===== */
(function(){
const BPM=120,BEAT=60/BPM,BAR=BEAT*4;
const midi=s=>{const m=/^([A-G])(#|b)?(-?\d)$/.exec(s);return 12*(+m[3]+1)+{C:0,D:2,E:4,F:5,G:7,A:9,B:11}[m[1]]+(m[2]==="#"?1:m[2]==="b"?-1:0);};
const hz=n=>440*Math.pow(2,((typeof n==="string"?midi(n):n)-69)/12);
const LENGTH=BAR*32+4;
/* chord tones for each bar of the drop and theme (D minor: i - VI - III - VII) */
const PROG=[["D3","F3","A3"],["Bb2","D3","F3"],["F3","A3","C4"],["C3","E3","G3"]];
const ROOT=["D2","Bb1","F2","C2"];
function score(ctx,out,t0){
  const sr=ctx.sampleRate;
  /* ---------- shared buses ---------- */
  const comp=ctx.createDynamicsCompressor();comp.threshold.value=-12;comp.knee.value=8;comp.ratio.value=4;comp.attack.value=.004;comp.release.value=.2;
  const master=ctx.createGain();master.gain.value=.82;comp.connect(master);master.connect(out);
  const bus=ctx.createGain();bus.connect(comp);
  const verb=ctx.createConvolver();{const len=Math.floor(sr*3.4),ir=ctx.createBuffer(2,len,sr);for(let c=0;c<2;c++){const d=ir.getChannelData(c);for(let i=0;i<len;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/len,2.6);}verb.buffer=ir;}
  const verbIn=ctx.createGain();verbIn.gain.value=.5;verbIn.connect(verb);verb.connect(comp);
  const dly=ctx.createDelay(1);dly.delayTime.value=BEAT*.75;const fb=ctx.createGain();fb.gain.value=.34;const dlf=ctx.createBiquadFilter();dlf.type="lowpass";dlf.frequency.value=2600;
  dly.connect(dlf);dlf.connect(fb);fb.connect(dly);const dlyIn=ctx.createGain();dlyIn.gain.value=.35;dlyIn.connect(dly);dlf.connect(bus);
  let NB=null;const noise=()=>{if(!NB){NB=ctx.createBuffer(1,sr*2,sr);const d=NB.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;}const s=ctx.createBufferSource();s.buffer=NB;s.loop=true;return s;};
  const at=x=>t0+x;
  const gainEnv=(g,t,a,peak,hold,rel)=>{g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(peak,t+a);g.gain.setValueAtTime(peak,t+a+hold);g.gain.exponentialRampToValueAtTime(.0005,t+a+hold+rel);};
  const send=(node,dry,wet,dl)=>{const g=ctx.createGain();g.gain.value=dry;node.connect(g);g.connect(bus);if(wet){const w=ctx.createGain();w.gain.value=wet;node.connect(w);w.connect(verbIn);}if(dl){const d=ctx.createGain();d.gain.value=dl;node.connect(d);d.connect(dlyIn);}};
  /* ---------- instruments ---------- */
  const VOWEL={ah:[730,1090,2440],oh:[570,840,2410],oo:[400,800,2300]};
  /* choir voice: detuned saws through a formant filter bank with slow attack and vibrato */
  function choir(t,note,dur,vel=.12,vowel="ah",wet=.9){const f=hz(note);const g=ctx.createGain();const sum=ctx.createGain();sum.gain.value=.33;
    const lfo=ctx.createOscillator();lfo.frequency.value=5.1;const lg=ctx.createGain();lg.gain.setValueAtTime(0,t);lg.gain.linearRampToValueAtTime(f*.006,t+.8);lfo.connect(lg);lfo.start(t);lfo.stop(t+dur+1.2);
    for(const d of[-7,0,6]){const o=ctx.createOscillator();o.type="sawtooth";o.frequency.value=f*Math.pow(2,d/1200);lg.connect(o.frequency);o.connect(sum);o.start(t);o.stop(t+dur+1.2);}
    const F=VOWEL[vowel];[1,.5,.2].forEach((a,i)=>{const bp=ctx.createBiquadFilter();bp.type="bandpass";bp.frequency.value=F[i];bp.Q.value=i?6:4.5;const ga=ctx.createGain();ga.gain.value=a*2.2;sum.connect(bp);bp.connect(ga);ga.connect(g);});
    /* chest resonance: keeps the sung fundamental and low partials that the vowel filters remove */
    {const lp=ctx.createBiquadFilter();lp.type="lowpass";lp.frequency.value=Math.min(900,f*3.2);lp.Q.value=.6;const ga=ctx.createGain();ga.gain.value=.55;sum.connect(lp);lp.connect(ga);ga.connect(g);}
    gainEnv(g,t,.38,vel,Math.max(0,dur-.38),.9);send(g,.55,wet);}
  function drone(t,note,dur,vel=.08){const f=hz(note);const g=ctx.createGain();
    for(const [type,m,a] of[["sine",1,1],["triangle",2,.35],["sine",.5,.6]]){const o=ctx.createOscillator();o.type=type;o.frequency.value=f*m;const ga=ctx.createGain();ga.gain.value=a;o.connect(ga);ga.connect(g);o.start(t);o.stop(t+dur+2.5);}
    gainEnv(g,t,1.6,vel,Math.max(0,dur-1.6),2);send(g,.8,.5);}
  function taiko(t,vel=1){const o=ctx.createOscillator();o.type="sine";o.frequency.setValueAtTime(110,t);o.frequency.exponentialRampToValueAtTime(42,t+.45);const g=ctx.createGain();gainEnv(g,t,.004,.75*vel,.02,.6);o.connect(g);o.start(t);o.stop(t+.8);send(g,.9,.35);
    const n=noise(),lp=ctx.createBiquadFilter();lp.type="lowpass";lp.frequency.value=380;const ng=ctx.createGain();gainEnv(ng,t,.002,.45*vel,0,.18);n.connect(lp);lp.connect(ng);n.start(t);n.stop(t+.3);send(ng,.8,.3);}
  function kick(t,vel=1){const o=ctx.createOscillator();o.type="sine";o.frequency.setValueAtTime(155,t);o.frequency.exponentialRampToValueAtTime(44,t+.11);const g=ctx.createGain();gainEnv(g,t,.002,.95*vel,.03,.32);o.connect(g);o.start(t);o.stop(t+.45);send(g,1,0);
    const c=noise(),hp=ctx.createBiquadFilter();hp.type="highpass";hp.frequency.value=2500;const cg=ctx.createGain();gainEnv(cg,t,.001,.12*vel,0,.02);c.connect(hp);hp.connect(cg);c.start(t);c.stop(t+.05);send(cg,1,0);}
  function snare(t,vel=1){const n=noise(),bp=ctx.createBiquadFilter();bp.type="bandpass";bp.frequency.value=1900;bp.Q.value=.55;const g=ctx.createGain();gainEnv(g,t,.002,.5*vel,.01,.2);n.connect(bp);bp.connect(g);n.start(t);n.stop(t+.3);send(g,.8,.45);
    const o=ctx.createOscillator();o.type="triangle";o.frequency.setValueAtTime(210,t);o.frequency.exponentialRampToValueAtTime(150,t+.08);const og=ctx.createGain();gainEnv(og,t,.002,.35*vel,0,.1);o.connect(og);o.start(t);o.stop(t+.15);send(og,.8,.2);}
  function hat(t,vel=1,open=false){const n=noise(),hp=ctx.createBiquadFilter();hp.type="highpass";hp.frequency.value=7200;const g=ctx.createGain();gainEnv(g,t,.001,.13*vel,0,open?.22:.045);n.connect(hp);hp.connect(g);n.start(t);n.stop(t+.3);send(g,.7,.05);}
  function tom(t,note,vel=1){const o=ctx.createOscillator();o.type="sine";const f=hz(note);o.frequency.setValueAtTime(f*1.6,t);o.frequency.exponentialRampToValueAtTime(f,t+.12);const g=ctx.createGain();gainEnv(g,t,.002,.6*vel,.02,.42);o.connect(g);o.start(t);o.stop(t+.6);send(g,.85,.5);}
  /* synthwave bass: saw + sub through a plucky lowpass, lightly driven */
  const shaper=ctx.createWaveShaper();{const c=new Float32Array(1024);for(let i=0;i<1024;i++){const x=i/511.5-1;c[i]=Math.tanh(x*2.2);}shaper.curve=c;}const bassBus=ctx.createGain();bassBus.gain.value=.5;bassBus.connect(shaper);shaper.connect(bus);
  function bass(t,note,dur,vel=1){const f=hz(note);const lp=ctx.createBiquadFilter();lp.type="lowpass";lp.Q.value=6;lp.frequency.setValueAtTime(220,t);lp.frequency.linearRampToValueAtTime(1500*vel,t+.012);lp.frequency.exponentialRampToValueAtTime(260,t+dur*.9);
    const g=ctx.createGain();gainEnv(g,t,.004,.5*vel,dur*.5,dur*.45);
    for(const [type,m,a] of[["sawtooth",1,.7],["square",.5,.5]]){const o=ctx.createOscillator();o.type=type;o.frequency.value=f*m;const ga=ctx.createGain();ga.gain.value=a;o.connect(ga);ga.connect(lp);o.start(t);o.stop(t+dur+.1);}
    lp.connect(g);g.connect(bassBus);}
  /* gated pad, ducked on every beat like a sidechained synth */
  function pad(t,notes,dur,vel=.05){const g=ctx.createGain();const lp=ctx.createBiquadFilter();lp.type="lowpass";lp.frequency.value=2100;lp.Q.value=.7;lp.connect(g);
    for(const n of notes)for(const d of[-9,9]){const o=ctx.createOscillator();o.type="sawtooth";o.frequency.value=hz(n)*Math.pow(2,d/1200);o.connect(lp);o.start(t);o.stop(t+dur+.4);}
    g.gain.setValueAtTime(0,t);for(let b=0;b<dur/BEAT-.01;b++){const bt=t+b*BEAT;g.gain.setValueAtTime(vel*.18,bt);g.gain.linearRampToValueAtTime(vel,bt+BEAT*.7);}
    g.gain.setValueAtTime(vel,t+dur);g.gain.exponentialRampToValueAtTime(.0005,t+dur+.35);send(g,.75,.35);}
  function pluck(t,note,vel=.1){const o=ctx.createOscillator();o.type="square";o.frequency.value=hz(note);const lp=ctx.createBiquadFilter();lp.type="lowpass";lp.frequency.setValueAtTime(4200,t);lp.frequency.exponentialRampToValueAtTime(600,t+.16);
    const g=ctx.createGain();gainEnv(g,t,.002,vel,0,.17);o.connect(lp);lp.connect(g);o.start(t);o.stop(t+.25);send(g,.55,.2,.9);}
  /* lead: one continuous voice with glide, detuned saws plus a square an octave down, vibrato, delay and reverb */
  function lead(t,line,vel=.11){const g=ctx.createGain();const lp=ctx.createBiquadFilter();lp.type="lowpass";lp.frequency.value=3400;lp.Q.value=1.2;lp.connect(g);
    const oscs=[["sawtooth",1,-8,.5],["sawtooth",1,8,.5],["square",.5,0,.32]].map(([type,m,det,a])=>{const o=ctx.createOscillator();o.type=type;o.detune.value=det;const ga=ctx.createGain();ga.gain.value=a;o.connect(ga);ga.connect(lp);return[o,m];});
    const lfo=ctx.createOscillator();lfo.frequency.value=5.6;const lg=ctx.createGain();lg.gain.value=0;lfo.connect(lg);for(const[o]of oscs)lg.connect(o.detune);
    let x=t;g.gain.setValueAtTime(0,t);
    for(const[n,beats]of line){const d=beats*BEAT;if(n){for(const[o,m]of oscs){o.frequency.setTargetAtTime(hz(n)*m,x,.025);}g.gain.setTargetAtTime(vel,x,.02);lg.gain.setValueAtTime(0,x);lg.gain.linearRampToValueAtTime(d>.6?14:0,x+Math.min(d,.5));}
      else g.gain.setTargetAtTime(0,x,.04);x+=d;}
    g.gain.setTargetAtTime(0,x,.15);for(const[o]of oscs){o.start(t);o.stop(x+1.5);}lfo.start(t);lfo.stop(x+1.5);send(g,.7,.4,.55);return x;}
  /* trailer sound design */
  function boom(t,vel=1){const o=ctx.createOscillator();o.type="sine";o.frequency.setValueAtTime(70,t);o.frequency.exponentialRampToValueAtTime(24,t+1.6);const g=ctx.createGain();gainEnv(g,t,.005,.9*vel,.1,2.4);o.connect(g);o.start(t);o.stop(t+3);send(g,.9,.6);
    const n=noise(),lp=ctx.createBiquadFilter();lp.type="lowpass";lp.frequency.setValueAtTime(2400,t);lp.frequency.exponentialRampToValueAtTime(120,t+1.5);const ng=ctx.createGain();gainEnv(ng,t,.003,.55*vel,.05,1.6);n.connect(lp);lp.connect(ng);n.start(t);n.stop(t+2);send(ng,.6,.8);}
  function braam(t,dur=2.6,vel=.22){const g=ctx.createGain();const lp=ctx.createBiquadFilter();lp.type="lowpass";lp.Q.value=4;lp.frequency.setValueAtTime(180,t);lp.frequency.exponentialRampToValueAtTime(1600,t+.35);lp.frequency.exponentialRampToValueAtTime(300,t+dur);lp.connect(g);
    for(const n of["D1","D2","A2","D3"])for(const d of[-12,0,12]){const o=ctx.createOscillator();o.type="sawtooth";o.frequency.value=hz(n);o.detune.value=d;o.connect(lp);o.start(t);o.stop(t+dur+.5);}
    gainEnv(g,t,.06,vel,dur*.4,dur*.6);g.connect(shaper);send(g,.4,.6);}
  function riser(t,dur,vel=.3){const n=noise(),bp=ctx.createBiquadFilter();bp.type="bandpass";bp.Q.value=2.5;bp.frequency.setValueAtTime(250,t);bp.frequency.exponentialRampToValueAtTime(7000,t+dur);const g=ctx.createGain();g.gain.setValueAtTime(.0005,t);g.gain.exponentialRampToValueAtTime(vel,t+dur);g.gain.setValueAtTime(0,t+dur+.01);n.connect(bp);bp.connect(g);n.start(t);n.stop(t+dur+.05);send(g,.7,.6);
    const o=ctx.createOscillator();o.type="sawtooth";o.frequency.setValueAtTime(110,t);o.frequency.exponentialRampToValueAtTime(880,t+dur);const og=ctx.createGain();og.gain.setValueAtTime(.0005,t);og.gain.exponentialRampToValueAtTime(vel*.18,t+dur);og.gain.setValueAtTime(0,t+dur+.01);o.connect(og);o.start(t);o.stop(t+dur+.05);send(og,.6,.4);}
  function whoosh(t,vel=.2){const n=noise(),bp=ctx.createBiquadFilter();bp.type="bandpass";bp.Q.value=1.6;bp.frequency.setValueAtTime(300,t);bp.frequency.exponentialRampToValueAtTime(3000,t+.35);const g=ctx.createGain();gainEnv(g,t,.18,vel,0,.3);n.connect(bp);bp.connect(g);n.start(t);n.stop(t+.6);send(g,.6,.3);}

  /* ================= arrangement (beats at 120 BPM; bar = 2 s) ================= */
  const B=b=>at(b*BEAT);
  /* A: chant (bars 1-8) */
  drone(at(0),"D2",16,.09);drone(at(0),"A2",16,.05);
  const chant=[["D3",2],["F3",1],["G3",1],["A3",2],["G3",1],["F3",1],["E3",1],["F3",1],["D3",2],["C3",2],["D3",2]];
  let b=0;for(const[n,l]of chant){choir(B(b),n,l*BEAT,.15,"ah");b+=l;}
  b=16;const chant2=[["D3",2],["F3",1],["G3",1],["A3",2],["C4",1],["A3",1],["G3",2],["F3",1],["E3",1],["D3",4]];
  for(const[n,l]of chant2){choir(B(b),n,l*BEAT,.15,"ah");choir(B(b),midi(n)+7,l*BEAT,.09,"oh");choir(B(b),midi(n)-12,l*BEAT,.07,"oh");b+=l;}
  for(let k=16;k<32;k+=2)taiko(B(k),.35+(k-16)*.04);for(const k of[29,29.5,30,30.5,31,31.25,31.5,31.75])taiko(B(k),.7);
  riser(B(24),BEAT*7.6,.32);
  /* B: drop (bars 9-16) */
  boom(B(32),1.1);braam(B(32),3);
  for(let bar=8;bar<16;bar++){const i=bar%4,t=bar*4;
    pad(B(t),PROG[i].map(n=>midi(n)+12),BAR,.045);choir(B(t),midi(PROG[i][0])+12,BAR,.045,"ah",.8);
    for(let s=0;s<8;s++)bass(B(t+s*.5),midi(ROOT[i])+(s%4===2?12:0),BEAT*.48,s%2?.75:1);
    for(let q=0;q<4;q++){kick(B(t+q));hat(B(t+q+.5),.8,q===3);if(q%2)snare(B(t+q));}
    const ar=[...PROG[i],...PROG[i].map(n=>midi(n)+12)].map(n=>typeof n==="string"?midi(n):n);
    for(let s=0;s<16;s++)if(bar>=10)pluck(B(t+s*.25),ar[[0,1,2,3,4,5,4,3][s%8]]+12,.07);}
  /* C: theme (bars 17-24) */
  const theme=[["A4",1],["D5",1],["E5",.5],["F5",1.5],["E5",1],["D5",1],["C5",.5],["D5",1.5],["C5",1],["A4",1],["F4",.5],["A4",1.5],["G4",2],["E4",1],["G4",1],
               ["A4",1],["D5",1],["E5",.5],["F5",1.5],["G5",1],["F5",1],["E5",.5],["D5",1.5],["C5",1],["F5",1],["A5",1],["G5",1],["E5",3],[null,1]];
  lead(B(64),theme,.1);
  for(let bar=16;bar<24;bar++){const i=bar%4,t=bar*4;
    pad(B(t),PROG[i].map(n=>midi(n)+12),BAR,.05);choir(B(t),midi(PROG[i][1])+12,BAR,.045,"oh",.8);choir(B(t),midi(PROG[i][0]),BAR,.045,"ah",.8);
    for(let s=0;s<8;s++)bass(B(t+s*.5),midi(ROOT[i])+(s%4===2?12:0),BEAT*.48,s%2?.75:1);
    for(let q=0;q<4;q++){kick(B(t+q));hat(B(t+q+.5),.9,q===3);hat(B(t+q+.25),.4);hat(B(t+q+.75),.4);if(q%2)snare(B(t+q));}
    if(bar%4===3){tom(B(t+3),"A2");tom(B(t+3.25),"F2");tom(B(t+3.5),"D2");tom(B(t+3.75),"A1");}}
  /* D: breakdown (bars 25-28), half-time drums and a full choir */
  boom(B(96),.8);const BD=[["G2","Bb2","D3"],["Bb2","D3","F3"],["A2","C#3","E3"],["A2","C#3","E3"]];
  for(let k=0;k<4;k++){const t=96+k*4;for(const n of BD[k]){choir(B(t),midi(n)+12,BAR,.08,"ah");choir(B(t),midi(n),BAR,.06,"oh");}pad(B(t),BD[k].map(n=>midi(n)+12),BAR,.03);
    taiko(B(t),.9);taiko(B(t+2.5),.6);snare(B(t+2),.6);bass(B(t),midi(BD[k][0])-12,BAR*.9,.7);}
  lead(B(104),[["E5",2],["F5",1],["G5",1],["A5",3],["C#5",1]],.08);riser(B(104),BEAT*7.8,.38);
  /* E: title hit (bars 29-32) */
  boom(B(112),1.3);braam(B(112),4.5,.26);
  for(const n of["D3","F3","A3","E4"]){choir(B(112),n,BAR*2,.11,"ah");choir(B(112),midi(n)-12,BAR*2,.07,"oh");}
  pad(B(112),["D4","F4","A4","E5"],BAR*2,.05);drone(B(112),"D2",BAR*3,.1);
  for(const k of[120,121,122,122.5,123])taiko(B(k),1);for(const k of[120,121,122,122.5,123]){bass(B(k),midi("D2"),BEAT*.4,1);}
  boom(B(124),1.4);braam(B(124),3.5,.3);for(const n of["D3","A3","D4","F4"])choir(B(124),n,BAR*1.5,.1,"ah");
  /* scene-change whooshes */
  for(const k of[8,16,20,24,28,36,40,44,48,52,56,60,72,80,88])whoosh(B(k)-.25,.12);
  master.gain.setValueAtTime(.82,t0+LENGTH-1.2);master.gain.linearRampToValueAtTime(0,t0+LENGTH);
  return LENGTH;}
const api={score,BPM,BEAT,BAR,LENGTH};
if(window.KA)window.KA.trailerScore=api;else window.TRAILER_SCORE=api;
})();
