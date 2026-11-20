/* Núcleo de reglas de Mi Polla. Funciona en navegador y Node, sin dependencias. */
(function(root,factory){
  const api=factory();
  if(typeof module==="object"&&module.exports) module.exports=api;
  root.PollaCore=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
  "use strict";
  const DAY_NAMES=["Lunes","Martes","Miércoles","Jueves","Viernes"];
  const WEEK_COLORS=["#9DE957","#45D8EE","#FFAB5C","#ECEB68","#F27ABB"];
  const TZ="America/Argentina/Buenos_Aires";
  const iso=(d)=>d.toISOString().slice(0,10);
  const dateUTC=(str)=>new Date(str+"T12:00:00Z");
  function offsetDate(str,offset){const d=dateUTC(str);d.setUTCDate(d.getUTCDate()+offset);return iso(d)}
  function mondayOf(str){const d=dateUTC(str);d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);return iso(d)}
  function weekDates(week){return Array.from({length:5},(_,i)=>offsetDate(week,i))}
  function argNow(date=new Date()){
    const values={};
    for(const p of new Intl.DateTimeFormat("en-US",{timeZone:TZ,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(date)){
      if(p.type!=="literal")values[p.type]=p.value;
    }
    return {date:values.year+"-"+values.month+"-"+values.day,time:values.hour+":"+values.minute};
  }
  function drawDayAfter(str){
    let next=offsetDate(str,1);
    while([0,6].includes(dateUTC(next).getUTCDay()))next=offsetDate(next,1);
    return next;
  }
  function nextEligibleDraw(now=new Date(),draws={}){
    const local=argNow(now);
    let d=local.date;
    if([0,6].includes(dateUTC(d).getUTCDay())||local.time>="21:00"||draws[d])
      d=drawDayAfter(d);
    return d;
  }
  function num(s){
    const value=String(s).trim();
    if(!/^\d{1,2}$/.test(value)||+value>99)return null;
    return value.padStart(2,"0");
  }
  function parsePicks(value){
    const raw=String(value).trim().split(/[\s,;\/]+/).filter(Boolean);
    if(raw.length!==10)throw new Error("Necesitás elegir exactamente 10 números.");
    const picks=raw.map(num);
    if(picks.some(n=>n===null))throw new Error("Usá números del 00 al 99.");
    if(new Set(picks).size!==10)throw new Error("No podés repetir números.");
    return picks.sort((a,b)=>+a-+b);
  }
  function normalizeDraw(payload,date){
    if(!payload||payload.fecha!==date||!Array.isArray(payload.turnos))
      throw new Error("El extracto no corresponde a la fecha solicitada.");
    const t=payload.turnos.find(x=>x.turno==="nocturna");
    if(!t||!Array.isArray(t.numeros)||t.numeros.length!==20||
      !t.numeros.every(n=>typeof n==="string"&&/^\d{4}$/.test(n)))
      throw new Error("El extracto no contiene los 20 premios de cuatro cifras.");
    if(t.validado!==true)throw new Error("Los 20 premios aún no están validados por la fuente.");
    return {date,numbers:[...t.numeros],source:"Sorteos AR",verified:true,updatedAt:new Date().toISOString()};
  }
  function normalizeManualDraw(text,date){
    const numbers=String(text).trim().split(/[\s,;]+/).filter(Boolean);
    if(numbers.length!==20||!numbers.every(n=>/^\d{4}$/.test(n)))
      throw new Error("Ingresá los 20 premios de cuatro cifras, en orden del 1.º al 20.º.");
    return {date,numbers,source:"Carga manual",verified:false,updatedAt:new Date().toISOString()};
  }
  function firstSeen(week,draws){
    const first={};
    weekDates(week).forEach((date,i)=>{
      const draw=draws[date];
      if(!draw||!Array.isArray(draw.numbers))return;
      for(const n of draw.numbers){
        const two=n.slice(-2);
        if(first[two]===undefined)first[two]={date,dayIndex:i};
      }
    });
    return first;
  }
  function evaluate(weekRecord,draws,upto=null){
    const active=new Set(weekRecord?.initialNumbers||[]);
    const won={};
    const dayReport=[];
    const records=(weekRecord?.changes||[]).slice().sort((a,b)=>
      a.effectiveDate.localeCompare(b.effectiveDate)||a.at.localeCompare(b.at));
    const start=weekRecord?.startEffective||"9999-12-31";
    for(const date of weekDates(weekRecord?.week||"2020-01-06")){
      if(upto&&date>upto)break;
      if(date>=start){
        for(const change of records.filter(c=>c.effectiveDate===date)){
          if(active.has(change.from)&&!won[change.from]&&!active.has(change.to)){
            active.delete(change.from);active.add(change.to);
          }
        }
      }
      const newHits=[];
      const draw=draws[date];
      if(date>=start&&draw?.numbers?.length===20){
        for(const raw of draw.numbers){
          const two=raw.slice(-2);
          if(active.has(two)&&!won[two]){
            won[two]=date;newHits.push(two);
          }
        }
      }
      dayReport.push({date,newHits,accumulated:Object.keys(won).length,
        active:[...active].sort((a,b)=>+a-+b)});
    }
    return {active:[...active].sort((a,b)=>+a-+b),
      won,hitCount:Object.keys(won).length,
      pending:[...active].filter(n=>!won[n]).sort((a,b)=>+a-+b),
      dayReport};
  }
  function createWeek(week,numbers,effective,now=new Date()){
    if(mondayOf(effective)!==week)throw new Error("La fecha de inicio no pertenece a esa semana.");
    return {week,initialNumbers:parsePicks(numbers.join(" ")),
      startEffective:effective,createdAt:now.toISOString(),changes:[]};
  }
  function appendSwap(weekRecord,draws,from,to,effective,now=new Date()){
    from=num(from);to=num(to);
    if(!from||!to||from===to)throw new Error("Elegí dos números diferentes.");
    if(mondayOf(effective)!==weekRecord.week)
      throw new Error("Esa semana ya está cerrada. Empezá la próxima Polla.");
    if(effective<weekRecord.startEffective)throw new Error("La fecha de cambio es anterior a la jugada.");
    const prior=offsetDate(effective,-1);
    const old=evaluate(weekRecord,draws,prior);
    if(old.won[from])throw new Error("El "+from+" ya está acertado y no se puede reemplazar.");
    // Aplicar cambios programados del mismo día al conjunto activo, sin sumar premios de ese día.
    const projected=new Set(old.active);
    for(const c of weekRecord.changes.filter(c=>c.effectiveDate===effective)){
      if(projected.has(c.from)&&!old.won[c.from]&&!projected.has(c.to)){
        projected.delete(c.from);projected.add(c.to);
      }
    }
    if(!projected.has(from))throw new Error("El "+from+" no está pendiente en tu jugada.");
    if(projected.has(to))throw new Error("El "+to+" ya forma parte de tus números.");
    return {...weekRecord,changes:[...weekRecord.changes,
      {from,to,effectiveDate:effective,at:now.toISOString()}]};
  }
  function dayLabel(date){const i=(dateUTC(date).getUTCDay()+6)%7;return DAY_NAMES[i]||"Fin de semana"}
  return {DAY_NAMES,WEEK_COLORS,argNow,offsetDate,mondayOf,weekDates,drawDayAfter,
    nextEligibleDraw,num,parsePicks,normalizeDraw,normalizeManualDraw,firstSeen,
    evaluate,createWeek,appendSwap,dayLabel};
});
