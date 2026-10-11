/* ============ first-person viewmodels: carbine with holo sight, sidearm with iron sights ============ */
const vmRoot=new THREE.Group();camera.add(vmRoot);
const vmArmor=new THREE.MeshStandardMaterial({color:myColor,roughness:.36,metalness:.45});
const vmDark=new THREE.MeshStandardMaterial({color:"#232b30",roughness:.55,metalness:.5});
const vmSuit=new THREE.MeshStandardMaterial({color:"#1a2024",roughness:.8});
const vmAcc=new THREE.MeshStandardMaterial({color:"#ffb347",emissive:"#5a3000",emissiveIntensity:.5,roughness:.4,metalness:.3});
const vmGlass=new THREE.MeshBasicMaterial({color:0x7fd4ff,transparent:true,opacity:.07,depthWrite:false,side:THREE.DoubleSide});
function vmBox(p,w,h,d,m,x,y,z){const o=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);o.position.set(x,y,z);p.add(o);return o;}
function dot(p,color,size,x,y,z){const s=new THREE.Sprite(new THREE.SpriteMaterial({color,transparent:true,depthTest:false,depthWrite:false,blending:THREE.AdditiveBlending}));s.scale.setScalar(size);s.position.set(x,y,z);s.renderOrder=20;p.add(s);return s;}
// carbine
const vmGun=new THREE.Group();vmRoot.add(vmGun);
vmBox(vmGun,.08,.11,.58,vmDark,0,0,-.1);vmBox(vmGun,.06,.03,.36,vmAcc,0,.065,-.1);vmBox(vmGun,.05,.09,.16,vmDark,0,-.01,.25);
{const g=vmBox(vmGun,.05,.12,.06,vmDark,0,-.1,.08);g.rotation.x=.25;const b=new THREE.Mesh(new THREE.CylinderGeometry(.022,.022,.2,10),vmDark);b.rotation.x=Math.PI/2;b.position.set(0,.01,-.47);vmGun.add(b);}
const vmMag=vmBox(vmGun,.05,.15,.075,vmSuit,0,-.13,-.12);
// holo sight: the red dot sits exactly on the sight line, so ADS centers it on screen where rounds go
const HOLO=new V3(0,.128,-.08);
vmBox(vmGun,.07,.012,.07,vmDark,0,.086,-.08);
vmBox(vmGun,.008,.05,.012,vmDark,-.035,.115,-.08);vmBox(vmGun,.008,.05,.012,vmDark,.035,.115,-.08);
vmBox(vmGun,.078,.008,.012,vmDark,0,.144,-.08);
{const gl=new THREE.Mesh(new THREE.PlaneGeometry(.062,.046),vmGlass);gl.position.copy(HOLO);vmGun.add(gl);}
dot(vmGun,0xff3b30,.0042,HOLO.x,HOLO.y,HOLO.z);
// sidearm
const vmPis=new THREE.Group();vmRoot.add(vmPis);vmPis.visible=false;
vmBox(vmPis,.042,.046,.21,vmDark,0,.025,-.04);vmBox(vmPis,.038,.03,.17,vmAcc,0,-.008,-.03);
{const g=vmBox(vmPis,.036,.11,.052,vmSuit,0,-.07,.045);g.rotation.x=.22;}
const vmPisMag=vmBox(vmPis,.026,.08,.034,vmDark,0,-.09,.05);
// iron sights: front post and rear notch tops share y = PIS.y
const PIS=new V3(0,.0585,-.135);
vmBox(vmPis,.006,.012,.008,vmDark,0,.0525,-.135);
vmBox(vmPis,.009,.012,.01,vmDark,-.011,.0525,.05);vmBox(vmPis,.009,.012,.01,vmDark,.011,.0525,.05);
dot(vmPis,0x8cffb0,.0035,0,PIS.y-.002,PIS.z+.001);
const VM_RELOAD=[[0,"F"],[.12,[0,-.2,-.12]],[.3,[0,-.44,-.08]],[.45,[-.08,-.62,.12]],[.62,[0,-.4,-.12]],[.78,[0,-.2,-.12]],[.88,[.07,.07,-.02]],[1,"F"]];
const PIS_RELOAD=[[0,"F"],[.15,[0,-.15,.05]],[.32,[-.02,-.36,.08]],[.5,[-.05,-.5,.12]],[.68,[0,-.3,.06]],[.82,[0,-.14,.05]],[.9,[0,.06,-.03]],[1,"F"]];
const VMW=[
  {g:vmGun,mag:vmMag,grip:new V3(0,-.1,.08),fore:new V3(0,-.07,-.24),slot:new V3(0,-.13,-.12),keys:VM_RELOAD,
   P:{hip:{p:new V3(.2,-.2,-.38),r:[0,0,0]},aim:{p:new V3(-HOLO.x,-HOLO.y,-.24),r:[0,0,0]},sprint:{p:new V3(.15,-.3,-.34),r:[-.35,.55,.35]},reload:{p:new V3(.13,-.22,-.36),r:[.18,.1,.55]},low:{p:new V3(.18,-.42,-.3),r:[-.6,.3,.3]}}},
  {g:vmPis,mag:vmPisMag,grip:new V3(0,-.072,.048),fore:new V3(-.018,-.09,.04),slot:new V3(0,-.09,.05),keys:PIS_RELOAD,
   P:{hip:{p:new V3(.17,-.17,-.34),r:[0,0,0]},aim:{p:new V3(-PIS.x,-PIS.y,-.27),r:[0,0,0]},sprint:{p:new V3(.13,-.28,-.3),r:[-.7,.2,.15]},reload:{p:new V3(.1,-.18,-.32),r:[.35,.15,.5]},low:{p:new V3(.15,-.36,-.28),r:[-.8,.2,.2]}}}];
function vmHand(side){const g=new THREE.Group();vmBox(g,.075,.085,.11,vmSuit,0,-.01,0);vmBox(g,.08,.03,.07,vmArmor,0,.035,.01);
  const fa=new THREE.Mesh(capsule(.048,.44),vmArmor);fa.position.set(side*.05,-.12,.18);fa.rotation.set(-1.0,0,side*.3);g.add(fa);vmRoot.add(g);return g;}
const vmR=vmHand(1),vmL=vmHand(-1);
const flash=new THREE.PointLight(0xffb347,0,6);flash.position.set(0,.01,-.7);vmGun.add(flash);
const flashSprite=new THREE.Sprite(new THREE.SpriteMaterial({color:0xffd28a,transparent:true,opacity:0,depthTest:false,blending:THREE.AdditiveBlending}));flashSprite.scale.set(.14,.14,.14);flashSprite.position.set(0,.01,-.62);vmGun.add(flashSprite);
const vmS={lh:new V3(),lastR:-1,swayY:0,swayP:0,lastYaw:0,lastPitch:0,kick:0,throwT:0};
// sniper rifle viewmodel
const vmSnp=new THREE.Group();vmRoot.add(vmSnp);vmSnp.visible=false;
vmBox(vmSnp,.075,.1,.62,vmDark,0,0,-.12);vmBox(vmSnp,.06,.12,.22,vmDark,0,-.01,.3);vmBox(vmSnp,.05,.04,.4,vmAcc,0,.06,-.15);
{const b=new THREE.Mesh(new THREE.CylinderGeometry(.018,.022,.55,10),vmDark);b.rotation.x=Math.PI/2;b.position.set(0,.015,-.68);vmSnp.add(b);
 const s=new THREE.Mesh(new THREE.CylinderGeometry(.032,.032,.3,14),vmDark);s.rotation.x=Math.PI/2;s.position.set(0,.115,-.08);vmSnp.add(s);
 const l=new THREE.Mesh(new THREE.CircleGeometry(.03,16),new THREE.MeshBasicMaterial({color:0x2a7fff}));l.position.set(0,.115,-.231);l.rotation.y=Math.PI;vmSnp.add(l);
 const g=vmBox(vmSnp,.05,.12,.06,vmDark,0,-.1,.12);g.rotation.x=.25;}
const vmSnpMag=vmBox(vmSnp,.05,.12,.07,vmSuit,0,-.11,-.02);
VMW.push({g:vmSnp,mag:vmSnpMag,grip:new V3(0,-.1,.12),fore:new V3(0,-.07,-.3),slot:new V3(0,-.11,-.02),keys:VM_RELOAD,
  P:{hip:{p:new V3(.2,-.21,-.36),r:[0,0,0]},aim:{p:new V3(.06,-.24,-.2),r:[0,0,0]},sprint:{p:new V3(.15,-.3,-.32),r:[-.35,.55,.35]},reload:{p:new V3(.13,-.22,-.36),r:[.18,.1,.55]},low:{p:new V3(.18,-.42,-.3),r:[-.6,.3,.3]}}});
