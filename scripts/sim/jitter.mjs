import { createPointSmoother, PRESETS } from '../../src/gaze/smoothing.js';
import { createTargeter, createDwell } from '../../src/gaze/select.js';
const R=[[32,104,292,204],[32,240,292,340],[32,376,292,476],[32,512,292,612],[32,648,292,748],[332,104,639,404],[679,104,987,404],[1027,104,1334,404],[332,444,639,744],[679,444,987,744],[1027,444,1334,744]];
const rects=R.map((r,i)=>({el:{id:i,isConnected:true,dataset:{},getBoundingClientRect:()=>({left:r[0],top:r[1],right:r[2],bottom:r[3]})},left:r[0],top:r[1],right:r[2],bottom:r[3]}));
let seed=1;const rnd=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296};
const g=()=>Math.sqrt(-2*Math.log(rnd()+1e-9))*Math.cos(2*Math.PI*rnd());
export function run({snap=150,margin=60,preset=PRESETS.head,sigma=50,attempts=20,trials=50}){
  let wrong=0,timeout=0,total=0,times=[];
  for(let t=0;t<trials;t++){
    const sm=createPointSmoother(preset),tg=createTargeter({snap,margin}),dw=createDwell();
    let now=0,cur=rects[5],mouse={x:(cur.left+cur.right)/2,y:(cur.top+cur.bottom)/2};
    for(let a=0;a<attempts;a++){
      let want;do{want=rects[Math.floor(rnd()*rects.length)]}while(want===cur);
      const from={...mouse},to={x:(want.left+want.right)/2,y:(want.top+want.bottom)/2};
      let fired=null,t0=now;
      for(let i=0;now-t0<8000&&!fired;i++){
        now+=33;const k=Math.min((now-t0)/400,1);
        mouse={x:from.x+(to.x-from.x)*k,y:from.y+(to.y-from.y)*k};
        const out=rnd()<0.05;
        const p=sm.filter(mouse.x+g()*sigma+(out?(rnd()-.5)*500:0),mouse.y+g()*sigma+(out?(rnd()-.5)*500:0),now);
        const target=tg.update(p,rects,now);
        const r=dw.update(target,now,()=>1200);
        if(r.fired)fired=r.fired;
      }
      total++;
      if(!fired)timeout++;else{ if(fired!==want.el)wrong++;else times.push(now-t0);}
      cur=want;
    }
  }
  const per20=(n)=>(n/total*20).toFixed(2);
  return {wrongPer20:per20(wrong),timeoutPer20:per20(timeout),medianMs:times.sort((a,b)=>a-b)[times.length>>1]};
}
if(process.argv[1].endsWith('jitter.mjs')){
 console.log('baseline',run({}));
}
