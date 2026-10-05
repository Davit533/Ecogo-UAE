import {randomBytes,createHash} from 'node:crypto';
import {hash,compare} from 'bcryptjs';
import {z} from 'zod';

import {db} from '@/lib/db';
import {EMIRATES} from '@/lib/domain';
import {requireValue,rateLimit} from './security';
const password=z.string().min(12,'Use at least 12 characters.').max(128);
const registerSchema=z.object({email:z.email(),password,name:z.string().trim().min(2).max(60),username:z.string().regex(/^[a-zA-Z0-9_]{3,24}$/),kind:z.enum(['VOLUNTEER','CHILD','ORGANIZATION_ADMIN']),birthDate:z.iso.date(),emirate:z.enum(EMIRATES),guardianEmail:z.email().optional(),organizationName:z.string().min(2).max(100).optional(),interest:z.enum(['CLEAN','REPORT','BOTH','EXPLORE']).default('BOTH')});
export async function recoveryCode(userId:string){const code=randomBytes(32).toString('hex');await db.$transaction(async tx=>{await tx.authToken.deleteMany({where:{userId,purpose:'RECOVERY'}});await tx.authToken.create({data:{userId,hash:createHash('sha256').update(code).digest('hex'),purpose:'RECOVERY',expiresAt:new Date(Date.now()+10*365*86400000)}});});return code;}
export async function recover(input:unknown){const data=z.object({email:z.email(),code:z.string().regex(/^[a-f0-9]{64}$/),password}).parse(input);await rateLimit(`recovery:${data.email.toLowerCase()}`,5,900);return db.$transaction(async tx=>{const token=await tx.authToken.findUnique({where:{hash:createHash('sha256').update(data.code).digest('hex')},include:{user:true}});requireValue(token&&token.purpose==='RECOVERY'&&token.expiresAt>new Date()&&token.user.email===data.email.toLowerCase()&&!token.user.banned,'The email or recovery code is incorrect.',400);await tx.authToken.delete({where:{id:token.id}});await tx.user.update({where:{id:token.userId},data:{passwordHash:await hash(data.password,12),sessionVersion:{increment:1}}});return {message:'Password changed. Sign in and generate a new recovery code in Settings.'};});}
export async function changePassword(userId:string,input:unknown){const data=z.object({currentPassword:z.string(),password}).parse(input);const user=await db.user.findUniqueOrThrow({where:{id:userId}});requireValue(await compare(data.currentPassword,user.passwordHash),'Your current password is incorrect.',403);await db.user.update({where:{id:userId},data:{passwordHash:await hash(data.password,12),sessionVersion:{increment:1}}});return {message:'Password changed. Sign in again.'};}
export async function register(input:unknown){
 const data=registerSchema.parse(input);const email=data.email.toLowerCase();await rateLimit(`register:${email}`,3);
 requireValue(email!==process.env.OWNER_EMAIL?.toLowerCase(),'This address is reserved for the platform owner.',409);
 const age=(Date.now()-Date.parse(data.birthDate))/31557600000;
 requireValue(age>=0&&age<=120,'Enter a valid date of birth.');requireValue(data.kind==='CHILD'?age<12:age>=12,'Please choose the account type that matches your age.');
 if(data.kind==='CHILD'){requireValue(data.guardianEmail,'A guardian email is required.');const guardian=await db.user.findUnique({where:{email:data.guardianEmail.toLowerCase()},include:{child:true}});requireValue(guardian&&!guardian.banned&&guardian.role!=='CHILD','Your guardian must create their own adult account first.');}
 if(data.kind==='ORGANIZATION_ADMIN')requireValue(age>=18&&data.organizationName,'Organization administrators must be adults and provide an organization name.');
 requireValue(!await db.user.findFirst({where:{OR:[{email},{username:data.username}]}}),'That email or username is already registered.',409);
 const user=await db.user.create({data:{email,verifiedAt:new Date(),passwordHash:await hash(data.password,12),name:data.name,username:data.username,role:data.kind,profile:{create:{emirate:data.emirate,interest:data.interest,onboardingComplete:true}},...(data.kind==='CHILD'?{child:{create:{birthDate:new Date(data.birthDate),guardianEmail:data.guardianEmail!.toLowerCase()}}}:{})}});
 if(data.kind==='ORGANIZATION_ADMIN')await db.organization.create({data:{name:data.organizationName!,description:'',type:'Community organization',emirate:data.emirate,members:{create:{userId:user.id,role:'ADMIN'}}}});
 if(data.kind==='CHILD'){const guardian=await db.user.findUniqueOrThrow({where:{email:data.guardianEmail!.toLowerCase()}});await db.notification.create({data:{userId:guardian.id,message:'A child account is awaiting your approval in Settings.',href:'/settings'}});}
 return {message:data.kind==='CHILD'?'Ask your guardian to sign in and approve your account in Settings.':'Your account is ready. Save your recovery code, then sign in.',recoveryCode:await recoveryCode(user.id)};
}
export async function consumeToken(input:unknown){
 const data=z.object({token:z.string().length(64),password:password.optional(),consent:z.boolean().optional()}).parse(input);
 const digest=createHash('sha256').update(data.token).digest('hex');
 return db.$transaction(async tx=>{
  const token=await tx.authToken.findUnique({where:{hash:digest}});requireValue(token&&token.expiresAt>new Date(),'This link has expired or was already used. Request a new one.');
  if(token.purpose==='RESET'){requireValue(data.password,'Enter a new password.');await tx.user.update({where:{id:token.userId},data:{passwordHash:await hash(data.password,12),sessionVersion:{increment:1}}});}
  else {if(token.purpose==='GUARDIAN'){requireValue(data.consent,'Guardian consent is required.');await tx.childProfile.update({where:{userId:token.userId},data:{approvedAt:new Date()}});}await tx.user.update({where:{id:token.userId},data:{verifiedAt:new Date()}});}
  await tx.authToken.delete({where:{id:token.id}});return {message:'Your account is ready. You can sign in now.'};
 });
}
