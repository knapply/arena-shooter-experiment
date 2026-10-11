(function(){
function U(){const store={};const f=function(){return p;};const p=new Proxy(f,{get(t,k){if(k in store)return store[k];if(k===Symbol.toPrimitive)return()=>0;if(k==='then'||k==='toJSON')return undefined;const v=U();store[k]=v;return v;},set(t,k,v){store[k]=v;return true;},construct(){return U();},apply(){return p;}});return p;}
class V{constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;}set(x,y,z){this.x=x;this.y=y;this.z=z;return this}setY(y){this.y=y;return this}setScalar(s){return this.set(s,s,s)}clone(){return new V(this.x,this.y,this.z)}copy(v){return this.set(v.x,v.y,v.z)}
add(v){this.x+=v.x;this.y+=v.y;this.z+=v.z;return this}sub(v){this.x-=v.x;this.y-=v.y;this.z-=v.z;return this}subVectors(a,b){return this.set(a.x-b.x,a.y-b.y,a.z-b.z)}addScaledVector(v,s){this.x+=v.x*s;this.y+=v.y*s;this.z+=v.z*s;return this}
multiplyScalar(s){this.x*=s;this.y*=s;this.z*=s;return this}lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z}length(){return Math.sqrt(this.lengthSq())}dot(v){return this.x*v.x+this.y*v.y+this.z*v.z}
normalize(){const l=this.length()||1;return this.multiplyScalar(1/l)}lerp(v,t){this.x+=(v.x-this.x)*t;this.y+=(v.y-this.y)*t;this.z+=(v.z-this.z)*t;return this}lerpVectors(a,b,t){return this.set(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t,a.z+(b.z-a.z)*t)}
distanceTo(v){return Math.hypot(this.x-(+v.x||0),this.y-(+v.y||0),this.z-(+v.z||0))}toArray(){return[this.x,this.y,this.z]}project(){this.z=.5;return this}applyMatrix4(){return this}applyQuaternion(){return this}}
Object.setPrototypeOf(V.prototype,new Proxy({},{get(t,k){if(typeof k==='symbol')return undefined;return function(){return this;};}}));
window.THREE=new Proxy({Vector3:V,sRGBEncoding:1,PCFSoftShadowMap:1,BackSide:1,DoubleSide:1,AdditiveBlending:1,RepeatWrapping:1},{get(t,k){if(k in t)return t[k];return function(){return U();};}});
})();
