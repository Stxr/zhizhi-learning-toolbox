import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
export const dataRoot=path.resolve(process.env.LEARNING_DATA_DIR||'.local/data');
export class Store{
  data={version:1,settings:{organizeModel:'gpt-6-luna',visionModel:'gpt-6-luna',chatModel:'gpt-6-luna',gradeModel:'gpt-6-luna',autoOrganize:true,language:'auto',asrEngine:'qwen3'},lessons:[],messages:[],branches:[],attempts:[],calls:[]};
  queue=Promise.resolve();
  constructor(root=dataRoot){this.root=root;this.file=path.join(root,'state.json')}
  async init(){await fs.mkdir(this.root,{recursive:true});try{this.data=JSON.parse(await fs.readFile(this.file,'utf8'))}catch(e){if(e.code!=='ENOENT')throw new Error('持久化文件损坏，请保留文件并从备份恢复');await this.save()}return this;}
  async save(){const snapshot=JSON.stringify(this.data,null,2);this.queue=this.queue.then(async()=>{const temp=this.file+'.'+randomUUID()+'.tmp';await fs.writeFile(temp,snapshot,{mode:0o600});await fs.rename(temp,this.file)});return this.queue;}
  lesson(id){const l=this.data.lessons.find(x=>x.id===id);if(!l)throw new Error('课程不存在');return l}
  async seed(){if(this.data.lessons.some(l=>l.id==='sample'))return;const segments=[{id:'s1',start:0,end:9,text:'主动回忆是合上书，尝试从记忆中解释概念。重新阅读只能让材料变得熟悉。'},{id:'s2',start:9,end:19,text:'间隔复习把练习分散到不同日期，让遗忘后的提取更有挑战。答错后要回到对应内容补学。'},{id:'s3',start:19,end:29,text:'检验理解，需要解释概念、解决新的情境题，并展示实际答案证据。一次分数不等于真正掌握的概率。'}];
    const chapters=[{id:'c1',title:'把熟悉变成可提取的知识',start:0,end:29,summary:'主动回忆让你从记忆中生成答案；间隔复习安排下一次提取。把解释、迁移和作答证据结合起来，才能发现需要补学的地方。',sourceIds:['s1','s2','s3'],concepts:[{term:'主动回忆',explanation:'不看材料，从记忆中解释或作答，再核对遗漏。',example:'合上笔记，解释为什么重读带来的熟悉感不一定能用于考试。'},{term:'间隔复习',explanation:'把多次提取分散到不同日期，而非一次反复阅读。',example:'今天练习后，明天、三天后、一周后再次回忆，并根据错题调整。'}],flow:['合上材料','尝试解释或作答','核对证据','定位错题并补学','间隔后再次提取'],comparison:[{label:'学习动作',a:'重读：看材料',b:'回忆：生成答案'},{label:'反馈来源',a:'感觉熟悉',b:'遗漏与答题证据'}],quiz:[{id:'q1',type:'choice',prompt:'哪种动作最符合主动回忆？',options:['连续重读三遍','合上笔记解释概念，再核对','只给重点划线'],answer:'合上笔记解释概念，再核对',rubric:[{id:'r1',point:'识别主动提取动作',weight:30}],sourceIds:['s1']},{id:'q2',type:'concept',prompt:'用自己的话解释主动回忆，说明为什么它有助于发现遗漏。',options:[],answer:'合上资料从记忆中解释，再核对发现遗漏。',rubric:[{id:'r2',point:'说明不看资料，从记忆中生成答案',weight:20},{id:'r3',point:'说明核对答案以发现遗漏',weight:15}],sourceIds:['s1','s3']},{id:'q3',type:'transfer',prompt:'你要在一周后解释一个新算法。写出包含主动回忆、间隔和错题反馈的练习安排。',options:[],answer:'今天合上笔记讲解，明天和三天后复述，一周后再测；核对错题并回看原资料。',rubric:[{id:'r4',point:'安排不看资料的解释练习',weight:15},{id:'r5',point:'安排跨日期的间隔练习',weight:10},{id:'r6',point:'根据遗漏核对并补学',weight:10}],sourceIds:['s2','s3']}]}];
    this.data.lessons.push({id:'sample',title:'主动回忆与间隔复习',kind:'sample',status:'ready',progress:100,stage:'明确标注的样例课程',createdAt:new Date().toISOString(),duration:29,segments,frames:[],course:{title:'主动回忆与间隔复习',overview:'这是自建样例课程，用于立即体验章节、树状问答和小测。内容不是从用户视频抽取的。',chapters}});
    this.data.messages.push({id:'sample-root',lessonId:'sample',parentId:null,role:'assistant',content:'欢迎来到枝知。先读这一章，再试着合上材料解释概念。每一条消息都能 Fork，分支会继承此前上下文。',sourceIds:['s1'],createdAt:new Date().toISOString(),origin:'sample'});
    this.data.branches.push({id:'sample-main',lessonId:'sample',name:'主线',tipId:'sample-root',forkId:null,parentBranchId:null});await this.save();
  }
}
