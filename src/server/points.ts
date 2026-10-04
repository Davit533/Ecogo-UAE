import {randomBytes} from 'node:crypto';
import {Prisma} from '@/generated/prisma/client';
import {db} from '@/lib/db';
import {nextStreak} from '@/lib/domain';
import {requireValue} from './security';
type Tx=Prisma.TransactionClient;
export async function award(tx:Tx,userId:string,amount:number,type:string,reference:string,reason:string){
 if(await tx.pointTransaction.findUnique({where:{reference}}))return;
 await tx.pointTransaction.create({data:{userId,amount,type,reference,reason}});
 const profile=await tx.profile.findUniqueOrThrow({where:{userId}});const streak=nextStreak(profile.lastActivityDay,profile.currentStreak,profile.longestStreak);
 await tx.profile.update({where:{userId},data:{balance:{increment:amount},lifetimePoints:{increment:Math.max(0,amount)},lastActivityDay:streak.day,currentStreak:streak.current,longestStreak:streak.longest}});
 await tx.notification.create({data:{userId,message:`${reason} · +${amount} Eco Points`,href:'/profile'}});
}
export async function achievements(tx:Tx,userId:string){
 const [definitions,reports,cleanups,groups,profile,lessons,events]=await Promise.all([tx.achievement.findMany({where:{active:true}}),tx.trashReport.count({where:{reporterId:userId,status:{in:['APPROVED','CLAIMED','AWAITING_VERIFICATION','CLEANED']}}}),tx.cleanupAttempt.count({where:{cleanerId:userId,status:'VERIFIED'}}),tx.groupMember.count({where:{userId,status:'ACTIVE'}}),tx.profile.findUniqueOrThrow({where:{userId}}),tx.lessonResult.count({where:{userId}}),tx.eventParticipant.count({where:{userId,attended:true}})]);
 const values:Record<string,number>={REPORTS:reports,CLEANUPS:cleanups,GROUPS:groups,STREAK:profile.currentStreak,POINTS:profile.lifetimePoints,LESSONS:lessons,EVENTS:events};
 for(const a of definitions){if((values[a.requirementType]??0)<a.requirementValue)continue;if(await tx.userAchievement.findUnique({where:{userId_achievementId:{userId,achievementId:a.id}}}))continue;await tx.userAchievement.create({data:{userId,achievementId:a.id}});if(a.bonus)await award(tx,userId,a.bonus,'ACHIEVEMENT',`achievement:${userId}:${a.id}`,`Achievement unlocked: ${a.name}`);}
 const challenges=await tx.challenge.findMany({where:{active:true,startsAt:{lte:new Date()},endsAt:{gte:new Date()}}});
 for(const c of challenges){const count=c.kind==='CLEANUPS'?await tx.cleanupAttempt.count({where:{cleanerId:userId,status:'VERIFIED',verifiedAt:{gte:c.startsAt,lte:c.endsAt}}}):await tx.trashReport.count({where:{reporterId:userId,status:{in:['APPROVED','CLAIMED','AWAITING_VERIFICATION','CLEANED']},createdAt:{gte:c.startsAt,lte:c.endsAt}}});if(count>=c.target)await award(tx,userId,c.bonus,'CHALLENGE',`challenge:${userId}:${c.id}`,c.name);}
}
export async function redeem(userId:string,rewardId:string,requestKey:string){
 return db.$transaction(async tx=>{
  await tx.$queryRaw`SELECT "userId" FROM "Profile" WHERE "userId"=${userId} FOR UPDATE`;
  const existing=await tx.rewardRedemption.findUnique({where:{requestKey}});if(existing){requireValue(existing.userId===userId&&existing.rewardId===rewardId,'Request key already used.',409);return existing;}
  await tx.$queryRaw`SELECT "id" FROM "Reward" WHERE "id"=${rewardId} FOR UPDATE`;
  const reward=await tx.reward.findUnique({where:{id:rewardId}});const profile=await tx.profile.findUniqueOrThrow({where:{userId}});
  requireValue(reward&&reward.active&&reward.startsAt<=new Date()&&reward.expiresAt>new Date(),'This reward is not currently available.');
  requireValue(reward.quantity>0,'This reward is sold out.');requireValue(profile.balance>=reward.cost,'You need more Eco Points for this reward.');
  requireValue(await tx.rewardRedemption.count({where:{userId,rewardId}})<reward.perUserLimit,'You have reached the limit for this reward.');
  await tx.reward.update({where:{id:rewardId},data:{quantity:{decrement:1}}});await tx.profile.update({where:{userId},data:{balance:{decrement:reward.cost}}});
  const redemption=await tx.rewardRedemption.create({data:{userId,rewardId,requestKey,code:`GG-${randomBytes(12).toString('hex').toUpperCase()}`}});
  await tx.pointTransaction.create({data:{userId,amount:-reward.cost,type:'REDEMPTION',reference:`redemption:${redemption.id}`,reason:reward.name}});return redemption;
 });
}
