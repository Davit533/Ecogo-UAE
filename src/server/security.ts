import {createHash} from 'node:crypto';
import {db} from '@/lib/db';
import {getServerSession} from 'next-auth';
import {authOptions} from './auth';
import {isAdmin} from '@/lib/domain';
export class AppError extends Error { constructor(public status:number,message:string){super(message);} }
export function requireValue(condition:unknown,message:string,status=400):asserts condition {if(!condition) throw new AppError(status,message);}
export async function actor() {
  const session = await getServerSession(authOptions);
  requireValue(session?.user?.email,'Please sign in to continue.',401);
  const user = await db.user.findUnique({where:{email:session.user.email},include:{profile:true,child:true}});
  requireValue(user && !user.banned,'Your account is unavailable.',403);
  requireValue(user.role !== 'CHILD' || user.child?.approvedAt,'Guardian approval is required.',403);
  return user;
}
export async function admin(owner=false){const user=await actor();requireValue(owner ? user.role==='OWNER' : isAdmin(user.role),'You do not have permission for this action.',403);return user;}
export function csrf(request:Request){const origin=request.headers.get('origin');const expected=new URL(process.env.NEXTAUTH_URL||request.url).origin;requireValue(origin===expected,'This request could not be verified. Refresh the page.',403);}
export async function rateLimit(key:string,max:number,seconds=3600){
  const hash=createHash('sha256').update(key).digest('hex');
  const now=new Date();
  const rows=await db.$queryRaw<Array<{count:number}>>`INSERT INTO "RateLimit" ("key","count","expiresAt") VALUES (${hash},1,${new Date(now.getTime()+seconds*1000)}) ON CONFLICT ("key") DO UPDATE SET "count"=CASE WHEN "RateLimit"."expiresAt" < ${now} THEN 1 ELSE "RateLimit"."count"+1 END, "expiresAt"=CASE WHEN "RateLimit"."expiresAt" < ${now} THEN ${new Date(now.getTime()+seconds*1000)} ELSE "RateLimit"."expiresAt" END RETURNING "count"`;
  requireValue(rows[0].count<=max,'Too many attempts. Please try again later.',429);
}
export function audit(actorId:string,action:string,target:string,metadata:Record<string,string|number|boolean>={}){return db.auditLog.create({data:{actorId,action,target,metadata}});}
