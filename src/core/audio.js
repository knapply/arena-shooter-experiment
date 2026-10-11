/* ============ audio ============ */
let AC=null,master=null;
function audio(){if(AC){if(AC.state==="suspended")AC.resume();return;}try{AC=new (window.AudioContext||window.webkitAudioContext)();master=AC.createGain();master.gain.value=SET.master*SET.sfx;master.connect(AC.destination);}catch(e){}}
let NOISE=null;function noise(){if(!NOISE){NOISE=[];for(let k=0;k<3;k++){const b=AC.createBuffer(1,AC.sampleRate,AC.sampleRate);const d=b.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;NOISE.push(b);}}const s=AC.createBufferSource();s.buffer=NOISE[(Math.random()*3)|0];return s;}
function env(g,t,peak,dur,attack=.003){g.gain.setValueAtTime(0.0001,t);g.gain.exponentialRampToValueAtTime(Math.max(.0002,peak),t+attack);g.gain.exponentialRampToValueAtTime(.0001,t+dur);}
function nz(t,dur,type,freq,peak,q=1,attack){const n=noise();const f=AC.createBiquadFilter();f.type=type;f.frequency.value=freq;f.Q.value=q;const g=AC.createGain();n.connect(f);f.connect(g);g.connect(master);env(g,t,peak,dur,attack);n.start(t,Math.random()*Math.max(0,.97-dur),Math.min(1,dur+.03));return f;}
function tone(t,type,f0,f1,dur,peak,attack){const o=AC.createOscillator();o.type=type;o.frequency.setValueAtTime(f0,t);if(f1!==f0)o.frequency.exponentialRampToValueAtTime(f1,t+dur);const g=AC.createGain();o.connect(g);g.connect(master);env(g,t,peak,dur,attack);o.start(t);o.stop(t+dur+.05);return o;}
const SFX_LAST={};let sfxVoices=0,sfxVoiceT=0;
function sfx(kind,vol=1){if(!AC||vol<=.01)return;const t=AC.currentTime;if(t-(SFX_LAST[kind]||-1)<.016)return;SFX_LAST[kind]=t;if(t-sfxVoiceT>.1){sfxVoiceT=t;sfxVoices=0;}if(++sfxVoices>14&&vol<.5)return;
  try{switch(kind){
  case"shot":nz(t,.08,"bandpass",1800,.2*vol,1);tone(t,"square",220,60,.07,.06*vol);break;
  case"crumble":nz(t,.9,"lowpass",420,.55*vol,1,.01);nz(t,.35,"bandpass",1600,.18*vol,1.5);tone(t,"sine",70,40,.6,.3*vol);break;
  case"boom":tone(t,"sine",95,26,1,.75*vol,.005);nz(t,.7,"lowpass",650,.6*vol);nz(t,.18,"highpass",2400,.22*vol);break;
  case"stick":tone(t,"sine",900,1500,.14,.07*vol);nz(t,.1,"bandpass",4000,.05*vol,3);break;
  case"clink":tone(t,"triangle",2600,2300,.05,.05*vol);break;
  case"sshot":nz(t,.22,"bandpass",900,.55*vol,.8);tone(t,"sawtooth",190,38,.35,.16*vol);nz(t,1.1,"lowpass",260,.3*vol,1,.02);break;
  case"pshot":nz(t,.12,"bandpass",1100,.32*vol,1);tone(t,"square",160,45,.1,.09*vol);nz(t,.2,"lowpass",500,.12*vol);break;
  case"thrust":{const f=nz(t,.4,"lowpass",3000,.28*vol,1,.01);f.frequency.exponentialRampToValueAtTime(300,t+.38);tone(t,"sawtooth",90,55,.3,.05*vol,.02);break;}
  case"slam":tone(t,"sine",120,30,.55,.55*vol);nz(t,.35,"lowpass",900,.4*vol);break;
  case"whoosh":{const f=nz(t,.35,"bandpass",400,.22*vol,2,.05);f.frequency.exponentialRampToValueAtTime(2400,t+.3);break;}
  case"hit":tone(t,"triangle",1400,1400,.05,.08*vol);break;
  case"hitsh":tone(t,"triangle",2100,1700,.06,.06*vol);nz(t,.06,"highpass",5000,.05*vol);break;
  case"charge":tone(t,"sawtooth",140,480,.55,.05*vol,.02);break;
  case"hurt":tone(t,"square",90,80,.1,.06*vol);break;
  case"shieldhit":nz(t,.14,"bandpass",3600,.13*vol,4);tone(t,"sine",1650,1300,.12,.04*vol);break;
  case"pop":nz(t,.25,"highpass",2500,.3*vol);tone(t,"sawtooth",1300,180,.35,.12*vol);tone(t,"sine",90,40,.3,.25*vol);break;
  case"recharge":tone(t,"sine",280,1250,.9,.09*vol,.05);tone(t,"triangle",560,2500,.9,.03*vol,.05);break;
  case"alarm":tone(t,"square",880,880,.07,.035*vol);break;
  case"step":nz(t,.07,"lowpass",420,.22*vol,1);nz(t,.03,"highpass",3000,.03*vol);break;
  case"land":nz(t,.16,"lowpass",300,.4*vol);tone(t,"sine",80,45,.15,.2*vol);break;
  case"magout":tone(t,"square",700,500,.03,.05*vol);nz(t,.09,"bandpass",2200,.08*vol,3);break;
  case"magin":tone(t,"square",1100,900,.025,.07*vol);nz(t,.05,"lowpass",600,.2*vol);break;
  case"slap":tone(t,"square",1500,1200,.02,.06*vol);tone(t+.07,"square",1300,1000,.02,.06*vol);nz(t+.07,.04,"lowpass",800,.15*vol);break;
  case"slide":{const f=nz(t,.6,"bandpass",900,.12*vol,.7,.02);f.frequency.exponentialRampToValueAtTime(250,t+.6);break;}
  case"clamber":nz(t,.12,"lowpass",500,.25*vol);tone(t,"square",300,280,.03,.03*vol);break;
  case"stinger":tone(t,"sine",65,58,.7,.18*vol,.08);nz(t,.5,"lowpass",300,.08*vol,1,.1);break;
  case"swing":{const f=nz(t,.18,"bandpass",700,.18*vol,2,.02);f.frequency.exponentialRampToValueAtTime(1800,t+.15);break;}
  }}catch(e){}
}
function distVol(p,max=40){return clamp(1-camera.position.distanceTo(p)/max,0,1);}
