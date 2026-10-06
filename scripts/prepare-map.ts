import {mkdirSync,copyFileSync} from 'node:fs';
mkdirSync('public/maplibre',{recursive:true});
for(const file of ['maplibre-gl-worker.mjs','maplibre-gl-shared.mjs','LICENSE.txt'])copyFileSync(`node_modules/maplibre-gl/${file==='LICENSE.txt'?file:'dist/'+file}`,`public/maplibre/${file}`);
