import {ds,IND,risks,barometer,dailyRets,statsFromRets,E} from './lib.mjs';
const R=risks(1000);const first=a=>a.findIndex(x=>!isNaN(x));
const st=Math.max(...R.map(first));const idx=[];for(let i=st;i<ds.n;i++)idx.push(i);
export function sig3(b,t1,t2){return b.map(v=>isNaN(v)?null:(v>=t2?'BULL':(v>=t1?'BEAR':'BULL')));}
const line=(sig,bear='00635U')=>{const r=E.runBacktest(ds,sig,'00631L',bear,{commissionRate:0.1425,taxRate:0.1});const rr=dailyRets(r);const s=statsFromRets(rr,idx);let sw=0;for(const i of idx.slice(1))if(r.appliedAsset[i]!==r.appliedAsset[i-1])sw++;return `${(s.cagr*100).toFixed(1)}%/${s.sharpe.toFixed(2)}/${(s.maxDD*100).toFixed(0)}%/${sw}`;};
const {b}=barometer(R,IND.map(()=>1));
console.log('等權 b：欄＝t2（極端壓力轉多）；列＝t1；格＝CAGR/Sharpe/MDD/切換');
const t2s=[0.9,0.95,0.98,1.01];console.log('t1\\t2',t2s.join('\t\t\t'));
for(const t1 of [0.5,0.6,0.7,0.8,0.85])console.log(t1,t2s.map(t2=>line(sig3(b,t1,t2))).join('\t'));
console.log('\n單一 VX30 RollYield 同框架');
const bR=barometer(R,IND.map((m,j)=>m.k==='VX30RollYield'?1:0)).b;
for(const t1 of [0.5,0.7,0.85])console.log(t1,t2s.map(t2=>line(sig3(bR,t1,t2))).join('\t'));
