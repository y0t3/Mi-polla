/*
 * Mi Polla — actualización de sorteos con fuentes redundantes.
 * No inventa resultados: solo acepta la Nocturna validado=true con 20
 * premios de 4 cifras en la fecha solicitada.
 */
(function(root, factory){
 const api=factory();
 if(typeof module==="object"&&module.exports)module.exports=api;
 root.PollaResults=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
 "use strict";
 const RAW="https://raw.githubusercontent.com/nfgalindez-aiko/sorteos-ar/main/data/quiniela/ciudad/";
 const GITHUB_API="https://api.github.com/repos/nfgalindez-aiko/sorteos-ar/contents/data/quiniela/ciudad/";
 function formatTimestamp(d=new Date()){
  return new Intl.DateTimeFormat("es-AR",{
   timeZone:"America/Argentina/Buenos_Aires",hour:"2-digit",minute:"2-digit",
   hour12:false
  }).format(d);
 }
 function toUtf8(base64){
  const bytes=Uint8Array.from(atob(String(base64).replace(/\s/g,"")),c=>c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
 }
 function inspect(payload,date,core){
  if(!payload||payload.fecha!==date||!Array.isArray(payload.turnos))
   return {status:"invalid",reason:"La fecha del archivo no coincide con la consultada."};
  const turn=payload.turnos.find(x=>x.turno==="nocturna");
  if(!turn)return {status:"pending",reason:"Todavía no se publicó la Nocturna."};
  if(!Array.isArray(turn.numeros)||turn.numeros.length!==20||
   !turn.numeros.every(n=>typeof n==="string"&&/^\d{4}$/.test(n)))
   return {status:"pending",reason:"Aún no figuran los 20 premios completos."};
  if(turn.validado!==true)
   return {status:"pending",reason:"Los veinte premios existen, pero la fuente aún no los validó."};
  try{return {status:"ready",draw:core.normalizeDraw(payload,date)}}
  catch(e){return {status:"invalid",reason:String(e.message||e)}}
 }
 async function request(fetcher,url,mode,date,core){
  let response;
  try{
   response=await fetcher(url,{
    cache:"no-store",
    headers:{Accept:"application/json"}
   });
  }catch(e){return {status:"error",reason:"Error de conexión: "+String(e.message||e)}}
  if(response.status===404)return {status:"not_found",reason:"Todavía no se publicó el archivo de esa fecha."};
  if(!response.ok)return {status:"error",reason:"La fuente respondió HTTP "+response.status};
  try{
   let payload=await response.json();
   if(mode==="api"&&typeof payload.content==="string"){
    payload=JSON.parse(toUtf8(payload.content));
   }
   return inspect(payload,date,core);
  }catch(e){return {status:"error",reason:"No se pudo leer la respuesta: "+String(e.message||e)}}
 }
 async function loadNocturna(date,core,fetcher=fetch,now=Date.now()){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date))
   return {status:"invalid",reason:"Fecha inválida.",date};
  const stamp=encodeURIComponent(String(now));
  const raw=await request(fetcher,RAW+date+".json?ver="+stamp,"raw",date,core);
  if(raw.status==="ready")
   return {status:"ready",date,draw:raw.draw,channel:"archivo directo"};
  // A veces raw.githubusercontent.com conserva la versión previa del JSON.
  // El Contents API consulta el contenido del commit actual y permite
  // recuperar la validación más reciente sin usar datos sin confirmar.
  const api=await request(fetcher,GITHUB_API+date+".json?ref=main&ver="+stamp,
   "api",date,core);
  if(api.status==="ready"){
   const draw={...api.draw,source:"Sorteos AR · GitHub actualizado"};
   return {status:"ready",date,draw,channel:"consulta alternativa"};
  }
  if(raw.status==="pending"||api.status==="pending")
   return {status:"pending",date,reason:api.status==="pending"?api.reason:raw.reason,
    channels:[raw.status,api.status]};
  if(raw.status==="not_found"&&api.status==="not_found")
   return {status:"not_found",date,reason:api.reason};
  return {status:"error",date,
   reason:[raw.reason,api.reason].filter(Boolean).join(" · "),
   channels:[raw.status,api.status]};
 }
 return {loadNocturna,inspect,formatTimestamp};
});
