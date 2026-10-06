import {db} from '@/lib/db';
import {distanceMeters} from '@/lib/domain';
export async function managedPlaces(latitude:number,longitude:number){
 const places=await db.place.findMany({where:{status:'APPROVED',organization:{status:'VERIFIED'},latitude:{gte:latitude-.003,lte:latitude+.003},longitude:{gte:longitude-.003,lte:longitude+.003}},include:{organization:{select:{id:true,name:true,type:true}}}});
 return places.filter(p=>distanceMeters(p.latitude,p.longitude,latitude,longitude)<=p.radiusMeters);
}
// Approval of a managed area also routes older unassigned reports, only when unambiguous.
export async function routeExistingReports(){
 const places=await db.place.findMany({where:{status:'APPROVED',organization:{status:'VERIFIED'}}});let linked=0;
 for(const place of places){const reports=await db.trashReport.findMany({where:{placeId:null,latitude:{gte:place.latitude-.003,lte:place.latitude+.003},longitude:{gte:place.longitude-.003,lte:place.longitude+.003},status:{notIn:['REMOVED','REJECTED','DUPLICATE']}},take:500});
 for(const r of reports){const matches=places.filter(p=>distanceMeters(p.latitude,p.longitude,r.latitude,r.longitude)<=p.radiusMeters);if(matches.length===1){linked+=(await db.trashReport.updateMany({where:{id:r.id,placeId:null},data:{placeId:matches[0].id}})).count;}}
 }return linked;
}
