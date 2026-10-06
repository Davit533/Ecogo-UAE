import path from 'node:path';
import sharp from 'sharp';
import {pipeline,env,RawImage} from '@huggingface/transformers';
export const MODEL='Xenova/mobilevit-xx-small';
env.cacheDir=path.join(process.cwd(),'.local','ai-cache');
env.backends.onnx.logLevel='error';
let classifier:ReturnType<typeof pipeline<'image-classification'>>|undefined;
export function prepareModel(){return classifier??=pipeline('image-classification',MODEL,{dtype:'q8',device:'cpu',session_options:{intraOpNumThreads:1,interOpNumThreads:1}});}
// Serialize inference to stay within the free Render service's memory budget.
let pending:Promise<unknown>=Promise.resolve();
export function classify(bytes:Buffer){
 const next=pending.then(async()=>{const {data,info}=await sharp(bytes).rotate().resize(256,256,{fit:'fill'}).removeAlpha().raw().toBuffer({resolveWithObject:true});const model=await prepareModel();const result=await model(new RawImage(new Uint8ClampedArray(data),info.width,info.height,3),{top_k:3});return result as {label:string;score:number}[];});
 pending=next.catch(()=>undefined);return next;
}
export function photoSuggestion(labels:{label:string;score:number}[]){
 const names=labels.map(x=>x.label).join(', ');let category='General litter';
 if(/bottle|jug/i.test(names))category='Bottles';else if(/can,|tin|beer can/i.test(names))category='Cans';else if(/carton|box|crate/i.test(names))category='Cardboard';else if(/plastic bag/i.test(names))category='Plastic';else if(/paper|envelope|book/i.test(names))category='Paper';
 return {category,title:category==='General litter'?'Litter at this location':`${category} at this location`,description:`Possible ${category.toLowerCase()} at this location. Please describe what you can actually see, the amount of waste, and any nearby hazards.`,observations:labels.map(x=>({label:x.label,confidence:Math.round(x.score*100)})),note:'AI recognizes general objects and can be wrong. Check the photo and edit these suggestions before submitting. It cannot prove litter or cleanup completion.'};
}
