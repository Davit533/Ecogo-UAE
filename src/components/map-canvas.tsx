'use client';
import {MapContainer,TileLayer,Marker,Popup,useMapEvents,useMap} from 'react-leaflet';
import {divIcon,type LatLngExpression} from 'leaflet';
import {useEffect,useMemo} from 'react';
import Supercluster from 'supercluster';
import type {Report} from './ui';
import 'leaflet/dist/leaflet.css';
export type Bounds={north:number;south:number;east:number;west:number;zoom:number};
function Events({onBounds,onPick}:{onBounds:(b:Bounds)=>void;onPick?:(lat:number,lng:number)=>void}){const map=useMapEvents({moveend(){const b=map.getBounds();onBounds({north:b.getNorth(),south:b.getSouth(),east:b.getEast(),west:b.getWest(),zoom:map.getZoom()});},click(e){onPick?.(e.latlng.lat,e.latlng.lng);}});return null;}
function Recenter({center}:{center?:[number,number]}){const map=useMap();useEffect(()=>{if(center)map.setView(center,14);},[center,map]);return null;}
export default function MapCanvas({reports,bounds,onBounds,onSelect,center,pin,onPick}:{reports:Report[];bounds:Bounds;onBounds:(b:Bounds)=>void;onSelect:(r:Report)=>void;center?:[number,number];pin?:[number,number];onPick?:(lat:number,lng:number)=>void}){
 const index=useMemo(()=>new Supercluster<{report:Report}>({radius:50,maxZoom:17}).load(reports.map(r=>({type:'Feature' as const,geometry:{type:'Point' as const,coordinates:[r.longitude,r.latitude]},properties:{report:r}}))),[reports]);
 const clusters=index.getClusters([bounds.west,bounds.south,bounds.east,bounds.north],Math.floor(bounds.zoom));
 return <MapContainer center={(center||[25.2048,55.2708]) as LatLngExpression} zoom={11} className="map-canvas" scrollWheelZoom><TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"/><Events onBounds={onBounds} onPick={onPick}/><Recenter center={center}/>{clusters.map(feature=>{const [lng,lat]=feature.geometry.coordinates;const props=feature.properties;if('cluster' in props)return <Marker key={`cluster-${props.cluster_id}`} position={[lat,lng]} icon={divIcon({className:'',html:`<div class="map-cluster">${props.point_count}</div>`,iconSize:[40,40]})}><Popup>{props.point_count} reports nearby. Zoom in to explore.</Popup></Marker>;const r=props.report;return <Marker key={r.id} position={[lat,lng]} eventHandlers={{click:()=>onSelect(r)}} icon={divIcon({className:'',html:`<div class="map-pin ${r.hazardous?'hazardous':r.status==='CLEANED'?'cleaned':''}"><span>${r.hazardous?'!':r.status==='CLEANED'?'✓':r.severity}</span></div>`,iconSize:[34,34]})}/>;})}{pin&&<Marker position={pin} draggable eventHandlers={{dragend:e=>{const p=e.target.getLatLng();onPick?.(p.lat,p.lng);}}} icon={divIcon({className:'',html:'<div class="map-pin"><span>+</span></div>',iconSize:[34,34]})}/>}</MapContainer>;
}
