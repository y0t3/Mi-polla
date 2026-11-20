"use strict";
const assert=require("node:assert/strict");
const C=require("../polla-core.js");
const d="2026-11-16";
const nums=["03","11","24","37","42","56","61","73","85","92"];
const draw=(dt,values)=>({date:dt,numbers:values.map(x=>x.padStart(4,"0")).concat(
  Array.from({length:20-values.length},(_,i)=>String(8000+i).padStart(4,"0"))),
  verified:true});
function expectFailure(fn){assert.throws(fn)}
assert.equal(C.mondayOf("2026-11-19"),d);
assert.deepEqual(C.weekDates(d),["2026-11-16","2026-11-17","2026-11-18","2026-11-19","2026-11-20"]);
assert.deepEqual(C.parsePicks("03 11 24 37 42 56 61 73 85 92"),nums);
expectFailure(()=>C.parsePicks("01 02 03 04 05 06 07 08 09 09"));
expectFailure(()=>C.parsePicks("01 02 03 04 05 06 07 08 09 100"));
assert.equal(C.nextEligibleDraw(new Date("2026-11-20T23:40:00Z"),{}),"2026-11-23");
assert.equal(C.nextEligibleDraw(new Date("2026-11-17T15:00:00Z"),{}),"2026-11-17");
assert.equal(C.nextEligibleDraw(new Date("2026-11-17T15:00:00Z"),{"2026-11-17":draw("2026-11-17",[])}),"2026-11-18");
const s=C.createWeek(d,nums,d);
const monday=draw(d,["0037","0073","0011","0099"]);
const tuesday=draw("2026-11-17",["0024","0042","0073"]);
const wednesday=draw("2026-11-18",["0085","0099","0099"]);
let results={[d]:monday,"2026-11-17":tuesday,"2026-11-18":wednesday};
let evalA=C.evaluate(s,results);
assert.equal(evalA.hitCount,6); // 37,73,11,24,42,85
expectFailure(()=>C.appendSwap(s,results,"37","99","2026-11-19"));
expectFailure(()=>C.appendSwap(s,results,"42","99","2026-11-19"));
const s2=C.createWeek(d,["03","11","24","36","42","56","61","73","85","92"],d);
let withSwap=C.appendSwap(s2,results,"36","99","2026-11-17");
let evalB=C.evaluate(withSwap,results);
assert.equal(evalB.won["99"],"2026-11-18"); // NO cuenta el 99 del lunes
assert.equal(evalB.won["36"],undefined);
assert.equal(evalB.active.includes("99"),true);
assert.equal(evalB.active.includes("36"),false);
let noRepeat={...results,"2026-11-18":draw("2026-11-18",["0085"])};
assert.equal(C.evaluate(withSwap,noRepeat).won["99"],undefined);
expectFailure(()=>C.appendSwap(withSwap,results,"11","77","2026-11-19"));
expectFailure(()=>C.appendSwap(withSwap,results,"56","73","2026-11-19"));
const normalized=C.normalizeDraw({fecha:"2026-11-19",turnos:[
  {turno:"nocturna",validado:true,numeros:Array.from({length:20},(_,i)=>String(1000+i))}]},"2026-11-19");
assert.equal(normalized.numbers.length,20);
expectFailure(()=>C.normalizeDraw({fecha:"2026-11-19",turnos:[{turno:"nocturna",validado:false,numeros:Array(20).fill("1234")}]},"2026-11-19"));
expectFailure(()=>C.normalizeManualDraw("1234 5678","2026-11-19"));
assert.equal(C.normalizeManualDraw(Array(20).fill("1234").join(" "),"2026-11-19").verified,false);
console.log("✓ Reglas de Mi Polla aprobadas: 10 números, días, bloqueo de aciertos, cambios, sin retroactividad, fuente.");
