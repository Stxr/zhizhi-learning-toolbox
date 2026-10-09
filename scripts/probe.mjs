import {codex} from '../server/codex.mjs';
try{const s=await codex.status();console.log(JSON.stringify(s,null,2));}finally{codex.close()}
