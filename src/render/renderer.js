/* ============ renderer / scene ============ */
/* color management: three r128 takes hex and CSS colors as linear values, so after the final gamma step every
   color came out brighter and greyer than authored. Convert colors to linear once, where they are set. */
{const C=THREE.Color.prototype,setHex=C.setHex,setStyle=C.setStyle;let inStyle=false;
  C.setHex=function(h){setHex.call(this,h);return inStyle?this:this.convertSRGBToLinear();};
  C.setStyle=function(s){inStyle=true;try{setStyle.call(this,s);}finally{inStyle=false;}return this.convertSRGBToLinear();};}
const canvas=$("game");
const renderer=new THREE.WebGLRenderer({canvas,antialias:false,powerPreference:"high-performance"});
renderer.setPixelRatio(Math.min(devicePixelRatio,isTouch?1.5:1.75));
renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.outputEncoding=THREE.sRGBEncoding;
const scene=new THREE.Scene();
scene.background=new THREE.Color("#141e24");
scene.fog=new THREE.Fog("#141e24",40,120);
const camera=new THREE.PerspectiveCamera(78,1,0.03,300);
scene.add(camera);
function resize(){const w=innerWidth,h=innerHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();if(gfxReady)gfxResize();}
addEventListener("resize",resize); resize();

scene.add(new THREE.HemisphereLight(0xb4cbe0,0x5a4a3c,1.35));
const sun=new THREE.DirectionalLight(0xffe2c0,2.3);
sun.position.set(30,50,18); sun.castShadow=true;
sun.shadow.mapSize.set(isTouch?1024:2048,isTouch?1024:2048);
Object.assign(sun.shadow.camera,{left:-42,right:42,top:42,bottom:-42,near:1,far:130});
sun.shadow.bias=-0.0006; scene.add(sun);
const _skyP=new THREE.Vector3();
{const g=new THREE.SphereGeometry(40,32,16);const m=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,depthTest:false,fog:false,vertexShader:"varying vec3 v;void main(){v=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",fragmentShader:"varying vec3 v;void main(){float h=v.y;vec3 lo=vec3(.08,.12,.14);vec3 mid=vec3(.33,.27,.24);vec3 hi=vec3(.06,.09,.13);vec3 c=h<0.08?mix(lo,mid,smoothstep(-.2,.08,h)):mix(mid,hi,smoothstep(.08,.6,h));gl_FragColor=vec4(pow(c,vec3(2.2))*1.5,1.);}"});/* the sky follows whichever camera renders it and draws behind everything, so it is never clipped by the far plane */
  const sky=new THREE.Mesh(g,m);sky.renderOrder=-10;sky.frustumCulled=false;sky.onBeforeRender=(r,sc,cam)=>{sky.position.copy(cam.getWorldPosition(_skyP));sky.updateMatrixWorld();sky.modelViewMatrix.multiplyMatrices(cam.matrixWorldInverse,sky.matrixWorld);};scene.add(sky);}
