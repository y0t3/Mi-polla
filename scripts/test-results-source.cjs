const assert=require("node:assert/strict");
const C=require("../polla-core.js");
const R=require("../results-source.js");
const date="2026-11-24";
const nums=["6557","5474","8217","3161","9754","7531","0370","9374","8924","1013",
 "7178","2826","3425","7933","4332","9420","3443","6884","9350","6144"];
const payload=(validado)=>({fecha:date,turnos:[{
 turno:"nocturna",validado,numeros:nums
}]});
const response=(status,data)=>({ok:status>=200&&status<300,status,async json(){return data}});
const apiContent=(p)=>({
 encoding:"base64",content:Buffer.from(JSON.stringify(p),"utf8").toString("base64").replace(/(.{60})/g,"$1\n")
});
(async()=>{
 let calls=[];
 const main=async url=>{
  calls.push(url);
  return response(200,payload(true));
 };
 let result=await R.loadNocturna(date,C,main,123);
 assert.equal(result.status,"ready");
 assert.equal(result.channel,"archivo directo");
 assert.equal(result.draw.numbers.length,20);
 assert.equal(result.draw.numbers[1],"5474");
 assert.equal(calls.length,1);
 assert.equal(calls[0].includes("ver=123"),true);
 calls=[];
 const stale=async url=>{
  calls.push(url);
  if(url.includes("raw.githubusercontent.com"))
   return response(200,payload(false));
  return response(200,apiContent(payload(true)));
 };
 result=await R.loadNocturna(date,C,stale,456);
 assert.equal(result.status,"ready");
 assert.equal(result.channel,"consulta alternativa");
 assert.equal(result.draw.verified,true);
 assert.equal(result.draw.numbers[17],"6884");
 assert.equal(calls.length,2);
 calls=[];
 const missing=async url=>{
  calls.push(url);
  if(url.includes("raw.githubusercontent.com"))return response(404,{});
  return response(200,apiContent(payload(true)));
 };
 result=await R.loadNocturna(date,C,missing,789);
 assert.equal(result.status,"ready");
 assert.equal(result.draw.numbers.length,20);
 calls=[];
 const pending=async url=>{
  calls.push(url);
  return response(200,url.includes("raw.githubusercontent.com")?
   payload(false):apiContent(payload(false)));
 };
 result=await R.loadNocturna(date,C,pending);
 assert.equal(result.status,"pending");
 assert.equal(result.draw,undefined);
 assert.equal(calls.length,2);
 calls=[];
 const both404=async url=>{
  calls.push(url);return response(404,{});
 };
 result=await R.loadNocturna(date,C,both404);
 assert.equal(result.status,"not_found");
 assert.equal(calls.length,2);
 const off=async()=>{throw Error("sin internet")};
 result=await R.loadNocturna(date,C,off);
 assert.equal(result.status,"error");
 assert.equal(result.draw,undefined);
 const mismatch=async url=>response(200,url.includes("raw.githubusercontent.com")?
  {...payload(true),fecha:"2026-11-23"}:apiContent({...payload(true),fecha:"2026-11-23"}));
 result=await R.loadNocturna(date,C,mismatch);
 assert.equal(result.status,"error");
 assert.equal(R.formatTimestamp(new Date("2026-11-25T00:36:00Z")).includes("21:36"),true);
 console.log("✓ Actualización: consulta directa, fallback GitHub API, validación, error y conexión.");
})().catch(e=>{console.error(e);process.exitCode=1});
