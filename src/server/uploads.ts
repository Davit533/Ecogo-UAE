import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {S3Client,PutObjectCommand,GetObjectCommand} from '@aws-sdk/client-s3';
import {db} from '@/lib/db';
import {requireValue} from './security';
function s3(){return new S3Client({region:process.env.S3_REGION||'auto',endpoint:process.env.S3_ENDPOINT,forcePathStyle:true,credentials:{accessKeyId:process.env.S3_ACCESS_KEY_ID!,secretAccessKey:process.env.S3_SECRET_ACCESS_KEY!}});}
export async function upload(ownerId:string,file:File){
 requireValue(file.size>0&&file.size<=8*1024*1024,'Choose a photo smaller than 8 MB.');requireValue(['image/jpeg','image/png','image/webp'].includes(file.type),'Use a JPG, PNG, or WebP photo.');
 const original=Buffer.from(await file.arrayBuffer());const image=sharp(original,{limitInputPixels:25_000_000,failOn:'error'});const metadata=await image.metadata();requireValue(['jpeg','png','webp'].includes(metadata.format||''),'The file is not a supported image.');requireValue((metadata.width||0)>=100&&(metadata.height||0)>=100,'Your photo must be at least 100 × 100 pixels.');
 const {data,info}=await image.rotate().resize(1600,1600,{fit:'inside',withoutEnlargement:true}).webp({quality:78}).toBuffer({resolveWithObject:true});
 const hash=createHash('sha256').update(data).digest('hex');
 const existing=await db.upload.findFirst({where:{ownerId,hash}});if(existing)return {id:existing.id};
 const storageKey=process.env.S3_BUCKET?`${ownerId}/${hash}.webp`:null;
 if(storageKey)await s3().send(new PutObjectCommand({Bucket:process.env.S3_BUCKET,Key:storageKey,Body:data,ContentType:'image/webp'}));
 const saved=await db.upload.create({data:{ownerId,hash,width:info.width,height:info.height,storageKey,bytes:storageKey?undefined:new Uint8Array(data)}});return {id:saved.id};
}
export async function imageBytes(id:string){const item=await db.upload.findUniqueOrThrow({where:{id}});if(item.bytes)return Buffer.from(item.bytes);const response=await s3().send(new GetObjectCommand({Bucket:process.env.S3_BUCKET,Key:item.storageKey!}));return Buffer.from(await response.Body!.transformToByteArray());}
export async function ownPhoto(ownerId:string,id:string){const photo=await db.upload.findUnique({where:{id}});requireValue(photo?.ownerId===ownerId,'Upload your own photo first.');return photo;}
