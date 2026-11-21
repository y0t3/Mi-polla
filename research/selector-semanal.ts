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
const CROSSCHECK_NOV20=[
 '6401','9126','0902','3544','9619','5918','7334','4769','6640','4953',
 '9974','8714','8125','4778','3171','8471','6046','1602','0744','2106'
];
const CROSSCHECK_SOURCES=[
 'https://www.lanacion.com.ar/loterias/quiniela-nacional/',
 'https://www.loteriasmundiales.com.ar/Quinielas/ciudad'
];
// La fuente original marcó el último turno como validado=false; los 20 se
// cotejaron puesto por puesto contra las dos pizarras indicadas.

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
 .map(s=>s.slice(0,10)).filter(d=>d<=CUT_REQUIRED).sort();
const dates=[...days];
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
 const shape=Array.isArray(x?.numeros)&&x.numeros.length===20&&
  x.numeros.every((s:any)=>typeof s==='string'&&/^\d{4}$/.test(s));
 if(!shape)return [];
 if(x.validado===true)return x.numeros;
 if(date===CUT_REQUIRED&&x.numeros.join(',')===CROSSCHECK_NOV20.join(','))
  return x.numeros;
 return [];
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
function extractTop(date:string,cut:'INICIO_SEMANA'|'ANTES_NOCTURNA'='ANTES_NOCTURNA'):{
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
 // Al elegir los 10 ANTES del lunes, ninguna cabeza del lunes está disponible.
 // Los cambios opcionales sí pueden estudiar la jornada en curso antes de Nocturna.
 const current=cut==='INICIO_SEMANA'?diaVacio():heads(date,true);
 const today=buildSheet(current,prevNoctByJur(date));
 if(today.heads.Nocturno.length)throw Error('Fuga temporal en el PRE');
 if(cut==='INICIO_SEMANA'&&TURNOS.some(t=>today.heads[t].length))
  throw Error('Fuga temporal: un resultado del lunes entró en la selección inicial');
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
   cut,selectionMoment:cut==='INICIO_SEMANA'?'ANTES_DE_COMENZAR_EL_LUNES':'ANTES_DE_NOCTURNA',
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
function readModel(date:string,cut:'INICIO_SEMANA'|'ANTES_NOCTURNA'='ANTES_NOCTURNA'){
 const key=date+'|'+cut;
 if(!cache.has(key))cache.set(key,extractTop(date,cut));
 return cache.get(key)!;
}
function initialTen(date:string){
 const model=readModel(date,'INICIO_SEMANA');
 // Integral primero. AUX únicamente completa casilleros si no alcanza a dar 10.
 const primary=ten(model.integral),supplement=ten(model.aux);
 const merged=[...new Set([...primary,...supplement])].slice(0,10);
 if(merged.length!==10)
  throw Error('No hay diez números respaldados ANTES del lunes: '+merged.length);
 return {numbers:merged,integralUsed:merged.filter(n=>primary.includes(n)).length,
  auxUsed:merged.filter(n=>!primary.includes(n)).length,metadata:model.metadata};
}
function evaluateFixed(days:string[],method:'PRINCIPAL'|'AUX_FIJO'='PRINCIPAL'){
 if(!days.length)return null;
 const selection=initialTen(days[0]);
 const set=method==='PRINCIPAL'?selection.numbers:ten(readModel(days[0],'INICIO_SEMANA').aux);
 if(set.length!==10)throw Error('No se obtuvieron 10 cifras iniciales');
 const hit=new Set<string>(),detail:any[]=[];
 for(const date of days){
  const r=city20(date);if(r.length!==20)throw Error('Nocturna no validada '+date);
  const tails=new Set(r.map(s=>s.slice(-2)));
  const fresh=set.filter(x=>tails.has(x)&&!hit.has(x));
  fresh.forEach(x=>hit.add(x));
  detail.push({date,chosen:set,newHits:fresh,accumulated:hit.size});
 }
 return {count:hit.size,detail,initial:set,
  madeBeforeMonday:true,method,initialConstruction:method==='PRINCIPAL'?selection:null};
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
 const available=dates.filter(d=>d>='2026-11-16'&&d<=CUT_REQUIRED);
 const recent=available.filter(d=>city20(d).length===20);
 const historicalWeeks=[...new Set(dates.filter(d=>d>='2026-09-14'&&d<='2026-11-13')
  .map(weekMonday))].map(w=>({week:w,days:days.filter(d=>weekMonday(d)===w&&
  [1,2,3,4,5].includes(new Date(d+'T12:00:00Z').getUTCDay()))}))
  .filter(w=>w.days.length===5&&w.days.every(d=>city20(d).length===20));
 const backtest:any={weeks:[],excluded:[]};
 for(const {week,days:weekDays} of historicalWeeks){
  try{
   const principal=evaluateFixed(weekDays,'PRINCIPAL');
   const auxFijo=evaluateFixed(weekDays,'AUX_FIJO');
   const auxOpcional=evaluateDynamic(weekDays);
   backtest.weeks.push({week,principal:principal.count,auxFijo:auxFijo.count,
    auxOpcional:auxOpcional.count,initialPrincipal:principal.initial,
    initialAux:auxFijo.initial,construction:principal.initialConstruction});
  }catch(e){backtest.excluded.push({week,error:String(e)})}
 }
 const summary=(key:'principal'|'auxFijo'|'auxOpcional')=>{
  const xs=backtest.weeks.map((x:any)=>x[key]);
  return {sample:xs.length,total:xs.reduce((a:number,b:number)=>a+b,0),
   average:xs.length?Number((xs.reduce((a:number,b:number)=>a+b,0)/xs.length).toFixed(3)):null,
   reached8:xs.filter((n:number)=>n>=8).length,
   reached9:xs.filter((n:number)=>n>=9).length,
   reached10:xs.filter((n:number)=>n===10).length};
 };
 backtest.summary={principal:summary('principal'),auxFijo:summary('auxFijo'),
  auxOpcional:summary('auxOpcional')};
 const report:any={
  schema:'MI_POLLA_MOTOR_RESEARCH_V1',
  nextWeek:WEEK,
  cutoffSource:CUT_REQUIRED,
  basedOn:'DIEZ FIJOS (principal). Integral doble respaldo con complemento AUX previo a lunes.',
  policy:{
   priority:'DIEZ_INICIALES_FIJOS_LUNES_A_VIERNES',
   initial:'Integral dos hojas, luego AUX solo para completar hasta 10 si hace falta. Todo con corte PRE lunes.',
   secondary:'Cambios MANUALES, opcionales, nunca automáticos. No recomendar mover un pendiente por defecto.',
   optionalControl:'AUX diversificado con cambios diarios solamente como comparación retrospectiva.',
   status:'EXPERIMENTAL, NO PROBADO',
  },
  cutoffDisclosure:{
   date:CUT_REQUIRED,
   datasetValidado:draw(CUT_REQUIRED,'Ciudad','Nocturno')?.validado??null,
   crossChecked:(city20(CUT_REQUIRED).length===20),
   crossCheckSources:CROSSCHECK_SOURCES,
   expected20:CROSSCHECK_NOV20,
  },
  sourceRevision:execFileSync('git',['rev-parse','HEAD'],{cwd:path.resolve(ROOT,'../..'),encoding:'utf8'}).trim(),
  modelCommit:MODEL_SHA,
  auxLoaded:auxCount,auxErrors,
  historical:{
   backtest,
   weeklyNights:recent,
   partialOnly:recent.length!==5,
   fixedPrimary:recent.length?evaluateFixed(recent,'PRINCIPAL'):null,
   fixedAuxComparison:recent.length?evaluateFixed(recent,'AUX_FIJO'):null,
   dynamicOptionalComparison:recent.length?evaluateDynamic(recent):null,
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
   const selection=initialTen(WEEK);
   const mon=readModel(WEEK,'INICIO_SEMANA');
   const initial=selection.numbers,second=ten(mon.aux);
   if(initial.length===10&&second.length===10){
    report.next={status:'BORRADOR_PRELIMINAR_PARA_MANTENER',ready:true,
     mode:'FIJO_10',allowChanges:true,automaticChanges:false,
     initialConstruction:selection,
     recommended10:initial,alternatives10:second,
     overlap:initial.filter(n=>second.includes(n)),
     detail:mon.metadata,
     explain:'Generado sin ninguna cabeza del lunes. Estos diez se mantienen durante la semana; cambiar pendientes es una opción manual secundaria.',
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
 console.log('CIUDAD VERIFICADA/CRUZADA:',recent.join(', '),'de 5 días posibles');
 console.log('CONTROL FIJO PRINCIPAL (selección antes del lunes):',report.historical.fixedPrimary?.count??'n/d');
 console.log('CONTROL FIJO AUX (selección antes del lunes):',report.historical.fixedAuxComparison?.count??'n/d');
 console.log('CONTROL AUX OPCIONAL con cambios:',report.historical.dynamicOptionalComparison?.count??'n/d');
 console.log('OCHO SEMANAS PRE-LUNES:',JSON.stringify(backtest.summary));
 console.log('SEMANAS INCLUIDAS:',backtest.weeks.map((x:any)=>x.week).join(','));
 console.log('SEMANAS OMITIDAS:',JSON.stringify(backtest.excluded));
 console.log('SEMANA 23/11:',report.next.status,JSON.stringify(report.next.recommended10));
 console.log('REPORTE: research/salidas/motor-semanal-23nov.json');
})().catch(e=>{console.error(e);process.exitCode=1});
