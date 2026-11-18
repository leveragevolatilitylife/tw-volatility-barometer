import {ds,IND,risks,barometer,signalFromB,dailyRets,statsFromRets,E} from './lib.mjs';
const R=risks(1000);
const first=(a)=>a.findIndex(x=>!isNaN(x));
const st=Math.max(...R.map(first));console.log('共同起點',ds.dates[st],'樣本天數',ds.n-st);
const idx=[];for(let i=st;i<ds.n;i++)idx.push(i);
const w0=IND.map(()=>1);
const {b}=barometer(R,w0);
function runBear(sig,bear){const r=E.runBacktest(ds,sig,'00631L',bear,{commissionRate:0.1425,taxRate:0.1});return r;}
function line(r){const rr=dailyRets(r);const s=statsFromRets(rr,idx);let sw=0;for(const i of idx.slice(1))if(r.appliedAsset[i]!==r.appliedAsset[i-1])sw++;return `${(s.cagr*100).toFixed(1)}% / Sh ${s.sharpe.toFixed(2)} / MDD ${(s.maxDD*100).toFixed(0)}% / sw ${sw}`;}
for(const bear of ['00635U','CASH','0050']){
  console.log('\n--- 等權 barometer，空方=',bear);
  for(const th of [0.5,0.6,0.7,0.8,0.85,0.9,0.95]) console.log(' θ',th,line(runBear(signalFromB(b,th),bear)));
}
const bh=a=>{const e=[1];for(const i of idx)e.push(e[e.length-1]*(1+ds.returns[a][i]));const s=E.computeStats(e,0,1.5);return `${(s.cagr*100).toFixed(1)}% / Sh ${s.sharpe.toFixed(2)} / MDD ${(s.maxDD*100).toFixed(0)}%`;};
console.log('\nB&H 00631L',bh('00631L'),'| 0050',bh('0050'));
// 參考：現有 Hybrid / Roll Yield 策略同窗
import fs from 'fs';
