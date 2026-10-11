/* ============ pilot rig: procedural skeleton, two-bone IK limbs, distance-synced directional gait, ground-adaptive feet, spring secondary motion ============ */
const DOWN=new V3(0,-1,0);
const _a=new V3(),_b=new V3(),_c=new V3(),_q1=new THREE.Quaternion(),_q2=new THREE.Quaternion(),_m1=new THREE.Matrix4(),_e1=new THREE.Euler(),_pole=new V3(),_lk=new V3(),_rk=new V3(),_kA=new V3(),_kB=new V3(),_dl=new V3();
function solve2(up,lo,a,b,S,T,pole){
  const u=_a.subVectors(T,S);let d=u.length();if(d<1e-4)return;u.multiplyScalar(1/d);
  d=clamp(d,Math.abs(a-b)+.01,a+b-.002);
  const p=_b.copy(pole).addScaledVector(u,-pole.dot(u));if(p.lengthSq()<1e-6)p.set(0,0,1);p.normalize();
  const ca=(a*a+d*d-b*b)/(2*a*d),sa=Math.sqrt(Math.max(0,1-ca*ca));
  const e=_c.copy(u).multiplyScalar(a*ca).addScaledVector(p,a*sa);
  _dl.copy(u).multiplyScalar(d).sub(e).normalize();
  e.normalize();up.quaternion.setFromUnitVectors(DOWN,e);
  _q1.copy(up.quaternion).invert();_dl.applyQuaternion(_q1);lo.quaternion.setFromUnitVectors(DOWN,_dl);
}
function capsule(r,len,seg=10){const pts=[];const half=Math.max(0,len/2-r);
  for(let i=0;i<=5;i++){const a=-Math.PI/2+i*(Math.PI/2)/5;pts.push(new THREE.Vector2(Math.max(1e-4,Math.cos(a)*r),-half+Math.sin(a)*r));}
  for(let i=0;i<=5;i++){const a=i*(Math.PI/2)/5;pts.push(new THREE.Vector2(Math.max(1e-4,Math.cos(a)*r),half+Math.sin(a)*r));}
  return new THREE.LatheGeometry(pts,seg);}
const GEO={};const geo=(k,f)=>{if(!GEO[k]){GEO[k]=f();GEO[k].userData.k=k;}return GEO[k];};
const CAST=new Set(["chest","abs","thigh","shin","helm","farm","pel","thighPl","shinPl","gaunt","pack"]);
function shieldMaterial(){return new THREE.ShaderMaterial({uniforms:{uI:{value:0},uT:{value:0},uC:{value:new THREE.Color("#ffd36b")}},transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
  vertexShader:"varying vec3 vN;varying vec3 vV;varying vec3 vP;void main(){vec4 mv=modelViewMatrix*vec4(position,1.);vN=normalize(normalMatrix*normal);vV=normalize(-mv.xyz);vP=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*mv;}",
  fragmentShader:"uniform float uI;uniform float uT;uniform vec3 uC;varying vec3 vN;varying vec3 vV;varying vec3 vP;void main(){float f=pow(1.-abs(dot(normalize(vN),normalize(vV))),1.5);float band=.5+.5*sin(vP.y*42.-uT*26.)*sin(vP.x*23.+vP.z*19.+uT*11.);float a=clamp(uI*(f*1.4+.2)*(.45+.55*band),0.,1.);gl_FragColor=vec4(uC*(1.+f*1.5),a);}"});}
const POSE={aim:{p:new V3(.1,.04,-.22),r:[0,0,0]},sprint:{p:new V3(.02,-.12,-.16),r:[-.5,.9,.45]},reload:{p:new V3(.08,-.02,-.22),r:[.22,.25,.65]},low:{p:new V3(.12,-.12,-.14),r:[-.7,.2,.2]}};
const GRIP=new V3(0,-.08,.1),FORE=new V3(0,-.06,-.17),PFORE=new V3(-.03,-.11,.1),MAGSLOT=new V3(0,-.11,-.08);
const RIG_RELOAD=[[0,"F"],[.12,[0,-.17,-.08]],[.3,[0,-.42,-.04]],[.45,[-.06,-.52,.1]],[.62,[0,-.36,-.08]],[.78,[0,-.18,-.08]],[.88,[.06,.06,.02]],[1,"F"]];
function reloadKey(keys,r,fore,out){for(let i=0;i<keys.length-1;i++){const[t0,a]=keys[i],[t1,b]=keys[i+1];if(r<=t1){let k=(r-t0)/(t1-t0);k=k*k*(3-2*k);const A=a==="F"?_kA.copy(fore):_kA.set(a[0],a[1],a[2]);const B=b==="F"?_kB.copy(fore):_kB.set(b[0],b[1],b[2]);return out.copy(A).lerp(B,k);}}return out.copy(fore);}
/* damped spring (substepped for stability at low frame rates) */
const spr=()=>({x:0,v:0});
function spring(s,t,dt,f,z){const w=6.2832*f;let n=Math.max(1,Math.ceil(dt*120));const h=dt/n;while(n--){s.v+=(w*w*(t-s.x)-2*z*w*s.v)*h;s.x+=s.v*h;}return s.x;}
const glowMat=new THREE.SpriteMaterial({color:0x9fdcff,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false});

function makePilot(color,label){
  /* layered look: dark flexible undersuit, team-colored hard armor plates over it, gunmetal trim, gold visor */
  const armorM=new THREE.MeshStandardMaterial({color,roughness:.46,metalness:.5});armorM.color.multiplyScalar(.62);
  const suitM=new THREE.MeshStandardMaterial({color:"#1b2125",roughness:.82,metalness:.1});
  const trimM=new THREE.MeshStandardMaterial({color:"#363f45",roughness:.42,metalness:.75});
  const visorM=new THREE.MeshStandardMaterial({color:"#6e4a16",emissive:"#ff9a2e",emissiveIntensity:.18,roughness:.08,metalness:.95});
  const shieldM=shieldMaterial();const shells=[];
  const add=(parent,g,mat,x,y,z,shell=true,sx,sy,sz)=>{const m=new THREE.Mesh(g,mat);m.position.set(x,y,z);if(sx)m.scale.set(sx,sy,sz);m.castShadow=CAST.has(g.userData.k);parent.add(m);
    if(shell){const s=new THREE.Mesh(g,shieldM);s.scale.setScalar(1.17);s.visible=false;s.renderOrder=5;m.add(s);shells.push(s);}return m;};
  const root=new THREE.Group(),pivot=new THREE.Group(),pelvis=new THREE.Group(),spine=new THREE.Group(),chest=new THREE.Group(),neck=new THREE.Group(),head=new THREE.Group();
  root.add(pivot);pivot.add(pelvis);pelvis.add(spine);spine.add(chest);chest.add(neck);neck.add(head);
  pelvis.position.y=.96;spine.position.y=.05;chest.position.y=.28;neck.position.y=.27;
  const bx=(k,w,h,d)=>geo(k,()=>new THREE.BoxGeometry(w,h,d));
  /* hips: suit, armored belt, codpiece, side plates */
  add(pelvis,bx("pel",.32,.18,.21),suitM,0,0,0);
  add(pelvis,bx("belt",.37,.07,.25),trimM,0,.06,0,false);
  add(pelvis,bx("cod",.15,.15,.05),armorM,0,-.04,-.12);
  for(const sd of[-1,1]){const hp=add(pelvis,bx("hipPl",.05,.16,.17),armorM,sd*.19,-.02,0,false);hp.rotation.z=sd*.12;}
  add(pelvis,bx("pouch",.1,.08,.06),trimM,.08,.04,.14,false);
  /* torso: suit core, layered chest plates, collar, jetpack with thruster nozzles */
  add(spine,geo("abs",()=>capsule(.125,.32)),suitM,0,.12,0);
  add(spine,bx("absPl",.2,.12,.04),armorM,0,.13,-.12,false);
  add(chest,bx("chest",.46,.28,.26),armorM,0,.1,-.01);
  {const pl=add(chest,bx("chestPl",.38,.17,.06),armorM,0,.13,-.15,false);pl.rotation.x=-.18;
   add(chest,bx("chestSeam",.4,.012,.05),trimM,0,.04,-.15,false);
   add(chest,bx("light",.05,.012,.012),visorM,.12,.17,-.185,false);}
  add(chest,bx("chest2",.34,.15,.22),suitM,0,-.08,-.01);
  add(chest,bx("collar",.3,.06,.24),trimM,0,.25,0,false);
  add(chest,bx("pack",.34,.36,.15),trimM,0,.08,.19,false);
  add(chest,bx("packRib",.36,.04,.17),armorM,0,.2,.19,false);
  const noz=geo("noz",()=>new THREE.CylinderGeometry(.04,.06,.12,10));
  add(chest,noz,trimM,-.1,-.12,.25,false);add(chest,noz,trimM,.1,-.12,.25,false);
  const glows=[-.1,.1].map(x=>{const s=new THREE.Sprite(glowMat.clone());s.position.set(x,-.22,.26);s.scale.set(.22,.34,1);chest.add(s);return s;});
  /* head: helmet shell, wide visor, cheek guards and crest */
  add(neck,geo("neck",()=>capsule(.06,.14)),suitM,0,.02,0,false);
  add(head,geo("helm",()=>new THREE.SphereGeometry(.15,20,14)),armorM,0,.13,.01,true,1,1.06,1.14);
  add(head,geo("visor",()=>new THREE.SphereGeometry(.12,20,12)),visorM,0,.135,-.075,false,1.12,.46,.78);
  for(const sd of[-1,1]){const ck=add(head,bx("cheek",.04,.09,.12),trimM,sd*.115,.06,-.06,false);ck.rotation.y=-sd*.35;}
  add(head,bx("crest",.035,.05,.2),armorM,0,.29,.02,false);
  add(head,bx("chin",.1,.04,.06),trimM,0,.03,-.12,false);
  const ear=bx("ear",.04,.06,.14);add(head,ear,trimM,.155,.12,.01,false);add(head,ear,trimM,-.155,.12,.01,false);
  /* arms: suit sleeves, big shoulder pauldrons, armored gauntlets */
  const arms=[-1,1].map(side=>{const sh=new THREE.Group();sh.position.set(side*.27,.17,0);chest.add(sh);
    add(sh,geo("pad",()=>new THREE.SphereGeometry(.11,14,10)),armorM,side*.025,.015,0,true,1.35,1,1.2);
    add(sh,bx("padRim",.05,.03,.2),trimM,side*.13,-.04,0,false);
    add(sh,geo("uarm",()=>capsule(.058,.3)),suitM,0,-.15,0);
    add(sh,bx("bicep",.07,.14,.09),armorM,side*.015,-.14,0,false);
    const el=new THREE.Group();el.position.y=-.30;sh.add(el);
    add(el,geo("elb",()=>new THREE.SphereGeometry(.058,10,8)),trimM,0,0,0,false);
    add(el,geo("farm",()=>capsule(.058,.27)),suitM,0,-.13,0);
    add(el,geo("gaunt",()=>capsule(.07,.17)),armorM,0,-.17,0,true,1,1,1.05);
    add(el,bx("gauntLt",.012,.08,.012),visorM,side*.07,-.18,0,false);
    const hand=new THREE.Group();hand.position.y=-.29;el.add(hand);
    add(hand,bx("hand",.08,.1,.09),suitM,0,-.03,0,false);
    add(hand,bx("knuck",.085,.03,.095),trimM,0,-.07,0,false);
    return{sh,el,side};});
  /* legs: suit with thigh plates, knee caps, shin guards and heavy boots */
  const legs=[-1,1].map(side=>{const hip=new THREE.Group();hip.position.set(side*.11,-.05,0);pelvis.add(hip);
    add(hip,geo("thigh",()=>capsule(.09,.44)),suitM,0,-.21,0);
    add(hip,bx("thighPl",.15,.27,.08),armorM,0,-.2,-.07);
    add(hip,bx("thighSd",.04,.22,.13),armorM,side*.085,-.2,0,false);
    const kn=new THREE.Group();kn.position.y=-.44;hip.add(kn);
    add(kn,geo("knee",()=>new THREE.SphereGeometry(.078,12,8)),armorM,0,0,-.045,false,1,1.1,.9);
    add(kn,geo("shin",()=>capsule(.074,.43)),suitM,0,-.21,0);
    add(kn,bx("shinPl",.13,.3,.07),armorM,0,-.19,-.06);
    const an=new THREE.Group();an.position.y=-.43;kn.add(an);
    add(an,bx("foot",.13,.09,.28),trimM,0,-.03,-.05,false);
    add(an,bx("toe",.13,.05,.09),armorM,0,-.0,-.15,false);
    return{hip,kn,an,side,cur:new V3(side*.12,-.89,0)};});
  const gun=new THREE.Group();chest.add(gun);gun.position.copy(POSE.aim.p);const rifleG=new THREE.Group(),pisG=new THREE.Group(),snpG=new THREE.Group();gun.add(rifleG);gun.add(pisG);gun.add(snpG);pisG.visible=false;snpG.visible=false;
  add(snpG,geo("sbody",()=>new THREE.BoxGeometry(.06,.09,.95)),trimM,0,0,-.18,false);add(snpG,geo("sscope",()=>new THREE.CylinderGeometry(.03,.03,.28,10)),trimM,0,.09,-.05,false).rotation.x=Math.PI/2;
  add(pisG,geo("pslide",()=>new THREE.BoxGeometry(.045,.05,.22)),trimM,0,.0,-.0,false);add(pisG,geo("pgrip",()=>new THREE.BoxGeometry(.04,.12,.055)),suitM,0,-.08,.09,false);
  add(rifleG,geo("gbody",()=>new THREE.BoxGeometry(.07,.1,.55)),trimM,0,0,-.05,false);
  add(rifleG,geo("gtop",()=>new THREE.BoxGeometry(.05,.05,.3)),armorM,0,.06,-.08,false);
  const bar=add(rifleG,geo("gbar",()=>new THREE.CylinderGeometry(.02,.02,.18,8)),trimM,0,.01,-.4,false);bar.rotation.x=Math.PI/2;
  add(rifleG,geo("gstock",()=>new THREE.BoxGeometry(.05,.1,.15)),trimM,0,-.02,.28,false);
  const mag=add(rifleG,geo("gmag",()=>new THREE.BoxGeometry(.045,.14,.07)),suitM,0,-.11,-.08,false);
  const c=document.createElement("canvas");c.width=256;c.height=64;const x=c.getContext("2d");
  const tagTex=new THREE.CanvasTexture(c);tagTex.encoding=THREE.sRGBEncoding;const tag=new THREE.Sprite(new THREE.SpriteMaterial({map:tagTex,depthTest:false,transparent:true}));
  tag.scale.set(1.8,.45,1);tag.position.y=2.25;root.add(tag);
  scene.add(root);
  /* animation state. Springs give lean, bounce, flinch and recoil some follow-through instead of linear blends. */
  const S={t:0,ph:0,pel:.96,twist:0,lh:new V3(-.2,-.1,-.3),rh:new V3(.1,-.1,-.2),sh:70,uI:0,shellVis:false,deadT:0,lastR:-1,
    hip:0,air:false,vy:0,lf:0,yaw:null,accF:0,turn:0,vx:0,vz:0,gL:0,gR:0,lastKick:-9,
    spP:spr(),spLean:spr(),spRoll:spr(),spFl:spr(),spFr:spr(),spKick:spr(),fall:null};
  const yawOf=()=>S.yaw==null?root.rotation.y:S.yaw;
  /* direction of a world point in this pilot's frame: x = right, z = back */
  const localDir=(wx,wz,out)=>{const y=yawOf(),c=Math.cos(y),s=Math.sin(y);return out.set(wx*c-wz*s,0,wx*s+wz*c);};
  const rig={root,dead:false,S,color,
    setLabel(t,sub){x.clearRect(0,0,256,64);x.font="600 28px Chakra Petch, Arial Narrow, sans-serif";x.textAlign="center";x.fillStyle="#0b1216cc";const w=Math.min(250,x.measureText(t).width+24);x.fillRect(128-w/2,8,w,36);x.fillStyle=color;x.fillText(t,128,36);if(sub){x.font="500 15px IBM Plex Mono, monospace";x.fillStyle="#dbe6ea";x.fillText(sub,128,60);}tag.material.map.needsUpdate=true;},
    showTag(v){tag.visible=v;},
    /* from: attacker world position (optional). Shields flash; the body flinches away from the hit. */
    flashHit(from){if(S.sh>0)S.uI=Math.max(S.uI,1.05);
      if(from){localDir(root.position.x-from.x,root.position.z-from.z,_dl);const L=Math.hypot(_dl.x,_dl.z)||1;S.spFl.v-=2.6*_dl.z/L;S.spFr.v-=2.2*_dl.x/L;}
      else{S.spFl.v-=1.6;S.spFr.v+=rnd(-1.4,1.4);}},
    /* momentum-based fall: carries running speed, gets knocked away from the killer, harder hits throw further */
    die(from,power=1){if(rig.dead)return;rig.dead=true;S.deadT=0;tag.visible=false;
      let mr=S.vx*Math.cos(yawOf())-S.vz*Math.sin(yawOf()),mb=S.vx*Math.sin(yawOf())+S.vz*Math.cos(yawOf());mr*=.45;mb*=.45;
      if(from){localDir(root.position.x-from.x,root.position.z-from.z,_dl);const L=Math.hypot(_dl.x,_dl.z)||1;mr+=_dl.x/L*2.2*power;mb+=_dl.z/L*2.2*power;}else mb+=1.4;
      const L=Math.hypot(mr,mb)||1;S.fall={bx:mr/L,bz:mb/L,ang:0,angV:S.air?2.5:.4,g:7+power*2.5,vx:mr*.8,vz:mb*.8,spin:S.air?rnd(-2,2):0};},
    revive(){rig.dead=false;S.fall=null;pivot.rotation.set(0,0,0);pivot.position.set(0,0,0);root.visible=true;tag.visible=true;S.sh=70;S.uI=0;S.yaw=null;S.spP.x=S.spP.v=0;},
    chestWorld(out){return out.copy(root.position).add(_kA.set(0,1.25,0));},
    update(dt,st){
      S.t+=dt;const k=1-Math.exp(-14*dt),kf=1-Math.exp(-26*dt);let ev=null;
      const sh=st.shield==null?S.sh:st.shield;
      if(sh<S.sh-.5){if(sh<=0&&S.sh>0){S.uI=2;ev={pop:true};}else if(S.sh>0)S.uI=Math.max(S.uI,1);}
      else if(sh>S.sh+.5&&S.sh<=.5){S.uI=Math.max(S.uI,.9);}
      S.sh=sh;
      if(sh<=0&&!rig.dead&&Math.random()<dt*7)S.uI=Math.max(S.uI,.3+Math.random()*.35);
      S.uI*=Math.exp(-5*dt);if(rig.dead)S.uI=0;
      shieldM.uniforms.uI.value=S.uI;shieldM.uniforms.uT.value=S.t;
      const vis=S.uI>.02;if(vis!==S.shellVis){S.shellVis=vis;for(const s of shells)s.visible=vis;}
      if(rig.dead){deathPose(dt);return ev;}
      const cy=Math.cos(st.yaw),sy=Math.sin(st.yaw);
      const lr=st.vx*cy-st.vz*sy,lf=-st.vx*sy-st.vz*cy,spd=Math.hypot(lr,lf);
      const air=!st.ground;S.vx=st.vx;S.vz=st.vz;
      /* landing: the knees take the impact (feet stay planted, pelvis springs down then recovers) */
      if(S.air&&!air)S.spP.v-=clamp(-S.vy*.11,0,2.4);
      S.air=air;S.vy=st.vy;
      /* acceleration and turn rate feed lean and bank */
      const idt=1/Math.max(dt,1e-3);if(S.yaw==null)S.yaw=st.yaw;let dyaw=st.yaw-S.yaw;dyaw=Math.atan2(Math.sin(dyaw),Math.cos(dyaw));S.yaw=st.yaw;
      S.accF+=(clamp((lf-S.lf)*idt,-40,40)-S.accF)*Math.min(1,dt*8);S.lf=lf;S.turn+=(clamp(dyaw*idt,-8,8)-S.turn)*Math.min(1,dt*10);
      let pel=.96,lean=Math.min(.16,spd*.022),roll=0;
      if(!air&&st.crouch){pel=.7;lean=.2;}
      if(!air&&st.sprint)lean=.36;
      if(st.slide){pel=.58;lean=-.32;}
      if(air){lean=.06;roll=clamp(-lr*.02,-.18,.18);}
      if(st.thrust){lean=.26;roll=clamp(-lr*.03,-.32,.32);}
      if(st.stab)lean=-.04;
      if(st.pound===1)lean=.6;else if(st.pound===2)lean=.3;
      if(st.charge)lean=.55;
      if(st.clamber)lean=.35;
      if(st.melee>=0)lean+=Math.sin(Math.PI*st.melee)*.3;
      if(!air&&!st.slide){lean+=clamp(S.accF*.008,-.14,.14);roll+=clamp(-S.turn*spd*.012,-.22,.22);}
      S.pel+=(pel-S.pel)*k;
      const leanS=spring(S.spLean,lean,dt,4.5,.6)+spring(S.spFl,0,dt,3.2,.35),rollS=spring(S.spRoll,roll,dt,4,.55)+spring(S.spFr,0,dt,3.2,.35);
      const pOff=clamp(spring(S.spP,0,dt,4.2,.42),-.32,.12);
      /* gait: stride length grows with speed and the cycle advances by distance covered, so planted feet do not skate */
      const gait=!air&&!st.slide;const w=gait?clamp(spd/1.2,0,1):0;let step=false,bob=0;
      const L=st.sprint?.62:st.crouch?.3:clamp(.14+spd*.06,.16,.5),H=st.sprint?.3:st.crouch?.1:.12+spd*.012;
      if(gait){const prev=S.ph;S.ph=(S.ph+dt*(w>.05?spd/(4*L):0))%1;
        if(w>.4){for(const o of[0,.5]){const a=(prev+o)%1,b=(S.ph+o)%1;if(b<a)step=true;}}
        bob=-Math.abs(Math.sin(S.ph*Math.PI*2))*(st.sprint?.07:.04)*w;}
      /* hips turn toward the direction of travel while the torso keeps aiming: forward, strafe and backpedal gaits */
      let mvA=spd>.6?Math.atan2(lr,lf):0;if(Math.abs(mvA)>1.75)mvA-=Math.sign(mvA)*Math.PI;
      const hipT=gait&&!st.sprint&&!st.crouch?clamp(mvA,-1.05,1.05)*.8:gait&&st.crouch?clamp(mvA,-1,1)*.5:0;
      S.hip+=(hipT-S.hip)*Math.min(1,dt*9);
      const tw=st.sprint&&gait?Math.sin(S.ph*Math.PI*2)*.14*w:0;S.twist+=(tw-S.twist)*kf;
      /* feet find the real ground (stairs, ledges); the pelvis drops so the lower foot can still reach */
      if(gait&&!st.crouch&&root.position.distanceToSquared(camera.position)<1600){const rp=root.position,c=Math.cos(st.yaw),s=Math.sin(st.yaw);
        for(let i=0;i<2;i++){const lg=legs[i];const lx=lg.cur.x,lz=lg.cur.z;const wx=rp.x+lx*c+lz*s,wz=rp.z-lx*s+lz*c;
          const g=clamp(groundBelow(wx,wz,rp.y+.5,.06)-rp.y,-.45,.4);if(i)S.gR+=(g-S.gR)*kf;else S.gL+=(g-S.gL)*kf;}}
      else{S.gL*=1-kf;S.gR*=1-kf;}
      const drop=Math.min(0,S.gL,S.gR);
      pelvis.position.y=S.pel+bob+pOff+drop;pelvis.rotation.y=-S.hip;
      spine.rotation.set(-leanS+st.pitch*.3,S.hip+S.twist,rollS);
      chest.position.y=.28+(spd<.3&&!air?Math.sin(S.t*1.7)*.006:0);
      neck.rotation.set(st.pitch*.35+leanS*.45-bob*1.2,-S.turn*.025,0);
      const gy=-pelvis.position.y+.07;
      /* travel direction expressed in the (rotated) pelvis frame */
      const mx0=spd>.05?lr/spd:0,mz0=spd>.05?-lf/spd:-1,ch=Math.cos(S.hip),shh=Math.sin(S.hip);
      const mx=mx0*ch+mz0*shh,mz=-mx0*shh+mz0*ch;
      legs.forEach((g,i)=>{const side=g.side;const tg=_lk;const gf=i?S.gR:S.gL;
        if(gait){const p=(S.ph+(i?.5:0))%1;let off,lift=0;if(p<.5)off=L-4*L*p;else{const q=p-.5;off=-L+4*L*q;lift=Math.sin(2*Math.PI*q)*H;}off*=w;lift*=w;
          tg.set(side*(.12+Math.abs(mx)*.03)+mx*off,gy+gf+lift,mz*off);}
        else if(st.slide)tg.set(i===0?-.1:.15,i===0?gy+.06:gy,i===0?-.62:.24);
        else if(st.pound===1)tg.set(side*.14,-.42,-.18);
        else if(st.pound===2)tg.set(side*.15,-.83,side*.05);
        else if(st.clamber)tg.set(side*.12,i===0?-.4:-.78,i===0?-.32:.12);
        else if(st.stab)tg.set(side*.13,-.8,.03+Math.sin(S.t*3+i*2)*.05);
        else{const tuck=clamp(st.vy*.03,-.12,.18);tg.set(side*.12+(st.thrust?-mx*.22:0),(i===0?-.7:-.6)+tuck,(i===0?-.18:.18)+(st.thrust?-mz*.28:0));}
        g.cur.lerp(tg,gait?Math.min(1,kf*1.6):kf);
        solve2(g.hip,g.kn,.44,.43,g.hip.position,g.cur,_pole.set(side*.15,0,-1));
        _q1.copy(g.hip.quaternion).multiply(g.kn.quaternion).invert();g.an.quaternion.copy(_q1);
      });
      const rl=st.reload;let gp=POSE.aim;const wp=st.wpn|0,pis=wp===1;if(wp!==S.wp){S.wp=wp;rifleG.visible=wp===0;pisG.visible=wp===1;snpG.visible=wp===2;}
      if(rl>=0)gp=POSE.reload;else if(!air&&st.sprint)gp=POSE.sprint;else if(st.pound===1||st.clamber||st.charge)gp=POSE.low;
      /* recoil: each shot kicks the weapon back and up through a spring, heavier for heavier guns */
      if(st.fire&&S.t-S.lastKick>[.1,.26,.62][wp]){S.lastKick=S.t;S.spKick.v+=wp===2?9:wp===1?6:3;}
      const kick=spring(S.spKick,0,dt,7,.45);
      _c.copy(gp.p);_q2.setFromEuler(_e1.set(gp.r[0]+(gp===POSE.aim?st.pitch*.6:0)+kick*.35,gp.r[1],gp.r[2]));
      if(st.melee>=0){const m=Math.sin(Math.PI*st.melee);_c.z-=.22*m;_c.y+=.08*m;_q1.setFromEuler(_e1.set(-.6*m,.4*m,0));_q2.multiply(_q1);}
      _c.z+=kick*.07;
      if(gait&&!st.sprint)_c.y+=Math.sin(S.ph*Math.PI*4)*.012*w;
      const kg=Math.min(1,k*1.5);gun.position.lerp(_c,kg);gun.quaternion.slerp(_q2,kg);gun.updateMatrix();
      _rk.copy(GRIP).applyMatrix4(gun.matrix);
      if(rl>=0)reloadKey(RIG_RELOAD,rl,FORE,_lk).applyMatrix4(gun.matrix);
      else if(st.clamber)_lk.set(-.22,.42,-.38);
      else if(!air&&st.sprint){const a=S.ph*Math.PI*2;_lk.set(-.27,-.24+.06*Math.cos(a),-.02-.22*Math.sin(a));}
      else _lk.copy(pis?PFORE:FORE).applyMatrix4(gun.matrix);
      S.lh.lerp(_lk,kf);S.rh.lerp(_rk,Math.min(1,kf*1.5));
      solve2(arms[0].sh,arms[0].el,.30,.29,arms[0].sh.position,S.lh,_pole.set(-.9,-.5,.5));
      solve2(arms[1].sh,arms[1].el,.30,.29,arms[1].sh.position,S.rh,_pole.set(.9,-.5,.5));
      if(rl>=0){const inHand=(rl>=.12&&rl<.3)||(rl>=.45&&rl<.78);mag.visible=!(rl>=.3&&rl<.45);
        if(inHand){_m1.copy(gun.matrix).invert();mag.position.copy(S.lh).applyMatrix4(_m1);mag.position.y+=.03;}else mag.position.copy(MAGSLOT);
        if(S.lastR>=0&&S.lastR<.3&&rl>=.3){root.updateMatrixWorld(true);ev=Object.assign(ev||{},{drop:mag.getWorldPosition(new V3()),dropQ:mag.getWorldQuaternion(new THREE.Quaternion())});}
        if(S.lastR>=0&&S.lastR<.78&&rl>=.78)ev=Object.assign(ev||{},{magIn:true});
        S.lastR=rl;}
      else{mag.visible=true;mag.position.copy(MAGSLOT);S.lastR=-1;}
      const gl=st.thrust?1:st.stab?.55+Math.random()*.3:st.pound===1?.4+Math.random()*.4:st.pound===2?.8:0;
      for(const g of glows){g.material.opacity+=(gl-g.material.opacity)*kf;g.scale.y=.25+g.material.opacity*.35;}
      if(step)ev=Object.assign(ev||{},{step:true,sprint:st.sprint});
      return ev;
    }};
  /* death: topple in the direction of momentum, knees buckle first, then a small settle bounce */
  function deathPose(dt){const F=S.fall||(S.fall={bx:0,bz:1,ang:0,angV:.4,g:7,vx:0,vz:0,spin:0});S.deadT+=dt;const kf=1-Math.exp(-20*dt);
    F.angV+=F.g*dt;F.ang+=F.angV*dt;if(F.ang>1.45){F.ang=1.45;F.angV=Math.abs(F.angV)>.6?-F.angV*.22:0;}
    pivot.rotation.set(F.ang*F.bz,F.spin*Math.min(1,S.deadT),-F.ang*F.bx);
    const fr=Math.exp(-2.6*dt);F.vx*=fr;F.vz*=fr;pivot.position.x+=F.vx*dt;pivot.position.z+=F.vz*dt;
    const c=Math.min(1,S.deadT*3.4);pelvis.position.y=.96-.3*c*c;pelvis.rotation.y=0;spine.rotation.set(-.3*c,0,F.bx*.2*c);neck.rotation.set(.45*c,0,0);
    legs.forEach((g,i)=>{_lk.set(g.side*(.15+.05*c),-pelvis.position.y+.08+.18*c*(i?1:.4),(-.08+i*.22)*c);g.cur.lerp(_lk,kf);
      solve2(g.hip,g.kn,.44,.43,g.hip.position,g.cur,_pole.set(g.side*.15,0,-1));_q1.copy(g.hip.quaternion).multiply(g.kn.quaternion).invert();g.an.quaternion.copy(_q1);});
    const fl=Math.min(1,S.deadT*2.5);S.lh.lerp(_lk.set(-.48,-.05+.35*fl*F.bz,.2+.25*fl),kf*.6);S.rh.lerp(_rk.set(.48,-.05+.3*fl*F.bz,.15+.3*fl),kf*.6);
    solve2(arms[0].sh,arms[0].el,.30,.29,arms[0].sh.position,S.lh,_pole.set(-.9,-.5,.5));solve2(arms[1].sh,arms[1].el,.30,.29,arms[1].sh.position,S.rh,_pole.set(.9,-.5,.5));
    for(const g of glows)g.material.opacity=0;
    if(S.deadT>3.4)root.visible=false;}
  rig.setLabel(label);return rig;
}
function bodyState(B,extra){return{vx:B.vel.x,vz:B.vel.z,vy:B.vel.y,yaw:B.yaw,ground:B.ground&&!B.clamber,sprint:B.sprint&&B.ground,slide:B.slideT>0,crouch:B.crouch&&B.slideT<=0,thrust:B.thrustT>0,stab:B.stabbing,pound:B.pound,clamber:!!B.clamber,charge:B.chargeT>0,melee:B.meleeT>0?1-B.meleeT/.4:-1,pitch:B.pitch,shield:B.shield,reload:extra&&extra.reload!=null?extra.reload:-1,fire:extra&&extra.fire,wpn:extra&&extra.wpn|0};}
