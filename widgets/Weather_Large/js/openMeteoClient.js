'use strict';
const FORECAST_BASE='https://api.open-meteo.com/v1/forecast';
const GEOCODE_BASE='https://geocoding-api.open-meteo.com/v1/search';
function _qs(p){ const u=new URLSearchParams(); for(const[k,v] of Object.entries(p)){ if(v===null||v===undefined) continue; u.set(k,String(v)); } return u.toString(); }
async function _fetchJson(url,{timeoutMs=12000}={}){
  const ac=new AbortController(); const t=setTimeout(()=>ac.abort(),timeoutMs);
  try{
    const res=await fetch(url,{signal:ac.signal,cache:'no-store'});
    if(!res.ok){ const text=await res.text().catch(()=> ''); const e=new Error(`HTTP ${res.status}`); e.status=res.status; e.body=text; throw e; }
    return await res.json();
  } finally { clearTimeout(t); }
}
export async function fetchForecast({lat,lon}){
  const params={
    latitude:lat, longitude:lon,
    current:['temperature_2m','weather_code','is_day'].join(','),
    daily:['weather_code','temperature_2m_max','temperature_2m_min','precipitation_probability_max'].join(','),
    forecast_days:4, timezone:'auto',
  };
  return await _fetchJson(`${FORECAST_BASE}?${_qs(params)}`);
}
export async function geocodeSearch({query,count=10,language='en'}){
  return await _fetchJson(`${GEOCODE_BASE}?${_qs({name:query,count,language})}`);
}
