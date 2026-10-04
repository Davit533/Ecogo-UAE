export const EMIRATES = ['Abu Dhabi','Dubai','Sharjah','Ajman','Umm Al Quwain','Ras Al Khaimah','Fujairah'] as const;
export const CATEGORIES = ['Plastic','Bottles','Cans','Paper','Cardboard','Food waste','General litter','Construction debris','Electronic waste','Bulky waste','Illegal dumping','Hazardous waste','Other'] as const;
export const SEVERITIES = ['Minimal','Mild','Moderate','Severe','Critical dumping'];
export const ADMIN_ROLES = ['OWNER','ADMIN','MODERATOR'];
export function isAdmin(role:string) { return ADMIN_ROLES.includes(role); }
export function cleanupPoints(severity:number,base=20) { return Math.min(100,base+Math.max(0,Math.min(4,severity-1))*10); }
export function dubaiDay(date = new Date()) { return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Dubai',year:'numeric',month:'2-digit',day:'2-digit'}).format(date); }
export function nextStreak(last:string|null,current:number,longest:number,day = dubaiDay()) {
  if(last === day) return {current,longest,day};
  const gap = last ? (Date.parse(day)-Date.parse(last))/86400000 : Infinity;
  const next = gap === 1 ? current+1 : 1;
  return {current:next,longest:Math.max(next,longest),day};
}
export function distanceMeters(a:number,b:number,c:number,d:number) {
  const r = Math.PI/180, x = Math.sin((c-a)*r/2)**2+Math.cos(a*r)*Math.cos(c*r)*Math.sin((d-b)*r/2)**2;
  return 6371000*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));
}
export function label(value:string) {return value.replaceAll('_',' ').toLowerCase().replace(/^./,s=>s.toUpperCase());}
export const LESSONS = [
  {id:'sorting',title:'A second life for everyday things',topic:'Recycling',intro:'Clean, dry bottles and cans can be recycled. Keep food and liquids out of recycling bins. Follow the labels on your local bins.',question:'Where should an empty, clean plastic bottle go?',options:['The sea','The correct recycling bin','Mixed with food'],answer:1},
  {id:'water',title:'Every drop belongs',topic:'Water',intro:'The UAE is a dry country. Turn the tap off while brushing, report leaks, and reuse suitable water for plants. Small habits add up.',question:'Which habit saves water?',options:['Leaving a tap running','Ignoring a leak','Turning the tap off while brushing'],answer:2},
  {id:'mangroves',title:'Meet our coastal guardians',topic:'UAE nature',intro:'Mangroves shelter young marine animals and protect coastlines. Enjoy them from marked paths, leave wildlife alone, and take your litter home.',question:'How can you protect mangroves?',options:['Stay on marked paths and take litter home','Break branches','Leave food for wildlife'],answer:0},
  {id:'safety',title:'Be a careful cleanup hero',topic:'Safety',intro:'Never touch needles, unknown liquids, chemicals, or dangerous roadside litter. Ask a trusted adult for help. Reporting safely is an important contribution.',question:'You find an unknown chemical container. What now?',options:['Open it','Keep away and tell a trusted adult','Pick it up for points'],answer:1}
] as const;
