/* ============ deploy ============ */
function savePrefs(){try{localStorage.setItem("ka-pilot",JSON.stringify({n:myName,c:myColor,vo:VO.on}));}catch(e){}}
$("deploy").onclick=()=>{
  myName=($("callsign").value||"Pilot").trim().slice(0,14)||"Pilot";VO.on=$("vo").checked;savePrefs();
  botsOn=$("bots").checked;makeBots();audio();vmArmor.color.set(myColor).multiplyScalar(.55);
  if(document.activeElement)document.activeElement.blur();
  spawn(me);playing=true;reloadT=0;refill();streak=0;multi=0;$("menu").hidden=true;$("hud").hidden=false;if(isTouch)$("touch").hidden=false;else if(!padRecent())lock();
  sfx("stinger");say("Arena online",true);
  sendPresence(true);
};
function leaveGame(){MAIN_NADES.clear();if(EXT){const e=EXT;EXT=null;if(e.exit)e.exit();showWorld();}playing=false;paused=false;$("pause").hidden=true;$("hud").hidden=true;$("touch").hidden=true;$("dead").hidden=true;$("menu").hidden=false;try{document.exitPointerLock();}catch(e){}
  if(room)room.presence({p:null}).catch(()=>{});}
$("callsign").addEventListener("keydown",e=>{if(e.key==="Enter")$("deploy").click();});
