/* ============ grenades: frag (bounces, 2.2s fuse) and plasma (sticks to surfaces and pilots) ============ */
const NADES={frag:{fuse:2.2,r:5.2,dmg:105,color:0xffa040},plasma:{fuse:1.7,r:4.2,dmg:115,color:0x5ad2ff}};
const NG=20,_n1=new V3(),_n2=new V3();
const fragGeo=new THREE.SphereGeometry(.085,10,8),fragMat=new THREE.MeshStandardMaterial({color:"#56604a",roughness:.6,metalness:.4,emissive:"#301800"});
const plasMat=new THREE.SpriteMaterial({color:0x7fe2ff,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false});
function fxPut(key,m){scene.remove(m);POOL.get(key).push(m);}
function losClear(a,b){_n1.copy(b).sub(a);const L=_n1.length();if(L<1e-3)return true;_n1.multiplyScalar(1/L);return rayWorld(a,_n1,L)>=L-.05;}
function inBox(p,b,r){return p.x>b.x0-r&&p.x<b.x1+r&&p.y>b.y0-r&&p.y<b.y1+r&&p.z>b.z0-r&&p.z<b.z1+r;}
function solveThrow(from,to,speed,g){const dx=to.x-from.x,dz=to.z-from.z,dy=to.y-from.y,x=Math.hypot(dx,dz);if(x<.5)return null;const v2=speed*speed,disc=v2*v2-g*(g*x*x+2*dy*v2);if(disc<0)return null;
  const a=Math.atan((v2-Math.sqrt(disc))/(g*x)),c=Math.cos(a);return new V3(dx/x*speed*c,speed*Math.sin(a),dz/x*speed*c);}
function nadeDmg(type,d){const P=NADES[type];return d>=P.r?0:P.dmg*Math.pow(1-d/P.r,.8);}
class NadeWorld{
  constructor(render){this.list=[];this.render=render;}
  throw(type,pos,vel,owner){if(this.list.length>24)return null;const n={type,pos:pos.clone(),vel:vel.clone(),t:NADES[type].fuse,owner,stuck:null,off:new V3(),rest:false,mesh:null,key:null,landed:false};
    if(this.render){if(type==="frag"){n.key="nf";n.mesh=fxGet("nf",()=>{const m=new THREE.Mesh(fragGeo,fragMat);m.castShadow=true;return m;});}else{n.key="np";n.mesh=fxGet("np",()=>new THREE.Sprite(plasMat.clone()));n.mesh.scale.setScalar(.32);}n.mesh.position.copy(n.pos);}
    this.list.push(n);return n;}
  step(dt){const L=this.list;
    for(let i=L.length-1;i>=0;i--){const n=L[i];n.t-=dt;
      if(n.stuck){n.pos.copy(n.stuck.pos).add(n.off);}
      else if(!n.rest){const sub=3,h=dt/sub;
        for(let k=0;k<sub&&!n.rest&&!n.stuck;k++){n.vel.y-=NG*h;const prev=_n2.copy(n.pos);n.pos.addScaledVector(n.vel,h);
          for(const b of SOLID){if(!inBox(n.pos,b,.07))continue;
            if(n.type==="plasma"){n.pos.copy(prev);n.vel.set(0,0,0);n.rest=true;if(this.render)sfx("stick",distVol(n.pos,30));break;}
            const sp=Math.abs(n.vel.x)+Math.abs(n.vel.y)+Math.abs(n.vel.z);
            const oy=prev.y>=b.y1+.069||prev.y<=b.y0-.069,ox=prev.x<=b.x0-.069||prev.x>=b.x1+.069;
            if(oy){n.pos.y=prev.y;n.vel.y*=-.38;n.vel.x*=.72;n.vel.z*=.72;if(Math.abs(n.vel.y)<1.4)n.vel.y=0;}
            else if(ox){n.pos.x=prev.x;n.vel.x*=-.45;}
            else{n.pos.z=prev.z;n.vel.z*=-.45;}
            if(inBox(n.pos,b,.07))n.pos.copy(prev);
            if(this.render&&sp>4)sfx("clink",distVol(n.pos,30));break;}
          if(n.type==="plasma"&&n.owner&&n.owner.stickables){for(const s of n.owner.stickables()){const cx=s.pos.x,cy=s.pos.y+s.h*.6,cz=s.pos.z;
            if(Math.abs(n.pos.x-cx)<.55&&Math.abs(n.pos.y-cy)<.75&&Math.abs(n.pos.z-cz)<.55){n.stuck={pos:s.pos,ref:s.ref};n.off.copy(n.pos).sub(s.pos);if(this.render)sfx("stick",distVol(n.pos,40));if(n.owner.onStick)n.owner.onStick(s.ref);break;}}}}
        if(n.vel.y===0){n.landed=true;const f=Math.exp(-3.2*dt);n.vel.x*=f;n.vel.z*=f;}
        if(n.pos.y<-10)n.t=0;}
      if(n.mesh){n.mesh.position.copy(n.pos);if(n.type==="plasma"){n.mesh.scale.setScalar(.28+.08*Math.sin(n.t*30));}else n.mesh.rotation.x+=dt*n.vel.length()*3;}
      if(n.t<=0){const P=NADES[n.type];if(this.render){blast(n.pos,P.color,P.r);sfx("boom",distVol(n.pos,70));const dv=distVol(n.pos,22);if(dv>0)rumble(dv,dv*.8,280);}
        if(n.owner&&n.owner.onExplode)n.owner.onExplode(n.pos,n.type,n.stuck?n.stuck.ref:null);
        if(n.owner)damageRadius(n.pos,P.r*1.1,P.dmg*3,this.render);
        if(n.mesh)fxPut(n.key,n.mesh);L[i]=L[L.length-1];L.pop();}}}
  clear(){for(const n of this.list)if(n.mesh)fxPut(n.key,n.mesh);this.list.length=0;}
}
const MAIN_NADES=new NadeWorld(true);
/* player grenades */
const nadeInv={frag:2,plasma:2};let nadeSel="frag",nadeCD=0;
function nadeRefill(){nadeInv.frag=2;nadeInv.plasma=2;updNadeHud();}
function updNadeHud(){const el=$("gnade");if(!el)return;el.textContent=`${nadeSel==="frag"?"› ":""}Frag ${nadeInv.frag}   ${nadeSel==="plasma"?"› ":""}Plasma ${nadeInv.plasma}`;}
function swapNade(){nadeSel=nadeSel==="frag"?"plasma":"frag";updNadeHud();sfx("hit",.4);}
const playerNadeOwner={
  stickables(){const out=[];for(const t of targets())out.push({ref:t.ref,pos:t.pos,h:t.h});return out;},
  onStick(){toast("Stuck!");},
  onExplode(c,type,stuckRef){const w=type==="plasma"?"stick":"frag";
    for(const t of targets()){const ch=_n2.copy(t.pos);ch.y+=t.h*.6;const d=ch.distanceTo(c);const dmg=t.ref===stuckRef?999:losClear(c,ch)?nadeDmg(type,d):0;if(dmg>1)dealDamage(t,Math.round(dmg),w,false);}
    if(playing&&!me.dead){const ch=_n2.copy(me.pos);ch.y+=me.h*.6;const d=ch.distanceTo(c);if(d<NADES[type].r&&losClear(c,ch)){const n=Math.round(nadeDmg(type,d)*.85);if(n>1)hurtMe(n,{name:myName,w:"self"});}}}};
function throwNade(){if(nadeCD>0||me.dead||nadeInv[nadeSel]<=0||me.clamber||paused)return;nadeInv[nadeSel]--;nadeCD=.9;vmS.throwT=.42;updNadeHud();
  const d=new V3();camera.getWorldDirection(d);d.y+=.12;d.normalize();const o=camera.getWorldPosition(new V3()).addScaledVector(d,.45);
  const v=d.multiplyScalar(19).add(_n1.set(me.vel.x*.5,Math.max(0,me.vel.y*.3),me.vel.z*.5));
  MAIN_NADES.throw(nadeSel,o,v,playerNadeOwner);sfx("swing",.6);emitFx("nade",v3a(o),v3a(v),nadeSel==="plasma"?1:0);}
