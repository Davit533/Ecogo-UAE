import {prepareModel} from '../src/server/image-model';
prepareModel().then(()=>console.log('Free image AI model cached for deployment.')).catch(error=>{console.error(error);process.exitCode=1;});
