/* Mi Polla: app local, sin cuentas ni backend. Los datos quedan en este teléfono. */
(function(){
"use strict";
const C=window.PollaCore;
const STORAGE="mi-polla-state-v1";
const API="https://raw.githubusercontent.com/nfgalindez-aiko/sorteos-ar/main/data/quiniela/ciudad/";
const weekdays=["Lun","Mar","Mié","Jue","Vie"];
const pad=(n)=>String(n).padStart(2,"0");
const html=(v)=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const $=(id)=>document.getElementById(id);
const stateDefault=()=>({v:1,name:"Mi jugada",weeks:{},draws:{}});
let state=stateDefault();
try{
  const raw=localStorage.getItem(STORAGE);
  if(raw){const parsed=JSON.parse(raw);
    if(parsed&&parsed.v===1&&typeof parsed.weeks==="object"&&typeof parsed.draws==="object")
      state={...stateDefault(),...parsed};}
}catch(err){console.warn("No se pudo leer el almacenamiento",err)}
let selectedWeek=C.mondayOf(C.argNow().date);
let selectedDay=C.argNow().date;
let page="tablero",toastTimer=null,fetchBusy=false;
const validWeek=(w)=>/^\d{4}-\d{2}-\d{2}$/.test(w);
function save(){
 try{localStorage.setItem(STORAGE,JSON.stringify(state));}
 catch(e){toast("No se pudieron guardar los datos. Revisá el espacio del teléfono.");}
}
function toast(message){
 const el=$("toast");el.textContent=message;el.classList.remove("hidden");
 clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.add("hidden"),4200);
}
function presentDate(iso){const d=new Date(iso+"T12:00:00Z");
 return new Intl.DateTimeFormat("es-AR",{day:"2-digit",month:"short",timeZone:"UTC"}).format(d).replace(".","");}
function record(){return state.weeks[selectedWeek]||null}
function eligibleForWeek(){
 const next=C.nextEligibleDraw(new Date(),state.draws);
 return C.mondayOf(next)===selectedWeek?next:null;
}
function weekTitle(w){
 const end=C.offsetDate(w,4);
 const a=new Date(w+"T12:00:00Z"),b=new Date(end+"T12:00:00Z");
 const fmt=d=>new Intl.DateTimeFormat("es-AR",{day:"numeric",month:"short",timeZone:"UTC"}).format(d);
 return fmt(a)+" — "+fmt(b);
}
function iconNum(n){return pad(n)}
function render(){
 const dates=C.weekDates(selectedWeek),r=record();
 const seen=C.firstSeen(selectedWeek,state.draws);
 const calc=r?C.evaluate(r,state.draws):{won:{},hitCount:0,pending:[],active:[],dayReport:[]};
 $("week-title").textContent=weekTitle(selectedWeek);
 $("week-subtitle").textContent=selectedWeek===C.mondayOf(C.argNow().date)?"Semana actual · lunes a viernes":"Resultados de esa semana";
 $("player-title").textContent=state.name||"Mi jugada";
 $("hit-count").innerHTML=calc.hitCount+' <small>/ 10</small>';
 $("hit-percent").textContent=calc.hitCount*10+"%";
 $("progress-bar").style.width=(calc.hitCount*10)+"%";
 $("pending-text").textContent=r?(calc.hitCount===10?"¡Completaste los diez! 🎉":
   calc.pending.length+" número"+(calc.pending.length===1?" pendiente":"s pendientes")):"Todavía no cargaste tus 10 números";
 const status=$("status-pill");
 status.classList.toggle("ok",!!r);
 status.textContent=r?(calc.hitCount===10?"¡10/10!":calc.hitCount+"/10 acertados"):"Sin cargar";
 const effective=eligibleForWeek();
 $("edit-picks").textContent=r?"⇄ Cambiar pendientes":"+ Elegir mis 10";
 $("edit-picks").disabled=!effective;
 $("edit-picks").title=!effective?"Esta semana no admite nuevas elecciones por fecha de sorteo.":"";
 const picks=$("my-numbers");
 picks.innerHTML=r?calc.active.map(n=>{
  const wonDate=calc.won[n],index=wonDate?dates.indexOf(wonDate):-1;
  const c=index>=0?C.WEEK_COLORS[index]:"";
  return '<div class="pick '+(wonDate?"won":"pending")+'" '+(wonDate?'style="--pick-color:'+c+'"':'')+
    ' title="'+(wonDate?"Acertó el "+C.dayLabel(wonDate):"Pendiente")+'">'+n+'</div>';
 }).join(""):'<div class="empty-picks">Elegí tus diez números para empezar a seguir la semana</div>';
 const count=dates.filter(d=>state.draws[d]?.numbers?.length===20).length;
 $("draw-count").textContent=count+"/5 noches";
 const board=$("number-board");
 board.innerHTML=Array.from({length:100},(_,i)=>{
  const n=pad(i),occ=seen[n],color=occ?C.WEEK_COLORS[occ.dayIndex]:"";
  const isWon=!!calc.won[n],isPending=calc.pending.includes(n);
  return '<button type="button" class="cell '+(occ?"seen ":"")+(isWon?"won ":"")+(isPending?"pending ":"")+
   '" '+(color?'style="--day-color:'+color+'" ':"")+
   'aria-label="'+n+(occ?", salió el "+C.DAY_NAMES[occ.dayIndex]:"")+
   (isWon?", acertado":isPending?", pendiente":"")+'" data-number="'+n+'">'+n+'</button>';
 }).join("");
 $("change-list").innerHTML=r&&r.changes.length?
  r.changes.map(ch=>'<div class="change-item"><span class="swap">⇄</span><div><strong>'+
  html(ch.from)+' → '+html(ch.to)+'</strong><small>Cuenta desde '+html(C.dayLabel(ch.effectiveDate))+
  ' '+html(presentDate(ch.effectiveDate))+' · registrado '+html(new Date(ch.at).toLocaleString("es-AR",{timeZone:"America/Argentina/Buenos_Aires",day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}))+'</small></div></div>').join(""):
  '<p class="subtle">Todavía no hiciste cambios. Los aciertos confirmados quedan fijos.</p>';
 renderDays(dates,calc);
 renderHistory();
 renderStudy();
 $("week-next").disabled=selectedWeek>=C.mondayOf(C.offsetDate(C.argNow().date,14));
}
function renderDays(dates,calc){
 if(!dates.includes(selectedDay))selectedDay=dates[0];
 $("draw-day-tabs").innerHTML=dates.map((d,i)=>{
  const exists=!!state.draws[d];
  return '<button class="day-tab '+(exists?"ready ":"")+(selectedDay===d?"selected":"")+
    '" '+(selectedDay===d?'style="--day-color:'+C.WEEK_COLORS[i]+'"':'')+' data-date="'+d+'">'+weekdays[i]+'</button>';
 }).join("");
 const dr=state.draws[selectedDay],detail=$("draw-detail");
 if(!dr){detail.innerHTML='<p class="subtle">Todavía no hay resultados cargados para esta nocturna.</p>';return}
 const mine=calc.dayReport.find(x=>x.date===selectedDay)?.newHits||[];
 detail.innerHTML='<div class="prize-grid">'+dr.numbers.map((n,i)=>
  '<div class="prize '+(mine.includes(n.slice(-2))?"mine":"")+'"><span class="rank">'+(i+1)+'.</span> '+html(n)+'</div>').join("")+'</div>'+
  '<p class="help">'+(dr.verified?"✓ Fuente marcada como validada":"⚠ Carga manual sin verificación automática")+
  ' · '+html(dr.source)+'. Aciertos nuevos del día: '+mine.length+'.</p>';
}
function renderHistory(){
 const keys=Object.keys(state.weeks).sort().reverse();
 $("history-list").innerHTML=keys.length?keys.map(w=>{
  const r=state.weeks[w],s=C.evaluate(r,state.draws);
  return '<button class="history-card" data-week="'+html(w)+'"><div><strong>'+html(weekTitle(w))+
    '</strong><small>'+r.changes.length+' cambio(s) · Inicio '+html(presentDate(r.startEffective))+
    '</small></div><b>'+s.hitCount+'/10</b> ›</button>';
 }).join(""):'<p class="subtle">Tu primera semana aparecerá acá cuando cargues tus diez números.</p>';
}
function renderStudy(){
 const dates=Object.keys(state.draws).sort();
 const counts=Array(100).fill(0),weekCounts=Array(100).fill(0);
 for(const d of dates){
  for(const raw of state.draws[d].numbers||[]){
   counts[+raw.slice(-2)]++;
   if(C.mondayOf(d)===selectedWeek)weekCounts[+raw.slice(-2)]++;
  }
 }
 const makeList=(scores,limit)=>{
  const sorted=Array.from({length:100},(_,i)=>i).filter(n=>scores[n]>0)
   .sort((a,b)=>scores[b]-scores[a]||a-b).slice(0,limit);
  if(!sorted.length)return '<p class="subtle">Primero necesitás descargar algunas nocturnas.</p>';
  const mx=scores[sorted[0]]||1;
  return sorted.map(n=>'<div class="stat-row"><span class="stat-ball">'+pad(n)+
   '</span><span class="track"><i style="width:'+(scores[n]/mx*100)+'%"></i></span><em>'+
   scores[n]+' aparición'+(scores[n]===1?"":"es")+'</em></div>').join("");
 };
 $("hot-list").innerHTML=makeList(counts,10);
 $("week-frequency").innerHTML=makeList(weekCounts,8);
}
function modal(kicker,title,body){
 $("modal-kicker").textContent=kicker;
 $("modal-title").textContent=title;
 $("modal-body").innerHTML=body;
 $("modal-backdrop").classList.remove("hidden");
 $("modal-backdrop").setAttribute("aria-hidden","false");
}
function closeModal(){
 $("modal-backdrop").classList.add("hidden");
 $("modal-backdrop").setAttribute("aria-hidden","true");
}
function modalError(message){const el=$("modal-error");if(el)el.textContent=message;else toast(message)}
function choosePicks(){
 const eff=eligibleForWeek();if(!eff){toast("No se pueden registrar números para esta semana.");return}
 const r=record();
 if(r){openSwap(eff);return}
 const content='<label for="pick-entry">Tus diez números (00–99)</label>'+
  '<textarea id="pick-entry" class="field" rows="2" placeholder="03, 11, 24, 37, 42, 56, 61, 73, 85, 92"></textarea>'+
  '<p class="help">Podés escribirlos separados por espacios o comas. Los diez empiezan a valer desde la próxima nocturna disponible.</p>'+
  '<div class="notice">Inicio de vigencia: <strong>'+html(C.dayLabel(eff))+' '+html(presentDate(eff))+
  '</strong>. Los resultados anteriores no cuentan como aciertos.</div><p id="modal-error" class="error-msg"></p>'+
  '<div class="modal-actions"><button class="btn btn-secondary" id="cancel-form">Cancelar</button>'+
  '<button class="btn btn-primary" id="save-picks">Guardar mis 10</button></div>';
 modal("PRIMERA SELECCIÓN","Elegí tus números",content);
 $("cancel-form").onclick=closeModal;
 $("save-picks").onclick=()=>{
  try{
   const picks=C.parsePicks($("pick-entry").value);
   const created=C.createWeek(selectedWeek,picks,eff);
   state.weeks[selectedWeek]=created;save();render();closeModal();toast("¡Jugadita guardada!");
  }catch(e){modalError(e.message)}
 };
}
function openSwap(eff){
 const r=record(),current=C.evaluate(r,state.draws);
 if(current.hitCount===10){toast("¡Ya acertaste los diez! No hay pendientes para cambiar.");return}
 const opts=current.pending;
 if(!opts.length){toast("No hay números pendientes.");return}
 const inUse=new Set(current.active);
 const optsHTML=opts.map(n=>'<button type="button" data-from="'+n+'">'+n+'</button>').join("");
 const other=Array.from({length:100},(_,i)=>pad(i)).filter(n=>!inUse.has(n));
 const grid=other.map(n=>'<button type="button" data-to="'+n+'">'+n+'</button>').join("");
 modal("CAMBIOS VÁLIDOS DESDE LA PRÓXIMA NOCTURNA","Cambiar un pendiente",
  '<p class="help">1. Tocá el número que querés sacar:</p><div id="from-options" class="swap-options">'+optsHTML+'</div>'+
  '<p class="help">2. Tocá el número que querés incorporar:</p><div id="to-options" class="mini-number-grid">'+grid+'</div>'+
  '<div class="notice">El cambio se registra para <strong>'+html(C.dayLabel(eff))+' '+html(presentDate(eff))+
  '</strong>. No se contará ningún premio de una noche anterior. Los números ya acertados no se tocan.</div>'+
  '<p id="modal-error" class="error-msg"></p><div class="modal-actions">'+
  '<button class="btn btn-secondary" id="cancel-form">Cancelar</button>'+
  '<button class="btn btn-primary" id="save-swap">Confirmar cambio</button></div>');
 let from="",to="";
 $("from-options").onclick=(e)=>{
  const btn=e.target.closest("button[data-from]");if(!btn)return;
  from=btn.dataset.from;
  $("from-options").querySelectorAll("button").forEach(b=>b.classList.toggle("selected",b===btn));
 };
 $("to-options").onclick=(e)=>{
  const btn=e.target.closest("button[data-to]");if(!btn)return;
  to=btn.dataset.to;
  $("to-options").querySelectorAll("button").forEach(b=>b.classList.toggle("selected",b===btn));
 };
 $("cancel-form").onclick=closeModal;
 $("save-swap").onclick=()=>{
  if(!from||!to){modalError("Seleccioná un número para sacar y otro para incorporar.");return}
  try{state.weeks[selectedWeek]=C.appendSwap(r,state.draws,from,to,eff);
    save();render();closeModal();toast(from+" → "+to+" registrado para "+C.dayLabel(eff));}
  catch(e){modalError(e.message)}
 };
}
function openManual(){
 const d=selectedDay;
 modal("CARGA DE RESPALDO","Ingresar 20 premios",
  '<p class="help">Ciudad Nocturna · '+html(C.dayLabel(d))+' '+html(presentDate(d))+
  '. Pegá los 20 premios de cuatro cifras, desde el 1.º hasta el 20.º.</p>'+
  '<textarea class="field" id="manual-entry" rows="6" placeholder="1234 5678 9012 ..."></textarea>'+
  '<p class="notice">Los resultados ingresados manualmente quedan señalados como <strong>no verificados</strong>. Revisalos contra el extracto oficial.</p>'+
  '<p id="modal-error" class="error-msg"></p><div class="modal-actions"><button class="btn btn-secondary" id="cancel-form">Cancelar</button>'+
  '<button class="btn btn-primary" id="save-manual">Guardar premios</button></div>');
 $("cancel-form").onclick=closeModal;
 $("save-manual").onclick=()=>{
  try{const next=C.normalizeManualDraw($("manual-entry").value,d);
   state.draws[d]=next;save();render();closeModal();toast("20 premios cargados para "+C.dayLabel(d));}
  catch(e){modalError(e.message)}
 };
}
function openSettings(){
 modal("PREFERENCIAS","Mi Polla · Ajustes",
  '<label for="profile-name">Nombre de tu jugada</label>'+
  '<input class="field" id="profile-name" maxlength="36" value="'+html(state.name)+'">'+
  '<div class="modal-actions"><button class="btn btn-primary" id="save-name">Guardar nombre</button></div>'+
  '<div class="notice">Los datos quedan únicamente en este dispositivo. Antes de desinstalar o cambiar de teléfono, guardá un respaldo.</div>'+
  '<label>Respaldo de números, cambios e historial</label>'+
  '<button class="btn btn-secondary" id="export-backup">Ver / copiar respaldo</button> '+
  '<button class="btn btn-secondary" id="import-backup">Importar respaldo</button>'+
  '<p class="help">El respaldo es un texto JSON. Podés copiarlo, guardarlo y pegarlo al restaurar.</p>');
 $("save-name").onclick=()=>{
  state.name=$("profile-name").value.trim().slice(0,36)||"Mi jugada";
  save();render();closeModal();toast("Nombre guardado");
 };
 $("export-backup").onclick=()=>{
  const data=JSON.stringify(state,null,2);
  modal("RESGUARDÁ TUS DATOS","Copia de seguridad",
   '<textarea id="backup-text" class="field" rows="11" readonly>'+html(data)+'</textarea>'+
   '<p class="help">Copiá el texto completo y guardalo fuera de la aplicación.</p>'+
   '<div class="modal-actions"><button class="btn btn-secondary" id="backup-back">Volver</button>'+
   '<button class="btn btn-primary" id="copy-backup">Copiar respaldo</button></div>');
  $("backup-back").onclick=openSettings;
  $("copy-backup").onclick=async()=>{
   try{await navigator.clipboard.writeText(data);toast("Respaldo copiado");}
   catch{$("backup-text").select();toast("Seleccioná y copiá el texto del respaldo.");}
  };
 };
 $("import-backup").onclick=()=>{
  modal("RESTAURACIÓN","Importar copia de seguridad",
   '<p class="help">Pegá el respaldo anterior. Esta acción reemplazará los datos guardados en este teléfono.</p>'+
   '<textarea id="import-text" class="field" rows="8" placeholder="{ &quot;v&quot;: 1, ... }"></textarea>'+
   '<p id="modal-error" class="error-msg"></p><div class="modal-actions">'+
   '<button class="btn btn-secondary" id="backup-back">Cancelar</button>'+
   '<button class="btn btn-primary" id="confirm-import">Restaurar datos</button></div>');
  $("backup-back").onclick=openSettings;
  $("confirm-import").onclick=()=>{
   try{
    const value=$("import-text").value;
    if(value.length>750000)throw Error("Ese respaldo es demasiado grande.");
    const obj=JSON.parse(value);
    if(obj?.v!==1||!obj.weeks||!obj.draws||typeof obj.weeks!=="object"||typeof obj.draws!=="object"||
     Array.isArray(obj.weeks)||Array.isArray(obj.draws))throw Error("El formato del respaldo no es válido.");
    for(const [w,p] of Object.entries(obj.weeks)){
     if(!validWeek(w)||!p||!Array.isArray(p.initialNumbers)||p.initialNumbers.length!==10||
      !Array.isArray(p.changes)||p.changes.length>50)throw Error("Hay una jugada inválida en el respaldo.");
     C.parsePicks(p.initialNumbers.join(" "));
    }
    for(const [d,prize] of Object.entries(obj.draws)){
     if(!validWeek(d)||!Array.isArray(prize?.numbers)||prize.numbers.length!==20||
      !prize.numbers.every(n=>/^\d{4}$/.test(n)))throw Error("Hay premios inválidos en el respaldo.");
    }
    state={v:1,name:String(obj.name||"Mi jugada").slice(0,36),weeks:obj.weeks,draws:obj.draws};
    save();selectedWeek=C.mondayOf(C.argNow().date);render();closeModal();toast("Respaldo restaurado");
   }catch(e){modalError(e.message)}
  };
 };
}
function switchPage(next){
 page=next;
 ["tablero","estudio","historial"].forEach(id=>{
  $("view-"+id).classList.toggle("hidden",id!==next);
 });
 document.querySelectorAll(".tab").forEach(el=>el.classList.toggle("active",el.dataset.page===next));
 window.scrollTo({top:0,behavior:"instant"});
}
async function fetchWeek(week,force=false){
 if(fetchBusy)return;
 fetchBusy=true;$("refresh-results").disabled=true;
 $("source-note").classList.remove("error");
 $("source-note").textContent="Buscando los 20 premios de cada Nocturna…";
 let loaded=0,notFound=0,errors=0,unvalidated=0;
 const ds=C.weekDates(week);
 await Promise.all(ds.map(async date=>{
  if(!force&&state.draws[date]?.verified){loaded++;return}
  if(date>C.argNow().date)return;
  try{
   const response=await fetch(API+date+".json?ref="+Date.now(),{cache:"no-store"});
   if(response.status===404){notFound++;return}
   if(!response.ok){errors++;return}
   const data=await response.json();
   try{
    const draw=C.normalizeDraw(data,date);
    state.draws[date]=draw;loaded++;
   }catch(e){unvalidated++;}
  }catch(e){errors++;}
 }));
 save();fetchBusy=false;$("refresh-results").disabled=false;
 $("source-note").textContent="Fuente secundaria: Sorteos AR · "+loaded+" noches disponibles"+
  (unvalidated?" · "+unvalidated+" sin validación":"")+
  (errors?" · "+errors+" errores de conexión":"")+
  ". Contrastá los resultados con el extracto oficial.";
 $("source-note").classList.toggle("error",errors>0||unvalidated>0);
 render();
}
async function fetchMore(){
 if(fetchBusy)return;
 const original=selectedWeek,dates=Array.from({length:4},(_,i)=>C.offsetDate(original,-7*i));
 let loaded=0;
 $("load-history-data").disabled=true;
 for(const w of dates){
  await fetchWeek(w);loaded++;
 }
 $("load-history-data").disabled=false;
 selectedWeek=original;render();toast("Consulta terminada: "+loaded+" semanas examinadas.");
}
document.querySelectorAll(".tab").forEach(el=>el.addEventListener("click",()=>switchPage(el.dataset.page)));
$("week-prev").addEventListener("click",()=>{selectedWeek=C.offsetDate(selectedWeek,-7);selectedDay=selectedWeek;render();fetchWeek(selectedWeek)});
$("week-next").addEventListener("click",()=>{selectedWeek=C.offsetDate(selectedWeek,7);selectedDay=selectedWeek;render();fetchWeek(selectedWeek)});
$("draw-day-tabs").addEventListener("click",e=>{const b=e.target.closest("button[data-date]");if(b){selectedDay=b.dataset.date;render()}});
$("number-board").addEventListener("click",e=>{
 const b=e.target.closest("button[data-number]");if(!b)return;
 const n=b.dataset.number,seen=C.firstSeen(selectedWeek,state.draws)[n],r=record();
 const calc=r?C.evaluate(r,state.draws):null;
 toast(n+(calc?.won[n]?" · ¡Acertado el "+C.dayLabel(calc.won[n])+"!":
  calc?.pending.includes(n)?" · Pendiente":
  seen?" · Salió el "+C.DAY_NAMES[seen.dayIndex]:" · Aún no salió esta semana"));
});
$("edit-picks").addEventListener("click",choosePicks);
$("refresh-results").addEventListener("click",()=>fetchWeek(selectedWeek,true));
$("manual-result").addEventListener("click",openManual);
$("load-history-data").addEventListener("click",fetchMore);
$("open-settings").addEventListener("click",openSettings);
$("modal-close").addEventListener("click",closeModal);
$("modal-backdrop").addEventListener("click",e=>{if(e.target===$("modal-backdrop"))closeModal()});
document.addEventListener("keydown",e=>{if(e.key==="Escape")closeModal()});
$("history-list").addEventListener("click",e=>{
 const b=e.target.closest("button[data-week]");
 if(b){selectedWeek=b.dataset.week;selectedDay=selectedWeek;switchPage("tablero");render();fetchWeek(selectedWeek);}
});
if("serviceWorker" in navigator&&location.protocol==="https:"&&location.hostname!=="appassets.androidplatform.net"){
 navigator.serviceWorker.register("./service-worker.js").catch(()=>{});
}
window.miPollaBack=function(){
 if(!$("modal-backdrop").classList.contains("hidden")){closeModal();return true;}
 if(page!=="tablero"){switchPage("tablero");return true;}
 return false;
};
render();
fetchWeek(selectedWeek);
})();
