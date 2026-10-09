try{process.loadEnvFile('.env')}catch(e){if(e.code!=='ENOENT')throw e}
import {spawn} from 'node:child_process';
const children=[spawn(process.execPath,['server/index.mjs'],{stdio:'inherit'}),spawn(process.execPath,['node_modules/vite/bin/vite.js'],{stdio:'inherit'})];
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{children.forEach(p=>p.kill('SIGTERM'));process.exit(0)});
children.forEach(p=>p.on('exit',code=>{children.forEach(other=>other.kill());process.exit(code||0)}));
