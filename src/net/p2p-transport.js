/* ===== Standalone multiplayer: peer-to-peer rooms over WebRTC (PeerJS) =====
   Implements the presence-room interface the netcode is written against (see docs/ARCHITECTURE.md).
   Star topology: the person who hosts the room relays everyone's presence. Codes are short and random. */
(function(){
const PREFIX="kinetic-arena-",ALPH="abcdefghjkmnpqrstuvwxyz23456789",MAX_PEERS=8;
const SRC=["https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js","https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js"];
const ROOM_RE=/^[a-z]{1,16}(\/[a-z]{1,16}){0,2}$/,ID_RE=/^[a-z0-9:_-]{1,48}$/i;
let resolveRoom;const roomP=new Promise(r=>resolveRoom=r);
const T={peer:null,myId:"local",hub:false,hubConn:null,conns:new Map(),store:new Map(),mine:new Map(),rooms:new Map(),connected:false,code:null,busy:false};
const $=id=>document.getElementById(id);
const st=r=>{let m=T.store.get(r);if(!m){m=new Map();T.store.set(r,m);}return m;};
function entry(peer,p,isMe){return{peer,presence:p,sameTab:isMe,isMe,kind:"viewer",by:null,guest:false,updatedAt:Date.now()};}
function mkRoom(name){if(T.rooms.has(name))return T.rooms.get(name);const subs=[],closes=[];
  const snap=()=>{const out=[];for(const[peer,p]of st(name))if(peer!==T.myId)out.push(entry(peer,p,false));out.push(entry(T.myId,T.mine.get(name)||{},true));return out;};
  const R={fire(j,l,u){const c={peers:snap(),joined:j,left:l,updated:u};for(const f of subs.slice())try{f(c);}catch(e){console.error(e);}},
    closed(){for(const f of closes.slice())try{f();}catch(e){}},
    presence(patch){const m=Object.assign({},T.mine.get(name)||{});for(const k in patch){if(patch[k]===null)delete m[k];else m[k]=patch[k];}
      if(JSON.stringify(m).length>4096)return Promise.reject({code:"invalid_argument"});T.mine.set(name,m);send({t:"p",r:name,id:T.myId,p:m});return Promise.resolve();},
    peers:snap,
    onPeers(f,onClose){subs.push(f);if(onClose)closes.push(onClose);setTimeout(()=>f({peers:snap(),joined:snap(),left:[],updated:[]}),0);return()=>{const i=subs.indexOf(f);if(i>=0)subs.splice(i,1);};},
    connected:()=>T.connected,onConnection(f){setTimeout(()=>f(T.connected),0);return()=>{};},emit(){return Promise.resolve();},on(){return()=>{};},
    join(n){return Promise.resolve(mkRoom(name+"/"+String(n).toLowerCase().replace(/[^a-z]/g,"").slice(0,16)));},leave(){return Promise.resolve();}};
  T.rooms.set(name,R);return R;}
/* ---- message handling (everything from the network is untrusted) ---- */
function okMsg(m){return m&&typeof m==="object"&&(m.t==="p"?typeof m.r==="string"&&ROOM_RE.test(m.r)&&m.p&&typeof m.p==="object"&&!Array.isArray(m.p)&&JSON.stringify(m.p).length<=4200:m.t==="x");}
function apply(m){if(!ID_RE.test(String(m.id))||m.id===T.myId)return;
  if(m.t==="p"){const s=st(m.r),had=s.has(m.id);s.set(m.id,m.p);const R=T.rooms.get(m.r);if(R){const e=entry(m.id,m.p,false);R.fire(had?[]:[e],[],had?[e]:[]);}}
  else if(m.t==="x"){for(const[r,s]of T.store)if(s.has(m.id)){const e=entry(m.id,s.get(m.id),false);s.delete(m.id);const R=T.rooms.get(r);if(R)R.fire([],[e],[]);}}}
function send(m){if(!T.connected)return;if(T.hub){for(const c of T.conns.values())if(c.open)try{c.send(m);}catch(e){}}else if(T.hubConn&&T.hubConn.open)try{T.hubConn.send(m);}catch(e){}}
function allPresence(){const list=[];for(const[r,s]of T.store)for(const[id,p]of s)list.push({t:"p",r,id,p});for(const[r,p]of T.mine)list.push({t:"p",r,id:T.myId,p});return list;}
/* hub: one connection per friend, with a flood guard */
function hubAccept(c){if(T.conns.size>=MAX_PEERS-1){c.on("open",()=>{try{c.send({t:"full"});}catch(e){}setTimeout(()=>c.close(),300);});return;}
  const bucket={tok:120,t:performance.now()};
  c.on("open",()=>{T.conns.set(c.peer,c);try{c.send({t:"all",list:allPresence()});}catch(e){}status();});
  c.on("data",m=>{const now=performance.now();bucket.tok=Math.min(120,bucket.tok+(now-bucket.t)*.06);bucket.t=now;if(--bucket.tok<0)return;
    if(!okMsg(m)||m.t!=="p")return;const out={t:"p",r:m.r,id:c.peer,p:m.p};apply(out);for(const[id,o]of T.conns)if(id!==c.peer&&o.open)try{o.send(out);}catch(e){}});
  const gone=()=>{if(!T.conns.has(c.peer))return;T.conns.delete(c.peer);const m={t:"x",id:c.peer};apply(m);send(m);status();};
  c.on("close",gone);c.on("error",gone);}
/* client: everything arrives via the host */
function clientData(m){if(!m||typeof m!=="object")return;
  if(m.t==="full"){msg("That room is full (8 players).",true);return;}
  if(m.t==="all"&&Array.isArray(m.list)){for(const x of m.list.slice(0,64))if(okMsg(x))apply(x);return;}
  if(okMsg(m))apply(m);}
function lostHost(){if(!T.connected)return;T.connected=false;for(const[r,s]of T.store){const R=T.rooms.get(r);const left=[...s].map(([id,p])=>entry(id,p,false));s.clear();if(R&&left.length)R.fire([],left,[]);}
  for(const R of T.rooms.values())R.closed();msg("The room closed (the host left). Reload the page to host or join again.",true);setUI("closed");}
/* ---- PeerJS loading ---- */
function PeerCtor(){const P=window.Peer;if(typeof P==="function")return P;const g=window.peerjs;return g&&(typeof g.Peer==="function"?g.Peer:typeof g.default==="function"?g.default:null);}
function loadPeer(){if(PeerCtor())return Promise.resolve(PeerCtor());
  return SRC.reduce((p,src)=>p.catch(()=>new Promise((ok,no)=>{const s=document.createElement("script");s.src=src;s.crossOrigin="anonymous";s.onload=()=>PeerCtor()?ok(PeerCtor()):no();s.onerror=no;document.head.appendChild(s);})),Promise.reject())
    .catch(()=>{throw new Error("load");});}
const code5=()=>{const a=new Uint32Array(5);crypto.getRandomValues(a);return[...a].map(x=>ALPH[x%ALPH.length]).join("");};
function keepAlive(peer){peer.on("disconnected",()=>{if(!peer.destroyed)setTimeout(()=>{try{peer.reconnect();}catch(e){}},1500);});}
async function host(tries){if(T.busy||T.connected)return;T.busy=true;setUI("busy");msg("Opening a room…");
  let P;try{P=await loadPeer();}catch(e){T.busy=false;setUI("idle");msg("Couldn't load the networking library. Check your internet connection and try again.",true);return;}
  const code=code5();const peer=new P(PREFIX+code,{debug:0});T.peer=peer;
  peer.on("open",id=>{T.myId=id;T.hub=true;T.connected=true;T.code=code;T.busy=false;keepAlive(peer);resolveRoom(lobby);setUI("hosting");status();});
  peer.on("connection",hubAccept);
  peer.on("error",e=>{if(T.connected)return;try{peer.destroy();}catch(x){}T.busy=false;
    if(e&&e.type==="unavailable-id"&&(tries|0)<4){host((tries|0)+1);return;}setUI("idle");msg("Couldn't open a room ("+(e&&e.type||"network")+"). Try again in a moment.",true);});}
async function join(raw){if(T.busy||T.connected)return;const code=String(raw||"").toLowerCase().replace(/[^a-z0-9]/g,"");
  if(code.length!==5){msg("Room codes are 5 letters and numbers.",true);return;}T.busy=true;setUI("busy");msg("Joining room "+code.toUpperCase()+"…");
  let P;try{P=await loadPeer();}catch(e){T.busy=false;setUI("idle");msg("Couldn't load the networking library. Check your internet connection and try again.",true);return;}
  const peer=new P(undefined,{debug:0});T.peer=peer;let done=false;
  const fail=t=>{if(done)return;done=true;try{peer.destroy();}catch(x){}T.busy=false;setUI("idle");msg(t,true);};
  const to=setTimeout(()=>fail("Couldn't reach that room. Check the code, or the host's network may block direct connections."),15000);
  peer.on("open",id=>{T.myId=id;const c=peer.connect(PREFIX+code,{reliable:true,serialization:"json"});
    c.on("open",()=>{if(done)return;done=true;clearTimeout(to);T.hubConn=c;T.connected=true;T.code=code;T.busy=false;keepAlive(peer);resolveRoom(lobby);setUI("joined");status();});
    c.on("data",clientData);c.on("close",lostHost);c.on("error",()=>{if(T.connected)lostHost();});});
  peer.on("error",e=>{if(T.connected)return;clearTimeout(to);fail(e&&e.type==="peer-unavailable"?"No room with that code. Check it with your host.":"Couldn't join ("+(e&&e.type||"network")+").");});}
/* ---- UI ---- */
function msg(t,bad){const el=$("p2pMsg");if(!el)return;el.textContent=t;el.classList.toggle("bad",!!bad);}
function invite(){const c=T.code.toUpperCase();return/^https?:/.test(location.protocol)?location.origin+location.pathname+"#join="+T.code:c;}
function status(){if(!T.connected)return;const n=(T.hub?T.conns.size:Math.max(0,st("lobby").size-1))+1;
  const c=T.code.toUpperCase();$("p2pCodeShow").textContent=c;
  msg(T.hub?`Room ${c} is open · ${n} player${n>1?"s":""} here. Send friends the code${/^https?:/.test(location.protocol)?" or invite link":""}. Keep this tab open: the room closes when you leave.`:`Connected to room ${c}. Deploy for arena, or join the host's CTF match below.`);}
function setUI(s){const on=s==="hosting"||s==="joined";$("p2pIdle").hidden=on||s==="closed";$("p2pLive").hidden=!on;$("p2pHost").disabled=$("p2pJoin").disabled=s==="busy";$("p2pCopy").hidden=s!=="hosting";}
function wire(){$("p2pHost").onclick=()=>host(0);$("p2pJoin").onclick=()=>join($("p2pCode").value);
  $("p2pCode").addEventListener("keydown",e=>{e.stopPropagation();if(e.key==="Enter")join($("p2pCode").value);});
  $("p2pCopy").onclick=()=>{const t=invite();const ok=()=>{$("p2pCopy").textContent="Copied";setTimeout(()=>$("p2pCopy").textContent="Copy invite",1500);};
    try{navigator.clipboard.writeText(t).then(ok,()=>prompt("Copy this:",t));}catch(e){prompt("Copy this:",t);}};
  const m=/[#&?]join=([a-z0-9]{5})/i.exec(location.hash+location.search);if(m){$("p2pCode").value=m[1].toUpperCase();join(m[1]);}}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",wire);else wire();
addEventListener("pagehide",()=>{try{send({t:"x",id:T.myId});if(T.peer)T.peer.destroy();}catch(e){}});
const lobby=mkRoom("lobby");
/* host services the game asks for: rooms and file downloads */
const downloads={save({filename,data}){const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([data],{type:"application/json"}));a.download=String(filename||"settings.json");document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),2000);return Promise.resolve();}};
window.KAHOST={use(n){return n==="room"?roomP:n==="downloads"?Promise.resolve(downloads):Promise.resolve(null);}};
window.__p2p={host,join,get state(){return{connected:T.connected,hub:T.hub,code:T.code,peers:T.conns.size};}};
})();
