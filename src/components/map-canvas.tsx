'use client';
import {useEffect,useRef,useState} from 'react';
import * as maplibregl from 'maplibre-gl';
import type {GeoJSONSource,StyleSpecification} from 'maplibre-gl';
import type {Report} from './ui';
import 'maplibre-gl/dist/maplibre-gl.css';
maplibregl.setWorkerUrl('/maplibre/maplibre-gl-worker.mjs');
maplibregl.setWorkerCount(1);
export type Bounds={north:number;south:number;east:number;west:number;zoom:number};
type Props={reports:Report[];bounds:Bounds;onBounds:(b:Bounds)=>void;onSelect:(r:Report)=>void;center?:[number,number];pin?:[number,number];onPick?:(lat:number,lng:number)=>void;language:'en'|'local'};
export default function MapCanvas(props:Props){
 const container=useRef<HTMLDivElement>(null),map=useRef<maplibregl.Map|null>(null),marker=useRef<maplibregl.Marker|null>(null),latest=useRef(props);
 const [error,setError]=useState('');
 useEffect(()=>{latest.current=props;});
 useEffect(()=>{
  if(!container.current)return;
  let disposed=false;let observer:ResizeObserver|undefined;
  const controller=new AbortController();
  fetch('/osm-style.json',{signal:controller.signal}).then(r=>r.json()).then((style:StyleSpecification)=>{
   if(disposed)return;
   for(const layer of style.layers)if(layer.type==='symbol'&&layer.layout?.['text-field'])layer.layout['text-field']=latest.current.language==='en'?['coalesce',['get','name_en'],['get','name']]:['get','name'];
   const m=new maplibregl.Map({container:container.current!,style,center:[55.2708,25.2048],zoom:11,maxZoom:19,minZoom:5,attributionControl:false});map.current=m;
   m.addControl(new maplibregl.AttributionControl({compact:false}),'bottom-right');
   m.addControl(new maplibregl.NavigationControl({showCompass:false}),'top-right');
   const emit=()=>{const b=m.getBounds();latest.current.onBounds({north:b.getNorth(),south:b.getSouth(),east:b.getEast(),west:b.getWest(),zoom:m.getZoom()});};
   m.on('moveend',emit);
   m.on('error',()=>setError('Some map tiles could not load. Try moving the map or reloading.'));
   m.on('load',()=>{
    m.addSource('reports',{type:'geojson',data:{type:'FeatureCollection',features:[]},cluster:true,clusterRadius:48,clusterMaxZoom:16});
    m.addLayer({id:'clusters',type:'circle',source:'reports',filter:['has','point_count'],paint:{'circle-color':'#245744','circle-radius':22,'circle-stroke-width':4,'circle-stroke-color':'#d5efa4'}});
    m.addLayer({id:'cluster-count',type:'symbol',source:'reports',filter:['has','point_count'],layout:{'text-field':['get','point_count_abbreviated'],'text-font':['noto_sans_regular'],'text-size':13},paint:{'text-color':'#fff'}});
    m.addLayer({id:'report-points',type:'circle',source:'reports',filter:['!', ['has','point_count']],paint:{'circle-radius':12,'circle-color':['case',['get','hazardous'],'#b8793a',['==',['get','status'],'CLEANED'],'#7b9d6a','#245744'],'circle-stroke-color':'#fff','circle-stroke-width':3}});
    m.addLayer({id:'report-labels',type:'symbol',source:'reports',filter:['!', ['has','point_count']],layout:{'text-field':['case',['get','hazardous'],'!',['==',['get','status'],'CLEANED'],'✓',['to-string',['get','severity']]],'text-font':['noto_sans_regular'],'text-size':12,'text-allow-overlap':true},paint:{'text-color':'#fff'}});
    updateReports(m,latest.current.reports);emit();
    if(latest.current.center)m.jumpTo({center:[latest.current.center[1],latest.current.center[0]],zoom:14});
   });
   m.on('click',async e=>{
    if(!m.isStyleLoaded())return;
    const features=m.queryRenderedFeatures(e.point,{layers:['clusters','report-points']});const f=features[0];
    if(f?.properties?.cluster_id!==undefined){const zoom=await (m.getSource('reports') as GeoJSONSource).getClusterExpansionZoom(Number(f.properties.cluster_id));if(f.geometry.type==='Point')m.easeTo({center:f.geometry.coordinates as [number,number],zoom});return;}
    if(f){const r=latest.current.reports.find(r=>r.id===f.properties.id);if(r)latest.current.onSelect(r);return;}
    latest.current.onPick?.(e.lngLat.lat,e.lngLat.lng);
   });
   observer=new ResizeObserver(()=>m.resize());observer.observe(container.current!);
  }).catch(e=>{if(e.name!=='AbortError')setError('The map could not load. Please reload the page.');});
  return()=>{disposed=true;controller.abort();observer?.disconnect();marker.current?.remove();marker.current=null;map.current?.remove();map.current=null;};
 },[]);
 useEffect(()=>{const m=map.current;if(m?.getSource('reports'))updateReports(m,props.reports);},[props.reports]);
 useEffect(()=>{const m=map.current;if(m&&props.center)m.easeTo({center:[props.center[1],props.center[0]],zoom:14});},[props.center]);
 useEffect(()=>{const m=map.current;if(!m)return;const apply=()=>{for(const l of m.getStyle().layers||[])if(l.type==='symbol'&&l.source!=='reports'&&l.layout?.['text-field'])m.setLayoutProperty(l.id,'text-field',props.language==='en'?['coalesce',['get','name_en'],['get','name']]:['get','name']);};if(m.isStyleLoaded())apply();else m.once('load',apply);return()=>{m.off('load',apply);};},[props.language]);
 useEffect(()=>{const m=map.current;if(!m)return;marker.current?.remove();marker.current=null;if(props.pin){const markerEl=document.createElement('div');markerEl.className='map-location-pin';markerEl.textContent='+';marker.current=new maplibregl.Marker({element:markerEl,draggable:!!props.onPick}).setLngLat([props.pin[1],props.pin[0]]).addTo(m);marker.current.on('dragend',()=>{const p=marker.current!.getLngLat();latest.current.onPick?.(p.lat,p.lng);});}},[props.pin,props.onPick]);
 return <div className="map-frame"><div ref={container} className="map-canvas" aria-label="Interactive cleanup map"/>{error&&<button className="map-error" onClick={()=>setError('')}>{error} Dismiss</button>}</div>;
}
function updateReports(m:maplibregl.Map,reports:Report[]){(m.getSource('reports') as GeoJSONSource).setData({type:'FeatureCollection',features:reports.map(r=>({type:'Feature',geometry:{type:'Point',coordinates:[r.longitude,r.latitude]},properties:{id:r.id,hazardous:r.hazardous,status:r.status,severity:r.severity}}))});}
