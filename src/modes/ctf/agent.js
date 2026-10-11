/* ===== CTF agent: perception, objective pathing, combat with learned prediction, full movement kit ===== */
(function(){
const K=window.KA,T=K.THREE,CTF=window.CTF,NAV=CTF.NAV;
const V3=T.Vector3,clamp=K.clamp,rnd=K.rnd;
const gauss=()=>{let u=0,v=0;while(!u)u=Math.random();while(!v)v=Math.random();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);};
const _v=new V3(),_w=new V3(),_e=new V3(),_t=new V3();
const angDiff=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
function arcVel(from,to,deg,g){const dx=to.x-from.x,dz=to.z-from.z,x=Math.hypot(dx,dz),dy=to.y-from.y,th=deg*Math.PI/180,c=Math.cos(th),den=2*c*c*(x*Math.tan(th)-dy);if(den<=0||x<.5)return null;const v=Math.sqrt(g*x*x/den);if(v>21)return null;return new V3(dx/x*v*c,v*Math.sin(th),dz/x*v*c);}
const DIFF={normal:{react:.32,err:.035,turn:7},heroic:{react:.24,err:.022,turn:10},legendary:{react:.17,err:.013,turn:14}};
CTF.DIFF=DIFF;
let NEXT_ID=1;
class Agent{
  constructor(G,team,idx,name,human,remote,id){
    this.G=G;this.id=id||("a"+(NEXT_ID++));this.team=team;this.idx=idx;this.name=name;this.human=!!human;this.remote=!!remote;
    this.body=human&&!remote?K.me:new K.Body();this.rig=null;
    this.dead=false;this.respawnAt=0;this.carrying=null;this.role="attack";this.roleSince=0;
    this.path=null;this.pathI=0;this.repathT=0;this.goal=new V3();this.goalCell=-1;
    this.mag=32;this.reloadT=0;this.fireCD=0;this.firedT=-9;
    this.target=null;this.acqT=0;this.lastSeen=new Map();this.seeT=Math.random()*.1;
    this.strafeDir=1;this.strafeT=0;this.jinkT=1;this.stuckT=0;this.lastPos=new V3();
    this.poundHold=0;this.lastAttacker=null;this.lastHitT=-9;this.revTrack=new Map();
    this.k=0;this.d=0;this.caps=0;this.rets=0;this.shots=0;this.hits=0;this.laneOverride=null;this.fallback=false;
    this.aimYaw=0;this.aimPitch=0;this.sniper=0;this.sniperMag=0;this.nadeInv={frag:2,plasma:1};this.nadeCD=2;this._own=null;
  }
  get pos(){return this.body.pos;}
  get alive(){return this.human&&!this.remote?!K.me.dead:!this.dead;}
  get local(){return this.human&&!this.remote;}
  eye(out){return(out||new V3()).copy(this.body.pos).add(_e.set(0,this.body.h-.2,0));}
  chest(out){return(out||new V3()).copy(this.body.pos).add(_e.set(0,this.body.h*.68,0));}
  spawn(p){const b=this.body;b.reset();b.pos.set(p[0]+rnd(-.6,.6),p[1]+.02,p[2]+rnd(-.6,.6));b.yaw=this.team===0?Math.PI:0;b.pitch=0;b.spawnT=this.G.t;
    this.dead=false;this.spawned=true;this.mag=32;this.reloadT=0;this.target=null;this.nadeInv.frag=2;this.nadeInv.plasma=1;this.nadeCD=2+Math.random()*2;this.path=null;this.carrying=null;this.poundHold=0;this.fallback=false;this.sniper=0;this.sniperMag=0;
    if(this.rig){this.rig.revive();this.rig.root.visible=this.G.render;}}
  /* damage from anyone; returns {died,sh,name} for the player's hit marker */
  onHit(n,type,head,attacker){const b=this.body;
    if(this.remote){if(this.G.netHit)this.G.netHit(this,n,{w:type,hd:head,by:attacker||this.G.human});return{died:false,sh:b.shield>0,name:this.name};}const had=b.shield>0;const died=b.damage(n,this.G.t);
    if(!died&&this.G.t<b.spawnT+1.2)return{died:false,sh:had,name:this.name};
    attacker=attacker||this.G.human;this.lastAttacker=attacker;this.lastHitT=this.G.t;
    if(this.rig&&this.G.render)this.rig.flashHit();
    if(attacker&&!attacker.human&&b.shield<=0&&had)this.G.teams[attacker.team].brain.callFocus(this.G,attacker,this);
    if(!this.target&&attacker&&attacker.alive){this.target=attacker;this.acqT=this.G.t+this.skill().react*.7;}
    if(died)this.G.kill(this,attacker,type,head);
    return{died,sh:had,name:this.name};}
  skill(){return DIFF[this.G.diff[this.team]]||DIFF.legendary;}
  brain(){return this.G.teams[this.team].brain;}
  /* ---------------- perception ---------------- */
  perceive(){const G=this.G,br=this.brain();const eye=this.eye(_t);const fwdYaw=this.body.yaw;let best=null,bs=-1e9;
    for(const e of G.teams[1-this.team].agents){if(!e.alive)continue;const c=e.chest(_v);const d=eye.distanceTo(c);if(d>75)continue;
      const ang=Math.abs(angDiff(Math.atan2(-(c.x-eye.x),-(c.z-eye.z)),fwdYaw));
      const aware=ang<1.15||d<9||(this.lastAttacker===e&&G.t-this.lastHitT<2.5)||(this.lastSeen.get(e.id)||-9)>G.t-1.2;
      if(!aware)continue;_w.copy(c).sub(eye);const L=_w.length();_w.multiplyScalar(1/L);if(K.rayWorld(eye,_w,L)<L-.1)continue;
      this.lastSeen.set(e.id,G.t);br.callSpot(G,this,e);
      let s=-d;if(e.carrying)s+=40;if(this.role==="escort"){const c=G.flags[1-this.team].carrier;if(c&&e.pos.distanceTo(c.pos)<14)s+=18;}if(br.focus===e)s+=25;if(e.body.shield<=0)s+=12;if(e===this.target)s+=8;if(this.lastAttacker===e&&G.t-this.lastHitT<2)s+=10;
      if(s>bs){bs=s;best=e;}}
    if(best!==this.target){if(best)this.acqT=G.t+this.skill().react*(.8+Math.random()*.5);this.target=best;}
    if(this.target&&(!this.target.alive||G.t-(this.lastSeen.get(this.target.id)||-9)>.6))this.target=null;}
  /* ---------------- objective ---------------- */
  objective(){const G=this.G,br=this.brain(),me=this.team,them=1-me;const of=G.flags[me],tf=G.flags[them];const g=this.goal;
    const home=CTF.FLAG_HOME[me];const sign=me===0?1:-1;this.mustMove=false;
    switch(this.role){
      case"carry":if(of.state==="home"){g.copy(home);this.mustMove=true;}else{g.set(0,2.4,-47.5*sign);this.mustMove=this.pos.distanceTo(g)>2;}break;
      case"escort":{const c=tf.carrier;if(c){const th=this.nearestThreat(c.pos,18);if(th)g.copy(c.pos).lerp(th.pos,.35);else g.copy(c.pos).add(_v.set(this.idx%2?2.5:-2.5,0,-4*sign));}else g.copy(tf.pos);this.mustMove=true;break;}
      case"chase":{const c=of.carrier;if(c){const lead=Math.min(2.2,this.pos.distanceTo(c.pos)/10);g.copy(c.pos).addScaledVector(c.body.vel,lead);}else g.copy(of.pos);this.mustMove=true;break;}
      case"return":g.copy(of.pos);this.mustMove=true;break;
      case"grab":g.copy(tf.pos);this.mustMove=true;break;
      case"mid":g.set(this.idx%2?1.6:-1.6,3,-1.8*sign);break;
      case"defend":{const el=br.model.enemyLane;const tot=el[0]+el[1]+el[2];let lane=1,bv=-1;for(let i=0;i<3;i++){const v=el[i]/tot+(this.idx%2&&i!==1?.12:0);if(v>bv){bv=v;lane=i;}}
        const near=this.nearestThreat(home,22);if(near){g.copy(near.pos);this.mustMove=true;break;}
        const x=CTF.laneX(me,lane)*.35;g.set(x,lane===1?2.4:0,(-36+(lane===1?0:4))*sign);if(lane===1)g.set(this.idx%2?-4:4,2.4,-38.5*sign);break;}
      default:{// attack
        const p=br.plan;if(tf.state==="carried"&&tf.carrier&&tf.carrier.team===me){g.copy(tf.carrier.pos);this.mustMove=true;break;}
        if(p.staging){const lane=this.laneOverride!=null?this.laneOverride:p.lane;g.copy(br.stagePoint(lane));if(p.strat==="Split"&&this.idx%2)g.copy(br.stagePoint(p.lane2));}
        else{g.copy(tf.pos);this.mustMove=true;
          const dist=this.pos.distanceTo(tf.pos);
          if(tf.state==="home"&&dist<17){let th=0;for(const[,m]of br.enemyMem)if(G.t-m.t<2.5&&m.pos.distanceTo(tf.pos)<13)th++;
            let mates=0;for(const a of G.teams[me].agents)if(a.alive&&a.pos.distanceTo(tf.pos)<15)mates++;
            if(!br.holdT)br.holdT=G.t;
            if(th>0&&mates<=th&&G.t-br.holdT<10){g.copy(this.pos).lerp(tf.pos,.25);this.mustMove=false;br.say(G,this,"hot",th>1?`${th} on their stand. Clear it before we pull`:"One on their stand, clear him first");}
            else{if(th===0)br.say(G,this,"clear","Stand's clear, pulling");br.holdT=0;}}
        }
      }}
    // power weapon: one teammate breaks off to grab the sniper when it is up and nobody on the team has it
    if(!this.mustMove&&!this.carrying&&!(this.sniper>0)&&(this.role==="mid"||this.role==="attack"||this.role==="defend")&&G.pickups){
      for(const p of G.pickups){if(p.availIn>3)continue;const c=G.claims[me];const d=this.pos.distanceTo(p.pos);
        if(c&&c.a!==this&&c.a.alive&&G.t-c.t<5)continue;if(d>(this.role==="mid"?40:22)||G.sniperFor(me))continue;
        G.claims[me]={a:this,t:G.t};g.copy(p.pos);g.y=3;g.x+=this.team?1.3:-1.3;this.mustMove=true;if(d>12)br.say(G,this,"snpGo","Going for sniper");break;}}
    if(this.fallback&&this.role!=="carry"){g.copy(home).lerp(this.pos,.6);}
  }
  nearestThreat(p,r){let best=null,bd=r;for(const[,m]of this.brain().enemyMem){if(this.G.t-m.t>3)continue;const d=m.pos.distanceTo(p);if(d<bd){bd=d;best=m;}}return best;}
  /* ---------------- navigation ---------------- */
  navTo(dt,inp){const G=this.G;const p=this.pos;const cur=NAV.nearest(p.x,p.z,p.y);
    this.repathT-=dt;const gc=NAV.nearest(this.goal.x,this.goal.z,this.goal.y);
    if(!this.path||this.repathT<=0||gc!==this.goalCell&&this.repathT<.6){this.repathT=.9+Math.random()*.6;this.goalCell=gc;
      this.path=NAV.path(cur,gc,this.brain().costFn(this),3500);this.pathI=0;}
    const path=this.path;if(!path||path.length<2||cur===gc){return p.distanceTo(this.goal)>1.2?_w.copy(this.goal).sub(p).setY(0).normalize():null;}
    while(this.pathI<path.length-1){const c=NAV.pos(path[this.pathI],_v);if(Math.hypot(c.x-p.x,c.z-p.z)<.9)this.pathI++;else break;}
    let k=this.pathI;for(let j=Math.min(path.length-1,this.pathI+6);j>this.pathI;j--){if(NAV.clearLine(cur,path[j])){k=j;break;}}
    const tgt=NAV.pos(path[k],_v);const dir=_w.set(tgt.x-p.x,0,tgt.z-p.z);const L=dir.length();if(L>.01)dir.multiplyScalar(1/L);
    // jump / clamber edges just ahead
    const ni=Math.min(path.length-1,this.pathI);const nc=NAV.pos(path[ni],_e);
    if(nc.y-p.y>.5&&Math.hypot(nc.x-p.x,nc.z-p.z)<1.6&&this.body.ground)inp.jumpP=true;
    return dir;}
  /* ---------------- per-tick brain ---------------- */
  think(dt){const G=this.G,b=this.body,br=this.brain(),S=this.skill(),genes=br.genes;
    const inp={f:0,s:0,sprint:false,thrust:false,crouch:false,crouchP:false,jumpP:false,aim:false,meleeP:false};
    this.seeT-=dt;if(this.seeT<=0){this.seeT=.1;this.perceive();}
    this.objective();
    const tgt=this.target;const engaged=tgt&&G.t>=this.acqT;
    // morale: fall back to recharge when cracked and outgunned
    if(engaged&&b.shield<=0&&tgt.body.shield>25&&this.role!=="carry"&&this.role!=="chase"&&Math.random()<dt*(1.6-genes.aggr)){this.fallback=true;br.say(G,this,"low","Shields down, falling back");}
    if(this.fallback&&(b.shield>55||!tgt))this.fallback=false;
    let dir=this.navTo(dt,inp);if(dir)dir=new V3().copy(dir);
    const wish=new V3();if(dir)wish.copy(dir);
    let lookYaw=dir?Math.atan2(-wish.x,-wish.z):b.yaw,lookPitch=0;
    if(tgt){const eye=this.eye(new V3()),aim=this.aimPoint(tgt,new V3());const dx=aim.x-eye.x,dy=aim.y-eye.y,dz=aim.z-eye.z;const hd=Math.hypot(dx,dz);
      lookYaw=Math.atan2(-dx,-dz);lookPitch=Math.atan2(dy,hd);const range=Math.hypot(hd,dy);
      if(engaged){
        // strafe dance: unpredictable intervals (gene), blended with objective
        this.strafeT-=dt;if(this.strafeT<=0){this.strafeDir*=-1;const base=.55,v=genes.strafeVar;this.strafeT=base*(1-v*.8)+Math.random()*base*2*v;}
        const side=_e.set(Math.cos(lookYaw),0,-Math.sin(lookYaw)).multiplyScalar(this.strafeDir);
        const toT=_w.set(dx,0,dz).normalize();const pref=this.sniper>0?26:br.prefRange()*(this.carrying?1.4:1);
        const push=this.mustMove?.75:clamp((range-pref)/6,-.8,.8)*(this.fallback?-1:1)+(genes.aggr-.5)*.4;
        if(this.mustMove&&dir){wish.copy(dir).multiplyScalar(.85).addScaledVector(side,.6);}else wish.copy(toT).multiplyScalar(push).addScaledVector(side,.95);
        if(this.fallback&&dir){wish.copy(dir).addScaledVector(side,.5);}
        inp.aim=(range>8||this.sniper>0)&&!this.carrying&&!this.mustMove&&b.ground;
        // movement tech
        this.jinkT-=dt;if(this.jinkT<=0&&b.ground){this.jinkT=1.2+Math.random()*2;if(Math.random()<.35)inp.jumpP=true;}
        if(b.thrustCD<=0&&(G.t-this.lastHitT<.4)&&Math.random()<dt*8*genes.thrustDodge){inp.thrust=true;wish.copy(side).multiplyScalar(Math.random()<.5?1:-1);}
        if(!b.ground&&b.vel.y<1&&dy<-2&&hd<4.5&&b.pound===0&&Math.random()<dt*6*genes.pound&&tgt.body.shield<70){this.poundHold=.62;}
        if(!b.ground&&!this.poundHold&&dy<-1.2&&b.stabT<1)inp.aim=true; // stabilize over them
        if(range<2.3&&b.meleeCD<=0)inp.meleeP=true;
        else if(range<6&&b.sprintT>.85&&Math.random()<dt*10*genes.charge){inp.meleeP=true;}
        if(range<8&&range>3&&b.thrustCD<=0&&tgt.body.shield<=0&&b.shield>30&&Math.random()<dt*2*genes.aggr){inp.thrust=true;wish.copy(toT);}
        if(range<9&&range>4&&genes.charge>.5&&b.shield>50&&!this.mustMove)inp.sprint=true;
      }
    }else{
      if(dir){inp.sprint=true;if(b.sprint&&this.path&&this.mustMove&&Math.random()<dt*.15)inp.crouchP=true;}
      if(this.reloadT<=0&&this.mag<18&&G.t-this.lastHitT>2)this.reloadT=K.RELOAD_TIME;
    }
    if(this.poundHold>0){this.poundHold-=dt;inp.crouch=this.poundHold>0;if(this.poundHold>=.6)inp.crouchP=true;if(tgt){lookPitch=-1.2;}}
    // get clear of live enemy grenades
    for(const L of[G.nades.list,G.human?K.MAIN_NADES.list:null]){if(!L)continue;for(const n of L){if(n.owner&&n.owner.team===this.team||n.t>1.2||!(n.landed||n.stuck||n.rest))continue;const dx=this.pos.x-n.pos.x,dz=this.pos.z-n.pos.z,d=Math.hypot(dx,dz);
      if(d<4.8&&Math.random()<.9){wish.set(dx/(d||1),0,dz/(d||1));inp.sprint=true;inp.aim=false;if(d<3.5&&b.thrustCD<=0)inp.thrust=true;lookYaw=b.yaw;break;}}}
    // turn with finite speed (skill)
    const tr=S.turn*dt;b.yaw+=clamp(angDiff(lookYaw,b.yaw),-tr,tr);b.pitch+=clamp(lookPitch-b.pitch,-tr,tr);
    // world wish -> local controls
    if(wish.lengthSq()>.0004){const fwd=_e.set(-Math.sin(b.yaw),0,-Math.cos(b.yaw)),rt=_t.set(Math.cos(b.yaw),0,-Math.sin(b.yaw));
      inp.f=clamp(wish.dot(fwd),-1,1);inp.s=clamp(wish.dot(rt),-1,1);if(inp.sprint&&inp.f<.5)inp.sprint=false;}
    // stuck recovery
    if(dir&&b.ground&&Math.hypot(b.vel.x,b.vel.z)<.6){this.stuckT+=dt;if(this.stuckT>.5)inp.jumpP=true;if(this.stuckT>1.4){this.path=null;this.stuckT=0;inp.thrust=b.thrustCD<=0;}}else this.stuckT=0;
    // fire
    this.fireCD-=dt;if(this.reloadT>0){this.reloadT-=dt;if(this.reloadT<=0)this.mag=32;}
    if(engaged&&this.reloadT<=0&&this.fireCD<=0&&!b.sprint&&b.pound===0&&!b.clamber&&b.chargeT<=0){
      const err=Math.abs(angDiff(lookYaw,b.yaw))+Math.abs(lookPitch-b.pitch);if(err<(this.sniper>0&&tgt.pos.distanceTo(this.pos)>6?.05:.09))this.shoot(tgt);}
    if(this.mag<=0&&this.reloadT<=0)this.reloadT=K.RELOAD_TIME;
    this.nadeCD-=dt;if(this.nadeCD<=0&&!b.clamber&&b.pound===0&&!this.carrying){const plan=this.nadePlan();if(plan)this.throwNade(plan.type,plan.at);}
    b.speedMul=1;
    return inp;}
  nadePlan(){const G=this.G,br=this.brain();const eye=this.eye(new V3());const t=this.target;
    if(t&&G.t>=this.acqT&&this.nadeInv.plasma>0){const d=eye.distanceTo(t.pos);if(d>5&&d<13&&Math.random()<.35+.4*br.genes.aggr)return{type:"plasma",at:t.chest(new V3()).addScaledVector(t.body.vel,d/17)};}
    if(this.nadeInv.frag>0){let best=null,bs=0;for(const[,m]of br.enemyMem){const age=G.t-m.t;if(age>2.2)continue;const d=eye.distanceTo(m.pos);if(d<7||d>21)continue;
        let s=1;if(age>.4)s+=1;for(const[,o]of br.enemyMem)if(o!==m&&G.t-o.t<2&&o.pos.distanceTo(m.pos)<4)s+=1.5;if(m.carrier)s+=1.5;if(s>bs){bs=s;best=m;}}
      if(best&&bs>=2&&Math.random()<.65){const fl=Math.min(1.1,eye.distanceTo(best.pos)/17);return{type:"frag",at:best.pos.clone().addScaledVector(best.vel,fl*.7).add(new V3(0,.1,0))};}}
    this.nadeCD=.8+Math.random();return null;}
  throwNade(type,at){const G=this.G,b=this.body;const o=this.eye(new V3());if(type==="frag"){const dx=at.x-o.x,dz=at.z-o.z,x=Math.hypot(dx,dz);if(x>4){at=at.clone();at.x-=dx/x*2;at.z-=dz/x*2;}}const v=type==="plasma"?K.solveThrow(o,at,17,20):arcVel(o,at,38,20);if(!v){this.nadeCD=1.5;return;}
    this.nadeInv[type]--;this.nadeCD=5+Math.random()*3;o.addScaledVector(v.clone().normalize(),.45);b.yaw=Math.atan2(-v.x,-v.z);
    G.nades.throw(type,o,v,this.nadeOwner());G.emit("nade",{type,pos:o,vel:v,by:this});this.brain().say(G,this,"nade",type==="plasma"?"Plasma out":"Frag out");}
  nadeOwner(){if(this._own)return this._own;const G=this.G,me=this;
    this._own={team:me.team,
      stickables:()=>{const out=[];for(const e of G.teams[1-me.team].agents)if(e.alive)out.push({ref:e,pos:e.body.pos,h:e.body.h});return out;},
      onStick:ref=>{me.brain().say(G,me,"stuck",`Stuck ${ref.name}!`,true);if(ref.human&&G.render)K.toast("You've been stuck!");},
      onExplode:(c,type,stuck)=>{const w=type==="plasma"?"stick":"frag";for(const e of G.teams[1-me.team].agents){if(!e.alive)continue;const ch=e.body.pos.clone();ch.y+=e.body.h*.6;
        const dmg=e===stuck?999:K.losClear(c,ch)?K.nadeDmg(type,ch.distanceTo(c)):0;if(dmg<1)continue;if(e.human)G.hurtHuman(e,Math.round(dmg),{name:me.name,agent:me,w});else e.onHit(Math.round(dmg),w,false,me);}}};
    return this._own;}
  /* aim point with learned strafe prediction */
  aimPoint(e,out){const br=this.brain(),G=this.G;const eye=this.eye(_e);const head=e.body.pos.clone().add(_w.set(0,e.body.h-.24,0));
    const range=eye.distanceTo(head);if(range>30)head.y-=.45; // body shots at long range
    // lateral velocity relative to line of sight
    const los=_w.copy(head).sub(eye).setY(0).normalize();const lat=_t.set(-los.z,0,los.x);const vl=e.body.vel.dot(lat);
    // track reversals for learning
    let tr=this.revTrack.get(e.id);if(!tr){tr={sign:Math.sign(vl),t:G.t};this.revTrack.set(e.id,tr);}
    if(Math.abs(vl)>2&&Math.sign(vl)!==tr.sign){const iv=G.t-tr.t;if(iv>.12&&iv<3)br.observeStrafe(iv);tr.sign=Math.sign(vl);tr.t=G.t;}
    const S=this.skill();const react=S.react*.6;const since=G.t-tr.t;
    let lead=vl*react;if(since+react>br.model.enemyRev*(.9+Math.random()*.2))lead=-lead*.4; // predicted reversal
    out.copy(head).addScaledVector(lat,lead*.85);
    const mv=Math.hypot(this.body.vel.x,this.body.vel.z);const sig=S.err*(1+mv*.05+(this.body.ground?0:.6))*range;
    out.x+=gauss()*sig;out.y+=gauss()*sig*.8;out.z+=gauss()*sig;return out;}
  shootSniper(tgt){const G=this.G,b=this.body;this.sniper--;this.sniperMag--;if(this.sniperMag<=0){this.sniperMag=Math.min(4,this.sniper);this.fireCD=2.4;}else this.fireCD=.75;this.firedT=G.t;this.shots++;
    const eye=this.eye(new V3());const d=b.aimDir();const sp=b.ground?.0015:.03;d.x+=rnd(-sp,sp);d.y+=rnd(-sp,sp);d.z+=rnd(-sp,sp);d.normalize();
    const wh=K.rayWorldHit(eye,d,220),wt=wh.t;let best=null;
    for(const e of G.teams[1-this.team].agents){if(!e.alive)continue;const h=K.rayTarget(eye,d,e.body.pos,e.body.h,wt);if(h&&(!best||h.t<best.h.t))best={e,h};}
    const end=eye.clone().addScaledVector(d,best?best.h.t:Math.min(wt,220));
    if(G.render){const mz=eye.clone().addScaledVector(d,.9).add(_v.set(Math.cos(b.yaw)*.18,-.28,-Math.sin(b.yaw)*.18));K.tracer(mz,end,0x9fd8ff,.6);
      if(best)K.spark(end,4,best.e.body.shield>0?0xffd36b:0xff7a6a);else if(wt<220)K.spark(end,3);K.sfx("sshot",K.distVol(eye,120)*.8);}
    if(!best&&wh.b)K.damageBox(wh.b,36,eye.clone().addScaledVector(d,wt),"bullet",G.render);
    if(best){this.hits++;const hd=best.h.head;const dmg=hd?999:60;this.brain().model.acc[0]++;
      if(best.e.human)G.hurtHuman(best.e,dmg,{name:this.name,agent:this,w:"sniper",hd});else best.e.onHit(dmg,"sniper",hd,this);}
    this.brain().model.acc[1]++;}
  shoot(tgt){if(this.sniper>0&&!this.carrying)return this.shootSniper(tgt);const G=this.G,b=this.body;this.mag--;this.fireCD=this.carrying?.16:.105;this.firedT=G.t;this.shots++;
    const eye=this.eye(new V3());const d=b.aimDir();const sp=b.ground?.004:.01;d.x+=rnd(-sp,sp);d.y+=rnd(-sp,sp);d.z+=rnd(-sp,sp);d.normalize();
    const wh=K.rayWorldHit(eye,d,90),wt=wh.t;let best=null;
    for(const e of G.teams[1-this.team].agents){if(!e.alive)continue;const h=K.rayTarget(eye,d,e.body.pos,e.body.h,wt);if(h&&(!best||h.t<best.h.t))best={e,h};}
    const end=eye.clone().addScaledVector(d,best?best.h.t:Math.min(wt,90));
    if(G.render){const mz=eye.clone().addScaledVector(d,.7).add(_v.set(Math.cos(b.yaw)*.18,-.28,-Math.sin(b.yaw)*.18));K.tracer(mz,end,CTF.TEAM_INT[this.team]);
      if(best)K.spark(end,2,best.e.body.shield>0?0xffd36b:0xff7a6a);else if(wt<90)K.spark(end);K.sfx("shot",K.distVol(eye,55)*.7);}
    if(!best&&wh.b)K.damageBox(wh.b,5.4,eye.clone().addScaledVector(d,wt),"bullet",G.render);
    if(best){this.hits++;const dmg=best.h.head&&best.e.body.shield<=0?16:9; /* arena rule: headshot bonus only once shields are down */const br=this.brain();br.model.acc[0]++;
      if(best.e.human)G.hurtHuman(best.e,dmg,{name:this.name,agent:this,w:"rifle",hd:best.h.head});else best.e.onHit(dmg,"rifle",best.h.head,this);}
    this.brain().model.acc[1]++;
    if(this.mag<=0)this.reloadT=K.RELOAD_TIME;}
  /* events from the physics body */
  onEvent(type,d){const G=this.G;
    if(type==="slam"){for(const e of G.teams[1-this.team].agents){if(!e.alive)continue;const dd=e.body.pos.distanceTo(d.pos);if(dd<5){const n=Math.round(120-dd*18);if(e.human)G.hurtHuman(e,n,{name:this.name,agent:this,w:"pound"});else e.onHit(n,"pound",false,this);}}
      if(G.render){K.shock(d.pos);K.sfx("slam",K.distVol(d.pos,50));}K.damageRadius(d.pos,5,260,G.render);}
    else if(type==="melee"||type==="charge"){const r=type==="charge"?1.8:2.3;const f=this.body.fwd();
      for(const e of G.teams[1-this.team].agents){if(!e.alive)continue;const dx=e.body.pos.x-this.pos.x,dz=e.body.pos.z-this.pos.z,dist=Math.hypot(dx,dz);
        if(dist<r&&Math.abs(e.body.pos.y-this.pos.y)<1.6&&(dx*f.x+dz*f.z)/Math.max(dist,.01)>.4){const dmg=type==="charge"?(e.body.shield<=0?999:85):70;if(e.human)G.hurtHuman(e,dmg,{name:this.name,agent:this,w:type});else e.onHit(dmg,type,false,this);if(G.render)K.sfx("land",K.distVol(this.pos,30));break;}}
      if(G.render&&type==="charge")K.sfx("charge",K.distVol(this.pos,30)*.6);}
    else if(G.render){if(type==="thrust"){K.thrustPuff(this.pos,d.dir);K.sfx("thrust",K.distVol(this.pos)*.5);}else if(type==="land"&&d.vy>10)K.dust(this.pos,6,2,.4);}}
}
CTF.Agent=Agent;
})();
