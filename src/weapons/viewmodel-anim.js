/* ============ viewmodel animation ============ */
function updVM(dt,c){
  const k=1-Math.exp(-16*dt),kf=1-Math.exp(-24*dt);const V=VMW[wi],P=V.P,g=V.g;
  let pose=c.aim?P.aim:P.hip;
  if(c.reload>=0)pose=P.reload;else if(c.sprint)pose=P.sprint;else if(c.low)pose=P.low;
  _c.copy(pose.p);_e1.set(pose.r[0],pose.r[1],pose.r[2]);
  const ph=c.stepPh*Math.PI,ads=c.aim&&c.reload<0;
  if(c.sprint){_c.x+=Math.sin(ph)*.045;_c.y+=Math.abs(Math.cos(ph))*.035;_e1.z+=Math.sin(ph)*.08;}
  else if(c.moving&&!c.aim){_c.x+=Math.sin(ph)*.012;_c.y+=Math.abs(Math.cos(ph))*.012;}
  else if(c.moving){_c.y+=Math.abs(Math.cos(ph))*.0025;}
  if(c.melee>=0){const m=Math.sin(Math.PI*c.melee);_c.z-=.25*m;_c.x-=.08*m;_c.y+=.05*m;_e1.x-=.7*m;_e1.y+=.35*m;}
  if(c.pound1){_c.x+=rnd(-.006,.006);_c.y+=rnd(-.006,.006);}
  if(c.thrust&&!ads){_c.x-=c.lr*.004;_e1.z+=c.lr*.01;}
  _c.y-=c.landDip*(ads?.06:.25);_e1.z+=c.strafe*(ads?.008:.06);
  /* inertia: the weapon lags behind changes in velocity (springs), floats up on a jump and settles on landing */
  if(c.vel){const cy=Math.cos(c.yaw),sy=Math.sin(c.yaw),vr=c.vel.x*cy-c.vel.z*sy,vf=-c.vel.x*sy-c.vel.z*cy,idt=1/Math.max(dt,1e-3);
    const ar=clamp((vr-vmS.lvx)*idt,-60,60),au=clamp((c.vel.y-vmS.lvy)*idt,-60,60),af=clamp((vf-vmS.lfw)*idt,-60,60);vmS.lvx=vr;vmS.lvy=c.vel.y;vmS.lfw=vf;
    vmS.inX.v-=ar*.0009;vmS.inY.v-=au*.0006;vmS.inZ.v+=af*.0006;
    if(vmS.air&&c.ground)vmS.inY.v-=.12;vmS.air=!c.ground;}
  const ik=ads?.25:1;_c.x+=spring(vmS.inX,0,dt,3.2,.55)*ik;_c.y+=(spring(vmS.inY,0,dt,3,.5)+(c.ground?0:clamp(-(c.vel?c.vel.y:0)*.0025,-.02,.03)))*ik;_c.z+=spring(vmS.inZ,0,dt,3.5,.6)*ik;
  _e1.z-=vmS.inX.x*1.6*ik;_e1.x+=vmS.inY.x*1.2*ik;
  if(!c.moving&&!c.sprint&&c.ground){const b=Math.sin(now*1.6);_c.y+=b*.0018*(ads?.3:1);_e1.x+=b*.002*(ads?.3:1);}
  if(switchT>0){const s=Math.sin(Math.min(1,switchT/.36)*Math.PI);_c.y-=.22*s;_e1.x-=.6*s;}
  if(c.reload>=0){const r=c.reload;if(r>.76&&r<.84)_c.y+=.02*Math.sin((r-.76)/.08*Math.PI);if(r>.86&&r<.94)_e1.z+=.12*Math.sin((r-.86)/.08*Math.PI);}
  const sw=ads?.25:1;
  vmS.swayY+=(clamp((me.yaw-vmS.lastYaw)*-2.5,-.12,.12)*sw-vmS.swayY)*Math.min(1,dt*10);vmS.swayP+=(clamp((me.pitch-vmS.lastPitch)*2.5,-.1,.1)*sw-vmS.swayP)*Math.min(1,dt*10);
  vmS.lastYaw=me.yaw;vmS.lastPitch=me.pitch;_e1.y+=vmS.swayY;_e1.x+=vmS.swayP;
  vmS.kick=Math.max(0,vmS.kick-dt*14);_c.z+=vmS.kick*W().kick;_e1.x+=vmS.kick*W().kick*1.5*(ads?.5:1);
  g.position.lerp(_c,ads?Math.min(1,k*1.4):k);_q2.setFromEuler(_e1);g.quaternion.slerp(_q2,ads?Math.min(1,k*1.4):k);g.updateMatrix();
  vmR.position.copy(V.grip).applyMatrix4(g.matrix);vmR.quaternion.copy(g.quaternion);
  vmS.throwT=Math.max(0,vmS.throwT-dt);
  if(vmS.throwT>0){const t=1-vmS.throwT/.42;const s=Math.sin(t*Math.PI);_lk.set(-.2+.12*s,-.12+.2*s,-.25-.3*s);}
  else if(c.reload>=0)reloadKey(V.keys,c.reload,V.fore,_lk).applyMatrix4(g.matrix);
  else if(c.clamber)_lk.set(-.22,0,-.42);
  else _lk.copy(V.fore).applyMatrix4(g.matrix);
  vmS.lh.lerp(_lk,kf);vmL.position.copy(vmS.lh);vmL.quaternion.slerp(g.quaternion,kf);
  const r=c.reload,mg=V.mag;
  if(r>=0){const inHand=(r>=.12&&r<.3)||(r>=.45&&r<.78);mg.visible=!(r>=.3&&r<.45);
    if(inHand){_m1.copy(g.matrix).invert();mg.position.copy(vmS.lh).applyMatrix4(_m1);mg.position.y+=.02;}else mg.position.copy(V.slot);
    if(vmS.lastR<.12&&r>=.12)sfx("magout",.9);
    if(vmS.lastR>=0&&vmS.lastR<.3&&r>=.3){camera.updateMatrixWorld(true);dropMag(mg.getWorldPosition(new V3()),mg.getWorldQuaternion(new THREE.Quaternion()));}
    if(vmS.lastR<.78&&r>=.78)sfx("magin");if(vmS.lastR<.88&&r>=.88)sfx("slap");
    vmS.lastR=r;}else{mg.visible=true;mg.position.copy(V.slot);vmS.lastR=-1;}
}
