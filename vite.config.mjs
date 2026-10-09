import {defineConfig,loadEnv} from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig(({mode})=>{
 const env={...loadEnv(mode,process.cwd(),''),...process.env};
 const port=Number(env.VITE_PORT||5187),backendPort=Number(env.PORT||4387);
 if(![port,backendPort].every(n=>Number.isInteger(n)&&n>0&&n<65536))throw new Error('本地端口配置无效');
 return {plugins:[react()],server:{host:'127.0.0.1',port,strictPort:true,watch:{ignored:['**/.local/**','**/media/**']},fs:{deny:['**/.local/**','**/media/**','**/.git/**','**/.env*']},proxy:{'/api':'http://127.0.0.1:'+backendPort,'/media':'http://127.0.0.1:'+backendPort}},build:{outDir:'dist'}};
});
