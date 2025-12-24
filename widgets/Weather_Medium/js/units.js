'use strict';
export function cToF(c){ return c*9/5+32; }
export function round0(n){ return (n===null||n===undefined)?null:Math.round(n); }
export function formatTemp(valueC, unitsMode){
  if(valueC===null||valueC===undefined) return null;
  if(unitsMode==='imperial') return round0(cToF(valueC));
  return round0(valueC);
}
export function formatTempPair(hiC, loC, unitsMode){
  const hi=formatTemp(hiC, unitsMode);
  const lo=formatTemp(loC, unitsMode);
  if(hi===null||lo===null) return null;
  return `${hi}°/${lo}°`;
}
