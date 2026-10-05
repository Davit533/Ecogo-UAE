import {PGlite} from '@electric-sql/pglite';
import {PGLiteSocketServer} from '@electric-sql/pglite-socket';
async function main(){const db=await PGlite.create('.local/postgres');const server=new PGLiteSocketServer({db,host:'127.0.0.1',port:5433,maxConnections:10});await server.start();console.log('Local development PostgreSQL listening on 127.0.0.1:5433');process.on('SIGINT',async()=>{await server.stop();await db.close();process.exit(0);});}main();
