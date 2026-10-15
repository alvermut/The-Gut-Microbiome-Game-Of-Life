import {World} from './engine.js';
import {relativeAbundances} from './abundance.js';
const $=id=>document.getElementById(id),colors=['#83c98a','#d8b478','#a99bd4','#80bfc7','#c4cd83'],letters='ABCDE';
let world,mode='ready',elapsed=0,last=0,weights=[1,1,1,1,1],runConfig;
let completedRun=null,printToken='',receiptReady=false,printBusy=false,receiptQueued=false;
let interventions={antibiotics:0,probiotics:0,leakyToggles:0};
let participant='';
const value=id=>Number($(id).value);
function buildTypes(){
  $('type-weights').innerHTML=Array.from({length:value('types')},(_,i)=>`<label class="weight-row"><span class="swatch" style="--type:${colors[i]}"></span>Type ${letters[i]}<input aria-label="Type ${letters[i]} weight" data-weight="${i}" type="range" min="0" max="5" value="${weights[i]}"><output>${weights[i]}</output></label>`).join('');
  document.querySelectorAll('[data-weight]').forEach(input=>input.oninput=()=>{weights[+input.dataset.weight]=+input.value;if(!weights.slice(0,value('types')).some(Boolean)){weights[+input.dataset.weight]=1;input.value=1;}input.nextElementSibling.textContent=input.value;reset();});
}
function reset(){
  if(printBusy)return;
  $('participant-dialog').close();participant='';$('participant-name').value='';
  $('print-results').close();completedRun=null;receiptReady=false;receiptQueued=false;
  $('receipt-skip').textContent='[ skip ]';
  interventions={antibiotics:0,probiotics:0,leakyToggles:0};
  mode='ready';elapsed=0;last=0;
  if(!weights.slice(0,value('types')).some(Boolean)){weights[0]=1;buildTypes();}
  runConfig={rule:$('rule').value,types:value('types'),nicheDensity:value('density')/100,initialDensity:value('initial')/100,nutrientFraction:value('nutrients')/100,speed:value('speed'),weights:[...weights]};
  world=new World(runConfig);
  const rule=world.rule;
  document.title='gut microbiome game of life';
  $('field').setAttribute('aria-label',`Circular ${rule.name} ${rule.notation} field representing a horizontal colon section`);
  $('birth-rule').textContent=rule.birth.join(', ');
  $('survival-rule').textContent=rule.survival.join(', ');
  $('death-rule').textContent=Array.from({length:9},(_,i)=>i).filter(n=>!rule.survival.includes(n)).join(', ');
  $('chart').innerHTML=Array.from({length:world.types},(_,i)=>`<div class="chart-row"><div class="chart-label"><span class="swatch" style="--type:${colors[i]}"></span>Type ${letters[i]}<span class="count" id="count-${i}">0</span><b id="pct-${i}">N/A</b></div><div class="bar-track"><div class="bar" id="bar-${i}" style="--type:${colors[i]};width:0"></div></div></div>`).join('');
  update();draw();
}
function update(){
  const total=world.output.reduce((a,b)=>a+b,0);
  $('occupied').textContent=[...world.niches.values()].filter(n=>n.occupied).length;$('free').textContent=[...world.cells.values()].filter(p=>p.kind==='microbe').length;
  const fractions=relativeAbundances(world.output);
  world.output.forEach((n,i)=>{const pct=total?n/total*100:0;$(`count-${i}`).textContent=n;$(`pct-${i}`).textContent=fractions[i]??'N/A';$(`bar-${i}`).style.width=pct+'%';});
  $('generation').textContent='GEN '+String(world.generation).padStart(4,'0');
  $('status').textContent={ready:'Ready',running:'Running',done:'Run complete'}[mode];$('status-dot').className=mode==='running'?'running':'';
  $('start-label').textContent=mode==='running'?'SEQUENCE YOUR GUT MICROBIOME':'START';
  $('start-subtitle').hidden=mode!=='running';
  $('start').disabled=mode==='done'||printBusy;
  $('settings').disabled=mode!=='ready';$('interventions').hidden=mode!=='running';
  document.querySelectorAll('[data-action]').forEach(b=>b.disabled=mode!=='running');
  $('leaky-gut').disabled=mode!=='running';$('leaky-gut').setAttribute('aria-pressed',String(world.leakyGut));
  $('leaky-gut').querySelector('small').textContent=world.leakyGut?'You may pass!':'You shall not pass!';
  $('mucus-rule').textContent=world.leakyGut?'Leaky gut is ON: the mucus survival gradient is disabled.':`Mucus tightens survival across the outer ${world.mucusWidth} squares; leaky gut switches it off.`;
  $('empty-note').hidden=total>0;$('empty-note').textContent=world.snapshots.length?'No free microbes in the latest snapshot.':'Press SEQUENCE to count the microbes present now.';
  $('chart-caption').textContent=mode==='done'?'Final whole-field snapshot. Nutrients excluded.':'Press SEQUENCE to end the run and measure free microbes.';
}
const canvas=$('field'),ctx=canvas.getContext('2d');
function tile(i,type,niche,s){
  const x=i%world.width*s,y=Math.floor(i/world.width)*s,pad=niche?.9:1.8;
  ctx.fillStyle=colors[type];ctx.fillRect(x+pad,y+pad,s-2*pad,s-2*pad);
  ctx.save();ctx.beginPath();ctx.rect(x+pad,y+pad,s-2*pad,s-2*pad);ctx.clip();ctx.strokeStyle='#10211788';ctx.fillStyle='#10211788';ctx.lineWidth=1;
  if(type===1){for(let a=3;a<s;a+=3)for(let b=3;b<s;b+=3)ctx.fillRect(x+a,y+b,1,1);}
  else for(let k=-s;k<2*s;k+=3.5){ctx.beginPath();if(type===2){ctx.moveTo(x,y+k);ctx.lineTo(x+s,y+k);}else{ctx.moveTo(x+k,y);ctx.lineTo(x+k+(type===0?s:type===4?-s:0),y+s);}ctx.stroke();}
  ctx.restore();if(niche){ctx.strokeStyle='#e1f4d6';ctx.lineWidth=1;ctx.strokeRect(x+.5,y+.5,s-1,s-1);}
}
function draw(){
  const w=canvas.clientWidth,dpr=window.devicePixelRatio||1;
  if(canvas.width!==Math.round(w*dpr)){canvas.width=Math.round(w*dpr);canvas.height=canvas.width;}
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,w);const s=w/world.width;
  for(const i of world.active){const x=i%world.width*s,y=Math.floor(i/world.width)*s,level=world.mucusLevels.get(i);ctx.fillStyle=world.clearingZone.has(i)?'#252117':level&&!world.leakyGut?`rgb(${20+level*2} ${37+level*3} ${30+level*2})`:'#111c15';ctx.fillRect(x+.4,y+.4,s-.8,s-.8);}
  for(const [i,n] of world.niches)if(!n.occupied&&!world.cells.has(i)){ctx.strokeStyle='#435748';ctx.setLineDash([1,2]);ctx.strokeRect(i%world.width*s+1,Math.floor(i/world.width)*s+1,s-2,s-2);ctx.setLineDash([]);}
  for(const [i,p] of world.cells)if(p.kind==='microbe')tile(i,p.type,false,s);else{ctx.fillStyle='#b5c7ec';ctx.fillRect(i%world.width*s+1.5,Math.floor(i/world.width)*s+1.5,s-3,s-3);}
  for(const [i,n] of world.niches)if(n.occupied)tile(i,n.type,true,s);
  ctx.beginPath();ctx.arc(w/2,w/2,w/2-.7,0,2*Math.PI);ctx.strokeStyle='#65816b';ctx.lineWidth=1;ctx.stroke();
}
function frame(now){
  if(mode==='running'){
    elapsed+=Math.min(Math.max((now-last)/1000,0),.25);const target=Math.floor(elapsed*runConfig.speed+1e-7),previous=world.generation;
    while(world.generation<target)world.step();
    update();if(previous!==world.generation)draw();
  }
  last=now;requestAnimationFrame(frame);
}
function play(){
  if(mode!=='ready')return;
  if(!participant){
    if(!$('participant-dialog').open)$('participant-dialog').showModal();
    return;
  }
  $('config').open=false;mode='running';last=performance.now();update();
}
$('start').onclick=()=>mode==='running'?sequence():play();
function sequence(){
  if(mode!=='running'||printBusy)return;
  world.sequence();
  finishRun();
  update();draw();
}
$('participant-name').oninput=()=>$('participant-name').setCustomValidity('');
$('participant-form').onsubmit=event=>{
  event.preventDefault();
  const input=$('participant-name'),name=input.value.trim().normalize('NFC');
  if(!name||Array.from(name).length>60||/[\p{C}\u2028\u2029]/u.test(name)){
    input.setCustomValidity('Please enter a name without control characters (maximum 60 characters).');input.reportValidity();return;
  }
  participant=name;$('participant-dialog').close();play();
};
$('participant-cancel').onclick=()=>$('participant-dialog').close();
$('rule').onchange=reset;
$('leaky-gut').onclick=()=>{if(mode!=='running')return;world.leakyGut=!world.leakyGut;interventions.leakyToggles++;update();draw();};
for(const id of ['types','density','initial','nutrients','speed'])$(id).oninput=()=>{if($(id+'-value'))$(id+'-value').textContent=$(id).value+(id==='speed'?' gen/s':id==='types'?'':'%');if(id==='types')buildTypes();reset();};
document.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>{if(mode!=='running')return;world.intervene(b.dataset.action);interventions[b.dataset.action==='antibiotic'?'antibiotics':'probiotics']++;update();draw();});

function makeRunSummary(){
  return Object.freeze({id:crypto.randomUUID(),participant,rule:runConfig.rule,
    generation:world.generation,duration:Math.floor(elapsed),snapshots:world.snapshots.length,
    counts:Object.freeze([...world.output]),leakyGut:world.leakyGut,...interventions});
}
function finishRun(){
  if(mode==='done')return;
  mode='done';
  completedRun=makeRunSummary();
  showResults();
}
async function printAPI(path,data){
  const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json','X-Print-Token':printToken},body:JSON.stringify(data)});
  const result=await response.json();
  if(!response.ok)throw new Error(result.error||'Printer service unavailable.');
  return result;
}
async function showResults(){
  if(!completedRun)return;
  if(!$('print-results').open)$('print-results').showModal();
  $('receipt-print').disabled=!receiptReady||printBusy||receiptQueued;
  if(receiptReady)return;
  const run=completedRun;
  $('receipt-preview').textContent='Preparing your receipt…';
  $('print-status').textContent='Connecting to the local receipt service…';
  $('receipt-retry').hidden=true;
  try{
    const response=await fetch('/api/session');
    if(!response.ok)throw new Error('Start the app with npm start to enable direct printing.');
    const session=await response.json();printToken=session.token;
    const receipt=await printAPI('/api/receipt',run);
    if(completedRun!==run)return;
    $('receipt-preview').textContent=receipt.text;receiptReady=true;
    $('print-status').textContent=`Ready · ${session.printer} · 58 mm paper. Print sends one receipt directly.`;
    $('receipt-print').disabled=false;
  }catch(error){
    if(completedRun!==run)return;
    $('receipt-preview').textContent='Your results remain in the chart. Receipt preview unavailable.';
    $('print-status').textContent=`${error.message} Check the local server, then retry.`;
    $('receipt-retry').hidden=false;
  }
}
$('receipt-retry').onclick=showResults;
$('receipt-skip').onclick=()=>$('print-results').close();
$('print-results').addEventListener('cancel',event=>{if(printBusy)event.preventDefault();});
$('print-results').addEventListener('close',()=>{if(mode==='done'&&!printBusy)reset();});
$('receipt-print').onclick=async()=>{
  if(!completedRun||!receiptReady||receiptQueued||printBusy)return;
  printBusy=true;$('receipt-print').disabled=true;$('receipt-skip').disabled=true;
  $('print-status').textContent='Sending receipt to the printer…';
  try{
    const result=await printAPI('/api/print',completedRun);
    receiptQueued=true;
    $('print-status').textContent=`Queued for ${result.printer}. ${result.message} If no paper appears, check the printer and Linux print queue.`;
  }catch(error){
    $('print-status').textContent=`${error.message} You can retry; the server prevents duplicate submissions for this run.`;
  }finally{
    printBusy=false;$('receipt-print').disabled=receiptQueued;$('receipt-skip').disabled=false;
    $('receipt-skip').textContent=receiptQueued?'[ close ]':'[ skip ]';
  }
};
window.addEventListener('resize',draw);buildTypes();reset();requestAnimationFrame(frame);
