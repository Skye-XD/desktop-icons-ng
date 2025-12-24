'use strict';
export function debounce(fn, ms) { let t=null; return (...a)=>{ if(t)clearTimeout(t); t=setTimeout(()=>fn(...a),ms); }; }
export function nowUnix(){ return Math.floor(Date.now()/1000); }
export function fmtWeekday(dateIso, locale){
  const days=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  if(typeof dateIso==='string'){
    const parts=dateIso.split('-').map(Number);
    if(parts.length===3 && parts.every(n=>Number.isFinite(n))){
      const d=new Date(Date.UTC(parts[0], parts[1]-1, parts[2]));
      if(!isNaN(d.getTime())){
        try{
          return new Intl.DateTimeFormat(locale||undefined,{weekday:'short'}).format(d);
        }catch(e){}
        return days[d.getUTCDay()];
      }
    }
    if(dateIso.length>=3) return dateIso.slice(0,3);
  }
  return '--';
}
