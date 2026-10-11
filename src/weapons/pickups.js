/* ============ power weapon pickups ============ */
const PICKMAT=new THREE.MeshStandardMaterial({color:"#2a3338",roughness:.4,metalness:.6}),PICKACC=new THREE.MeshStandardMaterial({color:"#5ab8ff",emissive:"#2a7fff",emissiveIntensity:1.4});
function weaponModel(){const g=new THREE.Group();const b=(w,h,d,m,x,y,z)=>{const o=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);o.position.set(x,y,z);o.castShadow=true;g.add(o);return o;};
  b(.08,.12,1.1,PICKMAT,0,0,0);b(.07,.05,.5,PICKACC,0,.08,-.1);b(.07,.16,.25,PICKMAT,0,-.02,.52);b(.05,.14,.07,PICKMAT,0,-.12,.25);
  const s=new THREE.Mesh(new THREE.CylinderGeometry(.04,.04,.32,10),PICKMAT);s.rotation.x=Math.PI/2;s.position.set(0,.13,.05);g.add(s);return g;}
function labelSprite(){const c=document.createElement("canvas");c.width=256;c.height=64;const x=c.getContext("2d");const tex=new THREE.CanvasTexture(c);tex.encoding=THREE.sRGBEncoding;
  const s=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,depthTest:false,transparent:true}));s.scale.set(1.9,.48,1);
  s.userData.draw=(t,col)=>{x.clearRect(0,0,256,64);x.font="600 30px Chakra Petch, Arial Narrow, sans-serif";x.textAlign="center";x.fillStyle="#0b1216cc";const w=Math.min(250,x.measureText(t).width+26);x.fillRect(128-w/2,8,w,44);x.fillStyle=col;x.fillText(t,128,40);tex.needsUpdate=true;};return s;}
const PK_VIS=new Map();
function pkVisual(p){let v=PK_VIS.get(p.id);if(v)return v;const g=new THREE.Group();const model=weaponModel();g.add(model);
  const ring=new THREE.Mesh(new THREE.RingGeometry(.55,.68,32),new THREE.MeshBasicMaterial({color:0x5ab8ff,transparent:true,opacity:.7,side:THREE.DoubleSide,depthWrite:false}));ring.material.color.multiplyScalar(2);ring.rotation.x=-Math.PI/2;ring.position.y=.04;g.add(ring);
  const label=labelSprite();label.position.y=1.5;g.add(label);g.position.copy(p.pos);scene.add(g);v={g,model,ring,label,last:""};PK_VIS.set(p.id,v);return v;}
/* arena: the sniper sits on the pedestal block on top of the central core */
const ARENA_PICKS=[{id:"arena-sniper",type:2,pos:new V3(0,4.5,0),respawn:90,availAt:0,
  get avail(){return now>=this.availAt;},get availIn(){return Math.max(0,this.availAt-now);},
  take(){if(!this.avail)return false;this.availAt=now+this.respawn;emitFx("pk",[0,0,0],[0,0,0],0);return true;}}];
let pkHold=0,pkNear=null;const pkAnn=new Map();
function pickupList(){if(EXT)return EXT.pickups?EXT.pickups():[];return ARENA_PICKS;}
function updPickups(dt){const list=pickupList();const seen=new Set();pkNear=null;
  for(const p of list){seen.add(p.id);const v=pkVisual(p);v.g.visible=true;const av=p.avail;v.model.visible=av;
    v.model.rotation.y+=dt*1.1;v.model.position.y=.6+Math.sin(now*2)*.08;v.ring.material.opacity=av?.75:.2;
    const s=Math.ceil(p.availIn);const txt=av?"Sniper rifle":`Sniper ${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`;if(txt!==v.last){v.last=txt;v.label.userData.draw(txt,av?"#9fe1ff":"#7f939c");}
    const st=pkAnn.get(p.id)||{a:av,w:av};
    if(playing&&!demo){if(av&&!st.a){say("Sniper rifle has spawned",true);sfx("stinger",.4);}if(!av&&p.availIn<=30&&!st.w){say("Sniper rifle will spawn in 30 seconds");}}
    st.a=av;st.w=av||p.availIn<=30;pkAnn.set(p.id,st);
    if(playing&&!me.dead&&av&&Math.hypot(me.pos.x-p.pos.x,me.pos.z-p.pos.z)<1.7&&Math.abs(me.pos.y-p.pos.y)<1.6)pkNear=p;}
  for(const[id,v]of PK_VIS)if(!seen.has(id))v.g.visible=false;
  const pr=$("prompt");
  if(pkNear&&!paused){if(A("interact"))pkHold+=dt;else pkHold=0;pr.hidden=false;
    const k=(BIND.interact||[])[0];const pb=(PADB.interact||[])[0];const lbl=pad.on&&pb!=null?PAD_NAMES[pb]:keyLabel(k);
    pr.textContent="";const b=document.createElement("b");b.textContent=lbl;pr.append("Hold ",b," to pick up Sniper rifle");const bar=document.createElement("i");bar.style.transform=`scaleX(${Math.min(1,pkHold/.35)})`;pr.appendChild(bar);
    if(pkHold>=.35){pkHold=0;const p=pkNear;if(p.take()){if(slots.includes(p.type)){reserve[p.type]=WEAPONS[p.type].reserve;ammo[p.type]=WEAPONS[p.type].mag;if(wi===p.type)mag=ammo[wi];toast("Sniper ammo");}else giveWeapon(p.type);}}}
  else{pr.hidden=true;pkHold=0;}}
