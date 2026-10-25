import { createApp } from './app.js';
import { readConfig } from './config.js';
const config=readConfig();
const app=await createApp({config});
await app.listen({port:config.port,host:config.host});
console.log(`へんかんデスク: ${config.publicOrigin}`);
for(const signal of ['SIGINT','SIGTERM'] as const)process.once(signal,()=>{void app.close();});
