/* ============ renderer / scene ============ */
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

scene.add(new THREE.HemisphereLight(0xbcd6e8,0x2c241c,0.75));
const sun=new THREE.DirectionalLight(0xffe2c0,1.15);
sun.position.set(30,50,18); sun.castShadow=true;
sun.shadow.mapSize.set(isTouch?1024:2048,isTouch?1024:2048);
Object.assign(sun.shadow.camera,{left:-42,right:42,top:42,bottom:-42,near:1,far:130});
sun.shadow.bias=-0.0006; scene.add(sun);
{const g=new THREE.SphereGeometry(200,24,12);const m=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,fog:false,vertexShader:"varying vec3 v;void main(){v=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",fragmentShader:"varying vec3 v;void main(){float h=v.y;vec3 lo=vec3(.08,.12,.14);vec3 mid=vec3(.33,.27,.24);vec3 hi=vec3(.06,.09,.13);vec3 c=h<0.08?mix(lo,mid,smoothstep(-.2,.08,h)):mix(mid,hi,smoothstep(.08,.6,h));gl_FragColor=vec4(c,1.);}"});scene.add(new THREE.Mesh(g,m));}
