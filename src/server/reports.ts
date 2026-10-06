import {z} from 'zod';
import {db} from '@/lib/db';
import {CATEGORIES,EMIRATES,cleanupPoints,distanceMeters,isAdmin} from '@/lib/domain';
import {requireValue,rateLimit} from './security';
import {ownPhoto} from './uploads';
import {review,safetyAdvice} from './ai';
import {managedPlaces} from './places';
import {award,achievements} from './points';
import type {Role} from '@/generated/prisma/client';
const schema=z.object({title:z.string().trim().min(5).max(100),description:z.string().trim().min(15).max(1500),category:z.enum(CATEGORIES),severity:z.coerce.number().int().min(1).max(5),latitude:z.coerce.number().min(22.6).max(26.2),longitude:z.coerce.number().min(51.4).max(56.6),address:z.string().min(3).max(200),emirate:z.enum(EMIRATES),photoId:z.string().min(1),placeId:z.string().optional()});
export async function createReport(user:{id:string;role:Role},input:unknown){
 requireValue(user.role!=='CHILD','Ask your guardian to report this location with you. Child accounts cannot publish exact locations.',403);
 await rateLimit(`report:${user.id}`,12,86400);const data=schema.parse(input);const photo=await ownPhoto(user.id,data.photoId);
 const nearby=await db.trashReport.findMany({where:{status:{in:['PENDING_REVIEW','APPROVED','CLAIMED','AWAITING_VERIFICATION']},latitude:{gte:data.latitude-.002,lte:data.latitude+.002},longitude:{gte:data.longitude-.002,lte:data.longitude+.002},createdAt:{gte:new Date(Date.now()-30*86400000)}},take:30});
 const duplicate=nearby.find(r=>distanceMeters(r.latitude,r.longitude,data.latitude,data.longitude)<60&&r.category===data.category);
 requireValue(!duplicate,`This may already be reported. Open the nearby report ${duplicate?.id||''} and confirm it is still there.`,409);
 const hashes=await db.upload.findMany({where:{hash:photo.hash},select:{id:true}});const reused=await db.trashReport.findFirst({where:{photoId:{in:hashes.map(p=>p.id)}}});requireValue(!reused,'This photo has already been used in another report.',409);
 const matches=await managedPlaces(data.latitude,data.longitude);
 const selected=data.placeId?matches.find(p=>p.id===data.placeId):matches.length===1?matches[0]:undefined;
 requireValue(!data.placeId||selected,'This location is outside the verified managed area.');
 const hazardous=safetyAdvice(data.description,data.category,data.severity).hazardous;
 const report=await db.trashReport.create({data:{...data,placeId:selected?.id,reporterId:user.id,hazardous}});
 if(selected){const staff=await db.organizationMember.findMany({where:{organizationId:selected.organizationId},select:{userId:true}});await db.notification.createMany({data:staff.map(m=>({userId:m.userId,message:'A new environmental report was submitted at '+selected.name+'.',href:'/organizations/'+selected.organizationId}))});}
 const result=await review({...data,beforeId:data.photoId});await db.aIReview.create({data:{reportId:report.id,provider:result.provider,decision:result.decision,confidence:result.confidence,reason:result.reason}});
 if(result.hazardous)await db.trashReport.update({where:{id:report.id},data:{hazardous:true}});
 const auto=await db.setting.findUnique({where:{key:'aiAutoApproval'}});
 if(auto?.value===true&&result.decision==='APPROVE'&&result.confidence>=.95&&!hazardous&&!result.hazardous)await moderateReport('SYSTEM',report.id,'APPROVE','High-confidence AI review');
 return {id:report.id,message:'Report saved for review. You will be notified when it is approved.'};
}
export async function moderateReport(actorId:string,id:string,decision:string,reason:string){
 return db.$transaction(async tx=>{
  await tx.$queryRaw`SELECT "id" FROM "TrashReport" WHERE "id"=${id} FOR UPDATE`;
  const r=await tx.trashReport.findUniqueOrThrow({where:{id}});requireValue(r.status==='PENDING_REVIEW','This report has already been reviewed.',409);requireValue(r.reporterId!==actorId,'You cannot approve your own report.',403);
  const status=decision==='APPROVE'?'APPROVED':decision==='DUPLICATE'?'DUPLICATE':'REJECTED';
  await tx.trashReport.update({where:{id},data:{status}});
  if(status==='APPROVED'){const config=await tx.setting.findUnique({where:{key:'reportPoints'}});await award(tx,r.reporterId,Number(config?.value??10),'REPORT',`report:${id}`,'Your report was approved');await achievements(tx,r.reporterId);}
  await tx.auditLog.create({data:{actorId,action:`REPORT_${status}`,target:id,metadata:{reason}}});return {message:`Report ${status.toLowerCase()}.`};
 });
}
export async function claim(user:{id:string;role:Role},id:string){
 requireValue(user.role!=='CHILD','Child accounts cannot claim cleanups.',403);
 return db.$transaction(async tx=>{
  await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${user.id} FOR UPDATE`;
  await tx.$queryRaw`SELECT "id" FROM "TrashReport" WHERE "id"=${id} FOR UPDATE`;
  const r=await tx.trashReport.findUniqueOrThrow({where:{id},include:{place:{include:{organization:true}}}});if(r.place&&r.place.organization.status==='VERIFIED'&&r.place.status==='APPROVED')requireValue(isAdmin(user.role)||await tx.organizationMember.findUnique({where:{organizationId_userId:{organizationId:r.place.organizationId,userId:user.id}}}),'This is managed property. Ask the organization for permission; only its team can claim this cleanup.',403);requireValue(!r.hazardous,'Do not touch this waste. Contact the appropriate local authority.');
  if(r.status==='CLAIMED'){const expired=await tx.cleanupAttempt.findFirst({where:{reportId:id,status:'CLAIMED',expiresAt:{lt:new Date()}}});if(expired){await tx.cleanupAttempt.update({where:{id:expired.id},data:{status:'EXPIRED'}});await tx.trashReport.update({where:{id},data:{status:'APPROVED'}});r.status='APPROVED';}}
  requireValue(r.status==='APPROVED','This report is no longer available to claim.',409);
  requireValue(await tx.cleanupAttempt.count({where:{cleanerId:user.id,status:{in:['CLAIMED','PENDING_REVIEW']},expiresAt:{gt:new Date()}}})<3,'Finish or cancel an existing cleanup before claiming another.');
  const cleanup=await tx.cleanupAttempt.create({data:{reportId:id,cleanerId:user.id,expiresAt:new Date(Date.now()+24*3600000)}});await tx.trashReport.update({where:{id},data:{status:'CLAIMED'}});
  await tx.notification.create({data:{userId:r.reporterId,message:'A volunteer has claimed your report.',href:`/map?report=${id}`}});return {id:cleanup.id,message:'Cleanup claimed for 24 hours. Stay safe and upload your after photo when finished.'};
 });
}
export async function submitCleanup(userId:string,id:string,input:unknown){
 const data=z.object({afterPhotoId:z.string(),notes:z.string().max(1000).default(''),safe:z.literal(true)}).parse(input);
 const photo=await ownPhoto(userId,data.afterPhotoId);const attempt=await db.cleanupAttempt.findUniqueOrThrow({where:{id},include:{report:true}});requireValue(attempt.cleanerId===userId&&attempt.status==='CLAIMED','This cleanup is not yours or has already been submitted.',403);requireValue(attempt.expiresAt>new Date(),'This claim has expired. Claim the report again.');
 const before=await db.upload.findUniqueOrThrow({where:{id:attempt.report.photoId}});requireValue(before.hash!==photo.hash,'Upload a new after photo, not the original report photo.');
 const hashes=await db.upload.findMany({where:{hash:photo.hash},select:{id:true}});requireValue(!await db.cleanupAttempt.findFirst({where:{afterPhotoId:{in:hashes.map(p=>p.id)}}}),'This cleanup photo has already been used.');
 const risks:string[]=[];if(Date.now()-attempt.claimedAt.getTime()<60000)risks.push('FAST_CLEANUP');if(attempt.report.reporterId===userId)risks.push('SELF_CLEANUP');
 await db.$transaction(async tx=>{const updated=await tx.cleanupAttempt.updateMany({where:{id,status:'CLAIMED'},data:{afterPhotoId:data.afterPhotoId,notes:data.notes,status:'PENDING_REVIEW',submittedAt:new Date()}});requireValue(updated.count===1,'This cleanup has already been submitted.',409);await tx.trashReport.update({where:{id:attempt.reportId},data:{status:'AWAITING_VERIFICATION',riskSignals:risks}});});
 const result=await review({description:attempt.report.description,category:attempt.report.category,severity:attempt.report.severity,beforeId:attempt.report.photoId,afterId:data.afterPhotoId});
 await db.aIReview.create({data:{reportId:attempt.reportId,cleanupId:id,provider:result.provider,decision:result.decision,confidence:result.confidence,reason:result.reason}});
 const auto=await db.setting.findUnique({where:{key:'aiAutoApproval'}});if(auto?.value===true&&result.decision==='APPROVE'&&result.confidence>=.97&&!result.hazardous&&!risks.length)await moderateCleanup('SYSTEM',id,true,'High-confidence before/after review');
 return {message:'Cleanup proof saved for verification. Points are awarded only after approval.'};
}
export async function moderateCleanup(actorId:string,id:string,approve:boolean,reason:string){
 return db.$transaction(async tx=>{
  await tx.$queryRaw`SELECT "id" FROM "CleanupAttempt" WHERE "id"=${id} FOR UPDATE`;
  const c=await tx.cleanupAttempt.findUniqueOrThrow({where:{id},include:{report:true}});requireValue(c.status==='PENDING_REVIEW','This cleanup has already been reviewed.',409);requireValue(actorId!==c.cleanerId&&actorId!==c.report.reporterId,'Independent moderation is required.',403);
  await tx.cleanupAttempt.update({where:{id},data:{status:approve?'VERIFIED':'REJECTED',verifiedAt:approve?new Date():null}});await tx.trashReport.update({where:{id:c.reportId},data:{status:approve?'CLEANED':'APPROVED'}});
  if(approve){const config=await tx.setting.findUnique({where:{key:'cleanupBasePoints'}});await award(tx,c.cleanerId,cleanupPoints(c.report.severity,Number(config?.value??20)),'CLEANUP',`cleanup:${c.reportId}`,'Your cleanup was verified');await achievements(tx,c.cleanerId);}
  else await tx.notification.create({data:{userId:c.cleanerId,message:`Cleanup needs another attempt: ${reason}`,href:`/map?report=${c.reportId}`}});
  await tx.auditLog.create({data:{actorId,action:approve?'CLEANUP_APPROVED':'CLEANUP_REJECTED',target:id,metadata:{reason}}});return {message:approve?'Cleanup verified and points awarded.':'Cleanup rejected; report is available again.'};
 });
}
export async function reportDetail(id:string,user:{id:string;role:string}){const r=await db.trashReport.findUnique({where:{id},include:{cleanups:{orderBy:{claimedAt:'desc'},take:5},_count:{select:{confirmations:true}},place:{select:{name:true,organizationId:true}},reviews:{orderBy:{createdAt:'desc'},take:2}}});requireValue(r,'Report not found.',404);const staff=r.place?await db.organizationMember.findUnique({where:{organizationId_userId:{organizationId:r.place.organizationId,userId:user.id}}}):null;requireValue(['APPROVED','CLAIMED','AWAITING_VERIFICATION','CLEANED'].includes(r.status)||r.reporterId===user.id||isAdmin(user.role)||(staff&&r.status!=='REMOVED'),'This report is private or awaiting moderation.',403);return r;}


export async function editReport(user:{id:string;role:Role},id:string,input:unknown){
 const existing=await db.trashReport.findUniqueOrThrow({where:{id}});requireValue(existing.reporterId===user.id,'Only the person who submitted this report can edit it.',403);
 const data=schema.parse(input);await ownPhoto(user.id,data.photoId);
 const matches=await managedPlaces(data.latitude,data.longitude);const selected=data.placeId?matches.find(p=>p.id===data.placeId):matches.length===1?matches[0]:undefined;
 requireValue(!data.placeId||selected,'This location is outside the verified managed area.');
 const photo=await db.upload.findUniqueOrThrow({where:{id:data.photoId}});const hashes=await db.upload.findMany({where:{hash:photo.hash},select:{id:true}});
 requireValue(!await db.trashReport.findFirst({where:{id:{not:id},photoId:{in:hashes.map(p=>p.id)}}}),'This photo is already used in another report.',409);
 const report=await db.$transaction(async tx=>{
  await tx.$queryRaw`SELECT "id" FROM "TrashReport" WHERE "id"=${id} FOR UPDATE`;
  const r=await tx.trashReport.findUniqueOrThrow({where:{id}});requireValue(r.reporterId===user.id,'Only the person who submitted this report can edit it.',403);
  requireValue(['PENDING_REVIEW','APPROVED','REJECTED','DUPLICATE'].includes(r.status),'A report with a cleanup in progress or a completed cleanup cannot be edited.',409);
  requireValue(r.latitude===data.latitude&&r.longitude===data.longitude,'Report location cannot be moved. Delete it and submit a new report if the pin is wrong.');
  await tx.aIReview.deleteMany({where:{reportId:id,cleanupId:null}});
  const updated=await tx.trashReport.update({where:{id},data:{...data,placeId:selected?.id??null,hazardous:safetyAdvice(data.description,data.category,data.severity).hazardous,status:'PENDING_REVIEW'}});
  await tx.auditLog.create({data:{actorId:user.id,action:'REPORT_EDITED',target:id,metadata:{previousStatus:r.status}}});return updated;
 });
 const result=await review({...report,beforeId:report.photoId});await db.aIReview.create({data:{reportId:id,provider:result.provider,decision:result.decision,confidence:result.confidence,reason:result.reason}});
 return {id,message:'Changes saved. Your report is back in the review queue; approval does not award duplicate points.'};
}
export async function deleteReport(user:{id:string;role:Role},id:string){
 return db.$transaction(async tx=>{
  await tx.$queryRaw`SELECT "id" FROM "TrashReport" WHERE "id"=${id} FOR UPDATE`;
  const r=await tx.trashReport.findUniqueOrThrow({where:{id}});requireValue(r.reporterId===user.id,'Only the person who submitted this report can delete it.',403);
  requireValue(!['CLAIMED','AWAITING_VERIFICATION'].includes(r.status),'Cancel your cleanup claim or wait for verification before deleting this report.',409);
  requireValue(r.status!=='REMOVED','This report was already deleted.',409);
  await tx.trashReport.update({where:{id},data:{status:'REMOVED'}});await tx.savedReport.deleteMany({where:{reportId:id}});
  await tx.auditLog.create({data:{actorId:user.id,action:'REPORT_DELETED',target:id,metadata:{previousStatus:r.status}}});
  return {message:'Report removed from the map and your report list. Verified contribution and audit records are retained.'};
 });
}
