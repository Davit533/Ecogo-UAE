import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';

import {db} from '../../src/lib/db';
const base='http://localhost:3000';
class Client{
 cookies=new Map<string,string>();
 async request(path:string,body?:unknown){const headers:Record<string,string>={Origin:base,Cookie:[...this.cookies].map(([k,v])=>`${k}=${v}`).join('; ')};if(body!==undefined&&!(body instanceof FormData))headers['Content-Type']='application/json';const response=await fetch(`${base}${path}`,{method:body===undefined?'GET':'POST',headers,body:body===undefined?undefined:body instanceof FormData?body:JSON.stringify(body),redirect:'manual'});for(const cookie of response.headers.getSetCookie()){const pair=cookie.split(';')[0];const index=pair.indexOf('=');this.cookies.set(pair.slice(0,index),pair.slice(index+1));}const text=await response.text();let result;try{result=JSON.parse(text);}catch{result={text};}return {status:response.status,data:result};}
 async login(email:string){const csrf=await this.request('/api/auth/csrf');const response=await fetch(`${base}/api/auth/callback/credentials`,{method:'POST',headers:{Origin:base,Cookie:[...this.cookies].map(([k,v])=>`${k}=${v}`).join('; '),'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({csrfToken:csrf.data.csrfToken,email,password:'GoGreen-demo-2026!',json:'true',callbackUrl:`${base}/home`}),redirect:'manual'});for(const cookie of response.headers.getSetCookie()){const pair=cookie.split(';')[0];const index=pair.indexOf('=');this.cookies.set(pair.slice(0,index),pair.slice(index+1));}assert.equal((await this.request('/api/v1/me')).status,200);}
}
test('complete account → report → independent moderation → cleanup → points → reward journey',async()=>{
 const unique=Date.now();const reporter=new Client();const cleaner=new Client();const owner=new Client();
 async function signup(client:Client,name:string){const email=`${name}-${unique}@example.test`;const response=await client.request('/api/v1/accounts/register',{email,password:'GoGreen-demo-2026!',name,username:`${name}${unique}`,kind:'VOLUNTEER',birthDate:'2000-01-01',emirate:'Dubai',interest:'BOTH'});assert.equal(response.status,200,JSON.stringify(response.data));assert.match(response.data.recoveryCode,/^[a-f0-9]{64}$/);await client.login(email);return email;}
 await signup(reporter,'sara');const guardianEmail=await signup(cleaner,'omar');await owner.login('david@example.test');
 assert.equal((await reporter.request('/api/v1/admin/users')).status,403);
 const reporterMe=(await reporter.request('/api/v1/me')).data;const cleanerMe=(await cleaner.request('/api/v1/me')).data;
 async function photo(client:Client,color:string){const bytes=await sharp({create:{width:500,height:350,channels:3,background:color}}).png().toBuffer();const form=new FormData();form.set('file',new File([new Uint8Array(bytes)],'test-evidence.png',{type:'image/png'}));const r=await client.request('/api/v1/uploads',form);assert.equal(r.status,200,JSON.stringify(r.data));return r.data.id;}
 const before=await photo(reporter,`#${(unique%0xffffff).toString(16).padStart(6,'0')}`);const longitude=53+Math.random()*.2;
 const report=await reporter.request('/api/v1/reports',{title:'Integration test report',description:'Test evidence for the verified environmental workflow.',category:'Plastic',severity:3,latitude:23.5+Math.random()*.2,longitude,address:'Local test park',emirate:'Dubai',photoId:before});assert.equal(report.status,200,JSON.stringify(report.data));const id=report.data.id;
 const pending=await db.trashReport.findUniqueOrThrow({where:{id}});assert.equal(pending.status,'PENDING_REVIEW');assert.equal((await db.profile.findUniqueOrThrow({where:{userId:reporterMe.id}})).balance,0);
 assert.equal((await cleaner.request(`/api/v1/reports/${id}/claim`,{})).status,409);
 const approved=await owner.request('/api/v1/admin/reports',{id,decision:'APPROVE',reason:'Test evidence independently reviewed.'});assert.equal(approved.status,200,JSON.stringify(approved.data));assert.equal((await owner.request('/api/v1/admin/reports',{id,decision:'APPROVE',reason:'Duplicate approval attempt.'})).status,409);
 const claim=await cleaner.request(`/api/v1/reports/${id}/claim`,{});assert.equal(claim.status,200,JSON.stringify(claim.data));assert.equal((await reporter.request(`/api/v1/reports/${id}/claim`,{})).status,409);
 const after=await photo(cleaner,`#${((unique+9999)%0xffffff).toString(16).padStart(6,'0')}`);const proof=await cleaner.request(`/api/v1/cleanups/${claim.data.id}/proof`,{afterPhotoId:after,notes:'Test cleanup evidence',safe:true});assert.equal(proof.status,200,JSON.stringify(proof.data));assert.equal((await db.profile.findUniqueOrThrow({where:{userId:cleanerMe.id}})).balance,0);
 const verification=await owner.request('/api/v1/admin/cleanups',{id:claim.data.id,approve:true,reason:'Test before and after evidence reviewed.'});assert.equal(verification.status,200,JSON.stringify(verification.data));const profile=await db.profile.findUniqueOrThrow({where:{userId:cleanerMe.id}});assert.equal(profile.balance,50);assert.equal(profile.currentStreak,1);assert.ok(await db.userAchievement.findUnique({where:{userId_achievementId:{userId:cleanerMe.id,achievementId:'cleanup-hero'}}}));
 const requestKey=crypto.randomUUID();const redeemed=await cleaner.request('/api/v1/rewards/demo-reward',{requestKey});assert.equal(redeemed.status,200,JSON.stringify(redeemed.data));const retry=await cleaner.request('/api/v1/rewards/demo-reward',{requestKey});assert.equal(retry.data.code,redeemed.data.code);assert.equal((await db.profile.findUniqueOrThrow({where:{userId:cleanerMe.id}})).balance,20);assert.equal((await cleaner.request('/api/v1/rewards/demo-reward',{requestKey:crypto.randomUUID()})).status,400);
 const child=new Client();await child.login('explorer@example.test');assert.equal((await child.request('/api/v1/reports')).status,403);assert.equal((await child.request('/api/v1/groups')).status,403);assert.equal((await child.request('/api/v1/admin')).status,403);assert.equal((await child.request('/api/v1/lessons')).status,200);
 const csrf=await fetch(`${base}/api/v1/reports`,{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://attacker.invalid'},body:'{}'});assert.equal(csrf.status,403);
 const harmful=new FormData();harmful.set('file',new File(['<script>alert(1)</script>'],'bad.png',{type:'image/png'}));assert.notEqual((await reporter.request('/api/v1/uploads',harmful)).status,200);
 const young=new Client();const youngEmail=`child-${unique}@example.test`;
 const registeredChild=await young.request('/api/v1/accounts/register',{email:youngEmail,password:'GoGreen-demo-2026!',name:'Young Explorer',username:`child${unique}`,kind:'CHILD',birthDate:'2018-01-01',emirate:'Dubai',guardianEmail});assert.equal(registeredChild.status,200);
 const childId=(await db.user.findUniqueOrThrow({where:{email:youngEmail}})).id;
 assert.ok((await cleaner.request('/api/v1/guardian')).data.some((c:{userId:string})=>c.userId===childId));
 assert.equal((await owner.request('/api/v1/guardian',{userId:childId,consent:true,birthDate:'1990-01-01'})).status,403);
 assert.equal((await cleaner.request('/api/v1/guardian',{userId:childId,consent:true,birthDate:'2015-01-01'})).status,403);
 assert.equal((await cleaner.request('/api/v1/guardian',{userId:childId,consent:true,birthDate:'1990-01-01'})).status,200);await young.login(youngEmail);
 const recovery=(await cleaner.request('/api/v1/recovery-code',{})).data.code;
 assert.equal((await young.request('/api/v1/accounts/recover',{email:youngEmail,code:recovery,password:'GoGreen-demo-2026!'})).status,400);
 assert.equal((await cleaner.request('/api/v1/accounts/recover',{email:guardianEmail,code:recovery,password:'GoGreen-demo-2026!'})).status,200);
 assert.equal((await cleaner.request('/api/v1/me')).status,401);
 assert.equal((await cleaner.request('/api/v1/accounts/recover',{email:guardianEmail,code:recovery,password:'GoGreen-demo-2026!'})).status,400);await cleaner.login(guardianEmail);

 // Report ownership, edits, private property routing, and safe local AI.
 const hotel=await db.organization.create({data:{name:'Integration hotel '+unique,type:'HOTEL',description:'Test managed property',emirate:'Dubai',status:'VERIFIED',members:{create:{userId:cleanerMe.id,role:'ADMIN'}}}});
 const hotelLat=24.1+Math.random()*.2,hotelLng=54.4;
 const hotelPlace=await db.place.create({data:{organizationId:hotel.id,name:'Hotel garden',address:'Test hotel grounds',latitude:hotelLat,longitude:hotelLng,radiusMeters:80,proofId:before,status:'PENDING'}});
 const hotelPhoto=await photo(reporter,'#'+((unique+30000)%0xffffff).toString(16).padStart(6,'0'));
 const payload={title:'Bottles in hotel garden',description:'Several bottles on the garden path near the hotel entrance.',category:'Bottles',severity:2,latitude:hotelLat,longitude:hotelLng,address:'Test hotel garden',emirate:'Dubai',photoId:hotelPhoto};
 const hr=await reporter.request('/api/v1/reports',payload);assert.equal(hr.status,200,JSON.stringify(hr.data));const hotelReport=hr.data.id;
 assert.equal((await cleaner.request('/api/v1/reports/'+hotelReport)).status,403);
 assert.equal((await owner.request('/api/v1/admin/places',{id:hotelPlace.id,status:'APPROVED'})).status,200);
 assert.equal((await db.trashReport.findUniqueOrThrow({where:{id:hotelReport}})).placeId,hotelPlace.id);
 const hotelPage=(await cleaner.request('/api/v1/organizations/'+hotel.id)).data;assert.ok(hotelPage.places[0].reports.some((r:{id:string})=>r.id===hotelReport));
 assert.equal((await cleaner.request('/api/v1/reports/'+hotelReport)).status,200);
 assert.equal((await reporter.request('/api/v1/organizations/'+hotel.id)).data.places[0].reports.length,0);
 assert.equal((await cleaner.request('/api/v1/reports/'+hotelReport+'/edit',payload)).status,403);
 assert.equal((await cleaner.request('/api/v1/reports/'+hotelReport+'/delete',{})).status,403);
 const ai=await reporter.request('/api/v1/ai/assist',{photoId:hotelPhoto});assert.equal(ai.status,200,JSON.stringify(ai.data));assert.ok(ai.data.observations.length>0);
 assert.equal((await cleaner.request('/api/v1/ai/assist',{photoId:hotelPhoto})).status,400);
 await owner.request('/api/v1/admin/reports',{id:hotelReport,decision:'APPROVE',reason:'Independent hotel evidence check'});
 const balanceBefore=(await db.profile.findUniqueOrThrow({where:{userId:reporterMe.id}})).balance;
 assert.equal((await reporter.request('/api/v1/reports/'+hotelReport+'/edit',{...payload,title:'Bottles beside hotel entrance',placeId:hotelPlace.id})).status,200);
 assert.equal((await db.trashReport.findUniqueOrThrow({where:{id:hotelReport}})).status,'PENDING_REVIEW');
 const review=await db.aIReview.findFirstOrThrow({where:{reportId:hotelReport}});assert.equal(review.decision,'REVIEW');assert.equal(review.provider,'Xenova/mobilevit-xx-small');
 await owner.request('/api/v1/admin/reports',{id:hotelReport,decision:'APPROVE',reason:'Updated description independently reviewed'});
 assert.equal((await db.profile.findUniqueOrThrow({where:{userId:reporterMe.id}})).balance,balanceBefore);
 assert.equal((await reporter.request('/api/v1/reports/'+hotelReport+'/claim',{})).status,403);
 const hotelClaim=await cleaner.request('/api/v1/reports/'+hotelReport+'/claim',{});assert.equal(hotelClaim.status,200,JSON.stringify(hotelClaim.data));
 assert.equal((await reporter.request('/api/v1/reports/'+hotelReport+'/edit',payload)).status,409);
 assert.equal((await reporter.request('/api/v1/reports/'+hotelReport+'/delete',{})).status,409);
 assert.equal((await cleaner.request('/api/v1/cleanups/'+hotelClaim.data.id+'/cancel',{})).status,200);
 const search=(await reporter.request('/api/v1/reports?q=hotel%20entrance')).data;assert.ok(search.some((r:{id:string})=>r.id===hotelReport));
 assert.ok((await reporter.request('/api/v1/reports?mine=true')).data.some((r:{id:string})=>r.id===hotelReport));
 assert.equal((await reporter.request('/api/v1/reports/'+hotelReport+'/delete',{})).status,200);
 assert.equal((await cleaner.request('/api/v1/reports/'+hotelReport+'/claim',{})).status,409);
 assert.ok(!(await reporter.request('/api/v1/reports?mine=true')).data.some((r:{id:string})=>r.id===hotelReport));
 assert.equal((await cleaner.request('/api/v1/reports/'+hotelReport)).status,403);
 await db.$disconnect();
});
