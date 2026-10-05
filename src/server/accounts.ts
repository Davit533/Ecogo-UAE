import {randomBytes,createHash} from 'node:crypto';
import {hash} from 'bcryptjs';
import {z} from 'zod';
import nodemailer from 'nodemailer';
import {db} from '@/lib/db';
import {EMIRATES} from '@/lib/domain';
import {requireValue,rateLimit} from './security';
const password=z.string().min(12,'Use at least 12 characters.').max(128);
const registerSchema=z.object({email:z.email(),password,name:z.string().trim().min(2).max(60),username:z.string().regex(/^[a-zA-Z0-9_]{3,24}$/),kind:z.enum(['VOLUNTEER','CHILD','ORGANIZATION_ADMIN']),birthDate:z.iso.date(),emirate:z.enum(EMIRATES),guardianEmail:z.email().optional(),organizationName:z.string().min(2).max(100).optional(),interest:z.enum(['CLEAN','REPORT','BOTH','EXPLORE']).default('BOTH')});
export function emailConfigured(){return Boolean(process.env.MAIL_FROM&&(process.env.BREVO_API_KEY||process.env.SMTP_HOST));}
export async function deliverToken(userId:string,email:string,purpose:string){
  const raw=randomBytes(32).toString('hex');const digest=createHash('sha256').update(raw).digest('hex');
  await db.authToken.create({data:{userId,hash:digest,purpose,expiresAt:new Date(Date.now()+86400000)}});
  const url=`${process.env.NEXTAUTH_URL||'http://localhost:3000'}/verify?token=${raw}&purpose=${purpose}`;
  if(process.env.BREVO_API_KEY){
    requireValue(process.env.MAIL_FROM,'Email sender is not configured.',503);
    const response=await fetch('https://api.brevo.com/v3/smtp/email',{method:'POST',headers:{'Content-Type':'application/json','api-key':process.env.BREVO_API_KEY},body:JSON.stringify({sender:{name:'GoGreen UAE',email:process.env.MAIL_FROM},to:[{email}],subject:purpose==='GUARDIAN'?'Approve a GoGreen UAE child account':'Your GoGreen UAE secure link',textContent:`${purpose==='GUARDIAN'?'Only approve if you are the parent or guardian. Child accounts cannot join public groups or claim cleanups.\n':''}Open this one-use link within 24 hours: ${url}\nIf you did not request this, ignore this message.`}),signal:AbortSignal.timeout(15000)});
    requireValue(response.ok,'Email delivery is temporarily unavailable. Please request a new link later.',503);return;
  }
  if(process.env.SMTP_HOST){const transport=nodemailer.createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT||587),secure:process.env.SMTP_PORT==='465',auth:process.env.SMTP_USER?{user:process.env.SMTP_USER,pass:process.env.SMTP_PASSWORD}:undefined});await transport.sendMail({from:process.env.MAIL_FROM,to:email,subject:purpose==='GUARDIAN'?'Approve a GoGreen UAE child account':'Your GoGreen UAE secure link',text:`${purpose==='GUARDIAN'?'A child account has requested your approval. Only approve if you are their parent or guardian. Child accounts cannot join public groups or claim cleanups.':''}\nOpen this one-use link within 24 hours: ${url}\nIf you did not request this, ignore this message.`});return;}
  requireValue(process.env.NODE_ENV!=='production','Email delivery is not configured. Contact the platform owner.',503);
  const {mkdir,appendFile}=await import('node:fs/promises');await mkdir('.local',{recursive:true});await appendFile('.local/mail.jsonl',JSON.stringify({email,purpose,url})+'\n');
}
export async function register(input:unknown){
 const data=registerSchema.parse(input);const email=data.email.toLowerCase();await rateLimit(`register:${email}`,3);
 requireValue(process.env.NODE_ENV!=='production'||emailConfigured(),'Registration is not open yet. Email delivery needs to be configured.',503);
 const age=(Date.now()-Date.parse(data.birthDate))/31557600000;
 requireValue(age>=0&&age<=120,'Enter a valid date of birth.');requireValue(data.kind==='CHILD'?age<12:age>=12,'Please choose the account type that matches your age.');
 if(data.kind==='CHILD')requireValue(data.guardianEmail,'A guardian email is required.');
 if(data.kind==='ORGANIZATION_ADMIN')requireValue(age>=18&&data.organizationName,'Organization administrators must be adults and provide an organization name.');
 requireValue(!await db.user.findFirst({where:{OR:[{email},{username:data.username}]}}),'That email or username is already registered.',409);
 const user=await db.user.create({data:{email,passwordHash:await hash(data.password,12),name:data.name,username:data.username,role:data.kind,profile:{create:{emirate:data.emirate,interest:data.interest,onboardingComplete:true}},...(data.kind==='CHILD'?{child:{create:{birthDate:new Date(data.birthDate),guardianEmail:data.guardianEmail!.toLowerCase()}}}:{})}});
 if(data.kind==='ORGANIZATION_ADMIN')await db.organization.create({data:{name:data.organizationName!,description:'',type:'Community organization',emirate:data.emirate,members:{create:{userId:user.id,role:'ADMIN'}}}});
 await deliverToken(user.id,data.kind==='CHILD'?data.guardianEmail!:email,data.kind==='CHILD'?'GUARDIAN':'VERIFY');
 return {message:data.kind==='CHILD'?'Your guardian will receive an approval link.':'Check your email to activate your account.'};
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
export async function requestToken(input:unknown){const data=z.object({email:z.email(),purpose:z.enum(['RESET','VERIFY'])}).parse(input);await rateLimit(`token:${data.email}`,3);const user=await db.user.findUnique({where:{email:data.email.toLowerCase()},include:{child:true}});if(user)await deliverToken(user.id,user.child?.guardianEmail||user.email,user.child&&!user.child.approvedAt?'GUARDIAN':data.purpose);return {message:'If an account matches, a secure link has been sent.'};}
