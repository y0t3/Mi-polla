/**
 * MI POLLA · selección auditable para la semana siguiente.
 * Usa los módulos experimentales ya probados (solo durante el laboratorio).
 * El APK no los necesita: Mi Polla sigue siendo un proyecto independiente.
 *
 * Condición irrenunciable: no se genera una jugada del 23/11 antes de
 * confirmar los 20 premios de Ciudad Nocturna del viernes 20/11.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {buildSheet} from './_modelo/src/sheet';
import {buildMotorLaloAuxiliar,extractAuxiliarHistory} from './_modelo/src/motorLaloAuxiliar';
import {buildMotorLaloIntegral} from './_modelo/src/motorLaloIntegral';
import type {IntegralPast} from './_modelo/src/motorLaloIntegral';
import {fetchAuxiliaryHeads} from './_modelo/src/auxSantiagoSource';
import type {AuxiliaryHeads} from './_modelo/src/auxSantiagoNeuquen';
import {TURNOS,JURS,diaVacio} from './_modelo/src/domain';
import type {CabezasDia} from './_modelo/src/domain';

const ROOT=process.env.POLLA_DATA_ROOT||'/tmp/sorteos-ar/data/quiniela';
const MODEL_SHA='5bc0c45be1726c80a9b07ab3b404b3bf48fa6a4c';
const WEEK='2026-11-23', CUT_REQUIRED='2026-11-20';
const jurNames:Record<string,string>={
 'Ciudad':'ciudad','Provincia':'provincia','Córdoba':'cordoba',
 'Santa Fé':'santafe','Entre Ríos':'entrerios','Montevideo':'uruguay'
};
const turns:Record<string,string>={
 'Previa':'previa','Primera':'primera','Matutino':'matutina',
 'Vespertino':'vespertina','Nocturno':'nocturna'
};
const days=fs.readdirSync(path.join(ROOT,'ciudad'))
 .filter(s=>/^\d{4}-\d{2}-\d{2}\.json$/.test(s))
 .map(s=>s.slice(0,10)).sort();
const dates=days.filter(d=>d<='2026-11-19');
const rawMemo=new Map<string,any>();
function raw(date:string,jur:string):any{
 const key=date+'|'+jur;
 if(rawMemo.has(key))return rawMemo.get(key);
 let x=null;
 try{x=JSON.parse(fs.readFileSync(path.join(ROOT,jurNames[jur],date+'.json'),'utf8'))}
 catch{}
 rawMemo.set(key,x);return x;
}
function draw(date:string,jur:string,t:string){
 return raw(date,jur)?.turnos?.find((x:any)=>x.turno===turns[t]);
}
function head(date:string,jur:string,t:string){
 const x=draw(date,jur,t)?.numeros?.[0];
 return typeof x==='string'&&/^\d{3,4}$/.test(x)?x.padStart(4,'0'):'----';
}
function heads(date:string,maskNocturna=false):CabezasDia{
 const x=diaVacio();
 for(const t of TURNOS)for(const jur of JURS){
   x[t][jur]=(maskNocturna&&t==='Nocturno')?'----':head(date,jur,t);
 }
 return x;
}
function previous(date:string):string{
 const last=days.filter(d=>d<date).at(-1);
 if(!last)throw Error('No existe una jornada anterior a '+date);
 return last;
}
function prevNoctByJur(date:string):CabezasDia{
 const out=diaVacio();
 // Los feriados pueden producir una Nocturna anterior distinta por jurisdicción.
 for(const j of JURS){
  for(const d of days.filter(d=>d<date).slice(-20).reverse()){
   const h=head(d,j,'Nocturno');
   if(h!=='----'){out.Nocturno[j]=h;break}
  }
 }
 return out;
}
function weekMonday(date:string){
 const t=new Date(date+'T12:00:00Z');
 t.setUTCDate(t.getUTCDate()-(t.getUTCDay()+6)%7);
 return t.toISOString().slice(0,10);
}
const sheetMemo=new Map<string,ReturnType<typeof buildSheet>>();
function sheet(date:string){
 if(!sheetMemo.has(date))
  sheetMemo.set(date,buildSheet(heads(date),prevNoctByJur(date)));
 return sheetMemo.get(date)!;
}
function city20(date:string):string[]{
 const x=draw(date,'Ciudad','Nocturno');
 return x?.validado===true&&x.numeros?.length===20&&
  x.numeros.every((s:any)=>typeof s==='string'&&/^\d{4}$/.test(s))
    ? x.numeros:[];
}
const auxSources=new Map<string,AuxiliaryHeads>();
const auxErrors:Record<string,string>={};
async function readAux(){
 let i=0,ok=0;
 async function worker(){
  while(i<days.length){
   const date=days[i++];
   try{
    const a=await fetchAuxiliaryHeads(date);
    auxSources.set(date,a.heads);ok++;
   }catch(e){auxErrors[date]=String(e)}
  }
 }
 await Promise.all(Array.from({length:8},worker));
 return ok;
}
function completeAux(x:AuxiliaryHeads|undefined):boolean{
 return !!x&&Object.values(x).every(a=>Object.values(a).every(s=>/^\d{4}$/.test(s)));
}
function roots(date:string){
 const last=previous(date),monday=weekMonday(date);
 return [{date:last,period:'D−1' as const},
 ...((monday<date&&days.includes(monday))?[{date:monday,period:'D−7' as const}]:[])];
}
type Candidate={n:string;family:string;rank:number;evidence?:string;source:'aux'|'integral'};
function extractTop(date:string):{
 aux:Candidate[];integral:Candidate[];combined:string[];metadata:any
}{
 const prev=previous(date),auxHead=auxSources.get(prev);
 if(!completeAux(auxHead))
  throw Error('Faltan cabezas Santiago/Neuquén del día previo '+prev);
 const hist=roots(date).map(h=>{
  const auxPrevDate=previous(h.date),auxPrev=auxSources.get(auxPrevDate);
  if(!completeAux(auxPrev))
    throw Error('Faltan raíces auxiliares de '+auxPrevDate);
  return {date:h.date,period:h.period,sourceDate:auxPrevDate,
   heads:auxPrev!,aux:extractAuxiliarHistory(h.date,auxPrev!,heads(h.date))};
 });
 const seen=new Set<string>();
 const histUnique=hist.filter(h=>!seen.has(h.date)&&seen.add(h.date));
 const today=buildSheet(heads(date,true),prevNoctByJur(date));
 if(today.heads.Nocturno.length)throw Error('Fuga temporal en el PRE');
 const aux=buildMotorLaloAuxiliar(date,'Nocturno',auxHead!,hist);
 const integralHist:IntegralPast[]=histUnique.map(h=>({
  date:h.date,period:h.period,plus11:sheet(h.date),aux:h.aux
 }));
 const integral=buildMotorLaloIntegral(date,'Nocturno',today,auxHead!,integralHist);
 // Respecto a la Polla, 37 y 73 son dos números distintos.
 const ordered=(arr:any[],mode:'aux'|'integral',style:'diversificado'|'pares'):Candidate[]=>{
  const out:Candidate[]=[];
  const pool=mode==='integral'?[...arr].sort((a,b)=>
   Number(b.evidence==='DOS_HOJAS')-Number(a.evidence==='DOS_HOJAS')||a.rank-b.rank):arr;
  if(style==='pares'){
   pool.forEach(f=>f.family.split('/').forEach((n:string)=>out.push({
    n,family:f.family,rank:f.rank,evidence:f.evidence,source:mode
   })));
  }else{
   for(const ix of [0,1])pool.forEach(f=>{
    const n=f.family.split('/')[ix];
    if(n)out.push({n,family:f.family,rank:f.rank,evidence:f.evidence,source:mode});
   });
  }
  return [...new Map(out.map(x=>[x.n,x])).values()];
 };
 const auxItems=ordered(aux.ranks[2],'aux','diversificado');
 const integralItems=ordered(integral.ranks[2],'integral','pares');
 return {aux:auxItems,integral:integralItems,
  combined:integral.ranks[2].slice(0,12).map(f=>f.family),
  metadata:{
   previousDraw:prev,auxBase:prev,history:hist.map(h=>({
    day:h.date,root:h.period,sourceDate:h.sourceDate
   })),
   auxFamilies:aux.ranks[2].length,integralFamilies:integral.ranks[2].length,
   beforeNightCitySource:today.columns.map(c=>({id:c.id,
    available:c.values.filter(s=>s!=='--').length}))
  }};
}
function ten(list:Candidate[]):string[]{
 return [...new Set(list.map(x=>x.n))].slice(0,10);
}
const cache=new Map<string,ReturnType<typeof extractTop>>();
function readModel(date:string){
 if(!cache.has(date))cache.set(date,extractTop(date));
 return cache.get(date)!;
}
function evaluateFixed(days:string[],candidate:(date:string)=>string[]){
 if(!days.length)return null;
 const set=ten(readModel(days[0]).integral);
 if(set.length!==10)throw Error('No se obtuvieron 10 cifras iniciales');
 const hit=new Set<string>(),detail:any[]=[];
 for(const date of days){
  const r=city20(date);if(r.length!==20)throw Error('Nocturna no validada '+date);
  const tails=new Set(r.map(s=>s.slice(-2)));
  const fresh=set.filter(x=>tails.has(x)&&!hit.has(x));
  fresh.forEach(x=>hit.add(x));
  detail.push({date,chosen:set,newHits:fresh,accumulated:hit.size});
 }
 return {count:hit.size,detail,initial:set};
}
function evaluateDynamic(days:string[]){
 const hit=new Set<string>(),detail:any[]=[];
 for(const date of days){
  const model=readModel(date);
  const remainder=ten(model.aux.filter(x=>!hit.has(x)));
  const chosen=[...hit,...remainder.slice(0,10-hit.size)];
  if(chosen.length!==10)throw Error('No se obtuvieron 10 cifras: '+date);
  const tails=new Set(city20(date).map(s=>s.slice(-2)));
  const fresh=chosen.filter(x=>tails.has(x)&&!hit.has(x));
  fresh.forEach(x=>hit.add(x));
  detail.push({date,chosen,newHits:fresh,accumulated:hit.size});
 }
 return {count:hit.size,detail};
}
(async function(){
 const auxCount=await readAux();
 const available=dates.filter(d=>d>='2026-11-16'&&d<='2026-11-19');
 const recent=available.filter(d=>city20(d).length===20);
 const report:any={
  schema:'MI_POLLA_MOTOR_RESEARCH_V1',
  nextWeek:WEEK,
  cutoffSource:CUT_REQUIRED,
  basedOn:'Motor auxiliar diversificado (cambios) + Integral dos hojas (fijo)',
  policy:{
   initial:'Integral dos hojas con familias ordenadas; no mezclar arbitrariamente con AUX',
   swaps:'Solo se estudia AUX diversificado, con aciertos asegurados y cambios previos al sorteo',
   status:'EXPERIMENTAL, NO PROBADO',
  },
  sourceRevision:execFileSync('git',['rev-parse','HEAD'],{cwd:path.resolve(ROOT,'../..'),encoding:'utf8'}).trim(),
  modelCommit:MODEL_SHA,
  auxLoaded:auxCount,auxErrors,
  historical:{
   weeklyNights:recent,
   partialOnly:recent.length!==5,
   fixed:recent.length?evaluateFixed(recent,()=>[]):null,
   dynamic:recent.length?evaluateDynamic(recent):null,
  },
  next:{
   status:'PENDIENTE_NOCTURNA_VIERNES',
   ready:false,
   recommended10:null,
   alternatives10:null,
   cutoffMessage:'No se publican diez candidatos definitivos antes de confirmar el sorteo del viernes 20/11.',
  }
 };
 if(city20(CUT_REQUIRED).length===20){
  try{
   const mon=readModel(WEEK);
   const initial=ten(mon.integral),second=ten(mon.aux);
   if(initial.length===10&&second.length===10){
    report.next={status:'BORRADOR_PRELIMINAR',ready:true,
     recommended10:initial,alternatives10:second,
     overlap:initial.filter(n=>second.includes(n)),
     detail:mon.metadata,
     explain:'Generado antes de que existan Previa, Primera, Matutina y Vespertina del lunes. Revisar antes del cierre real de inscripciones.',
     cutoffMessage:'Los diez números se pueden confirmar luego de verificar el corte real de inscripción.'
    };
   }else{
    report.next.status='SIN_DIEZ_CANDIDATOS_RESPALDADOS';
   }
  }catch(e){report.next.status='ERROR_DE_FUENTES';report.next.error=String(e)}
 }
 if(city20(CUT_REQUIRED).length===0&&report.next.recommended10!==null)
  throw Error('Nunca publicar números del 23/11 antes de validar la nocturna del 20/11');
 const now=new Date();
 report.createdAt=now.toISOString();
 report.currentCityDates=days.slice(-6);
 const auxSnapshot=Object.fromEntries([...auxSources].sort(([a],[b])=>a.localeCompare(b)));
 report.auxiliarySHA256=createHash('sha256')
   .update(JSON.stringify(auxSnapshot)).digest('hex');
 report.sourceDigest=createHash('sha256').update(JSON.stringify({
  dates:days.slice(-6),city:recent.map(d=>({day:d,positions:city20(d)})),
  auxiliarySHA256:report.auxiliarySHA256
 })).digest('hex');
 fs.mkdirSync('research/salidas',{recursive:true});
 fs.writeFileSync('research/salidas/motor-semanal-23nov.json',JSON.stringify(report,null,2)+'\n');
 console.log('MOTOR PERSONAL — PRE DEL 23/11. Solo investigación.');
 console.log('AUX DISPONIBLE:',auxCount,'/',days.length,'fechas');
 console.log('CIUDAD VALIDADA:',recent.join(', '),'de 4 días posibles');
 console.log('CONTROL PARCIAL INTEGRAL:',report.historical.fixed?.count??'n/d');
 console.log('CONTROL PARCIAL AUX:',report.historical.dynamic?.count??'n/d');
 console.log('SEMANA 23/11:',report.next.status,JSON.stringify(report.next.recommended10));
 console.log('REPORTE: research/salidas/motor-semanal-23nov.json');
})().catch(e=>{console.error(e);process.exitCode=1});
