import {ds,IND,risks,barometer,dailyRets,statsFromRets,E} from './lib.mjs';
import fs from 'fs';
const R=risks(1000);const first=a=>a.findIndex(x=>!isNaN(x));
const st=Math.max(...R.map(first));const idx=[];for(let i=st+1;i<ds.n;i++)idx.push(i);
let seed=7;const rnd=()=>{seed=(seed*1664525+1013904223)%4294967296;return seed/4294967296;};
const K=IND.length;
// 權重候選：等權、單一、去一、兩組(期限結構/水準/趨勢)、300 組 Dirichlet(1)
const W=[{n:'equal',w:IND.map(()=>1)}];
IND.forEach((m,k)=>W.push({n:'only_'+m.k,w:IND.map((_,j)=>j===k?1:0)}));
IND.forEach((m,k)=>W.push({n:'drop_'+m.k,w:IND.map((_,j)=>j===k?0:1)}));
for(let i=0;i<300;i++){const g=IND.map(()=>-Math.log(1-rnd()));const s=g.reduce((a,c)=>a+c,0);W.push({n:'dir'+i,w:g.map(x=>x/s)});}
const TH=[[0.6,1.01],[0.7,1.01],[0.8,1.01],[0.85,1.01],[0.9,1.01],[0.7,0.95],[0.8,0.95],[0.85,0.95]];
const sig3=(b,t1,t2)=>b.map(v=>isNaN(v)?null:(v>=t2?'BULL':(v>=t1?'BEAR':'BULL')));
const trials=[];const rets=[];
for(const w of W){const {b}=barometer(R,w.w);for(const [t1,t2] of TH){const r=E.runBacktest(ds,sig3(b,t1,t2),'00631L','00635U',{commissionRate:0.1425,taxRate:0.1});const rr=dailyRets(r);trials.push({w:w.n,wv:w.w,t1,t2});rets.push(idx.map(i=>rr[i]));}}
const N=trials.length,T=idx.length;console.log('試驗數',N,'天數',T);
const sharpe=(a)=>{const m=a.reduce((x,y)=>x+y,0)/a.length;const sd=Math.sqrt(a.reduce((x,y)=>x+(y-m)**2,0)/a.length);return sd>0?m/sd*Math.sqrt(252):-9;};
const full=rets.map(sharpe);
const bh=idx.map(i=>ds.returns['00631L'][i]);console.log('B&H 00631L Sharpe(日報酬年化,無rf)',sharpe(bh).toFixed(2),'| 試驗中位',[...full].sort((a,b)=>a-b)[N>>1].toFixed(2),'最大',Math.max(...full).toFixed(2),'勝過B&H的試驗比例',(full.filter(x=>x>sharpe(bh)).length/N*100).toFixed(1)+'%');
const top=[...full.keys()].sort((a,b)=>full[b]-full[a]).slice(0,5);top.forEach(i=>console.log(' 前段',trials[i].w,trials[i].t1,trials[i].t2,full[i].toFixed(2)));
const eqk=trials.findIndex(t=>t.w==='equal'&&t.t1===0.85&&t.t2===1.01);console.log('等權 θ0.85 Sharpe',full[eqk].toFixed(2));
// CSCV PBO, S=10 blocks
const S=10,bl=Math.floor(T/S);const blocks=[...Array(S).keys()];
function combos(a,k){const out=[];(function f(s,c){if(c.length===k){out.push(c.slice());return;}for(let i=s;i<a.length;i++){c.push(a[i]);f(i+1,c);c.pop();}})(0,[]);return out;}
const cs=combos(blocks,S/2);let below=0,logit=[];
for(const c of cs){const IS=new Set(c);const sIS=[],sOS=[];
 for(let n=0;n<N;n++){const a=[],o=[];for(let b2=0;b2<S;b2++){const seg=rets[n].slice(b2*bl,(b2+1)*bl);(IS.has(b2)?a:o).push(...seg);}sIS.push(sharpe(a));sOS.push(sharpe(o));}
 let best=0;for(let n=1;n<N;n++)if(sIS[n]>sIS[best])best=n;
 const rank=sOS.filter(x=>x<=sOS[best]).length/N;if(rank<0.5)below++;logit.push(Math.log(rank/(1-rank+1e-9)));}
console.log('PBO (CSCV, S=10, 試驗='+N+')',(below/cs.length*100).toFixed(1)+'%');
// Walk-forward（逐年）：每年用過去資料選 Sharpe 最高的試驗，套用於下一年
const yr=i=>+ds.dates[idx[i]].slice(0,4);const years=[...new Set(idx.map((_,i)=>yr(i)))];
const wf=[];const picks={};
for(const Y of years){if(Y<2019)continue;const tr=[],te=[];idx.forEach((_,i)=>{(yr(i)<Y?tr:yr(i)===Y?te:[]).push(i);});if(!te.length)continue;
 let best=0,bs=-9;for(let n=0;n<N;n++){const s=sharpe(tr.map(i=>rets[n][i]));if(s>bs){bs=s;best=n;}}
 picks[Y]=trials[best].w+'/'+trials[best].t1+'/'+trials[best].t2;te.forEach(i=>wf.push(rets[best][i]));}
const wfIdx=idx.map((_,i)=>i).filter(i=>yr(i)>=2019);
console.log('WF(2019–) Sharpe',sharpe(wf).toFixed(2),'| B&H同期',sharpe(wfIdx.map(i=>bh[i])).toFixed(2),'| 等權θ0.85同期',sharpe(wfIdx.map(i=>rets[eqk][i])).toFixed(2));
console.log(JSON.stringify(picks));
fs.writeFileSync('r4_out.json',JSON.stringify({N,T,top:top.map(i=>trials[i])}));
