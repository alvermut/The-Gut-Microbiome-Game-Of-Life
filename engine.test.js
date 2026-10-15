import test from 'node:test';
import assert from 'node:assert/strict';
import {World} from './engine.js';
const blank=(extra={})=>new World({rule:'conway',size:9,nicheDensity:0,initialDensity:0,random:()=>0,mucusWidth:0,clearanceRadius:0,...extra});
const microbe=type=>({kind:'microbe',type});
const nutrient=()=>({kind:'nutrient',type:-1});
test('Conway births do not change sampled species counts',()=>{
  const w=blank();for(const i of [39,40,41])w.cells.set(i,microbe(0));w.step();assert.deepEqual([...w.cells.keys()],[31,40,49]);assert.deepEqual(w.output,[0,0,0]);w.step();assert.deepEqual([...w.cells.keys()],[39,40,41]);assert.deepEqual(w.output,[0,0,0]);
});
test('a stable block survives without generating new counts',()=>{
  const w=blank();for(const i of [30,31,39,40])w.cells.set(i,microbe(1));w.step();assert.deepEqual([...w.cells.keys()],[30,31,39,40]);assert.deepEqual(w.output,[0,0,0]);
});
test('isolation and overpopulation kill ordinary cells',()=>{
  const w=blank();w.cells.set(40,microbe(0));w.step();assert.equal(w.cells.size,0);for(const i of [30,31,32,39,40,41,48,49,50])w.cells.set(i,microbe(0));w.step();assert(!w.cells.has(40));
});
test('types do not affect Conway survival and birth geometry',()=>{
  const a=blank(),b=blank();[39,40,41].forEach((i,k)=>{a.cells.set(i,microbe(0));b.cells.set(i,k===1?nutrient():microbe(k));});a.step();b.step();assert.deepEqual([...a.cells.keys()],[...b.cells.keys()]);
});
test('births inherit majority type, including nutrient majority',()=>{
  const w=blank();w.cells.set(39,nutrient());w.cells.set(40,nutrient());w.cells.set(41,microbe(1));w.step();assert.equal(w.cells.get(31).kind,'nutrient');assert.deepEqual(w.output,[0,0,0]);
});
test('ties choose only one of the parent types and can select each',()=>{
  for(const r of [0,.4,.9]){const w=blank();w.random=()=>r;assert.equal(w.majority([microbe(0),microbe(1),nutrient()]),[0,1,-1][Math.floor(r*3)]);}
});
test('niches remain alive through isolation and overcrowding',()=>{
  const w=blank();w.niches.set(40,{type:0,occupied:true});w.step();assert(w.living(40));for(const i of w.neighbors(40))w.cells.set(i,microbe(1));w.step();assert.deepEqual(w.niches.get(40),{type:0,occupied:true});assert(!w.cells.has(40));
});
test('niches count as neighbors and contribute their type to births',()=>{
  const w=blank();for(const i of [39,40,41])w.niches.set(i,{type:2,occupied:true});w.step();assert.deepEqual(w.cells.get(31),microbe(2));assert.deepEqual(w.cells.get(49),microbe(2));assert.deepEqual(w.output,[0,0,0]);
});
test('surviving and newly born adjacent nutrients convert exactly once',()=>{
  const w=blank();w.niches.set(40,{type:0,occupied:true});w.cells.set(39,nutrient());w.cells.set(30,nutrient());w.step();for(const i of [30,31,39])assert.deepEqual(w.cells.get(i),microbe(0));assert.deepEqual(w.output,[0,0,0]);
});
test('a nutrient contested by niches becomes just one bacterium',()=>{
  const w=blank();w.niches.set(39,{type:0,occupied:true});w.niches.set(41,{type:1,occupied:true});w.cells.set(40,nutrient());w.step();assert.deepEqual(w.cells.get(40),microbe(0));
});
test('circular boundary excludes corners and does not wrap',()=>{
  const w=blank();assert(!w.mask.has(0));assert(w.mask.has(4));assert(w.mask.has(40));assert(!w.neighbors(4).includes(76));for(const i of w.active)w.cells.set(i,nutrient());w.step();for(const i of w.cells.keys())assert(w.mask.has(i));
});
test('empty worlds stay empty beyond former nutrient pulse generations',()=>{
  for(const rule of ['conway','bacteria']){const w=blank({rule});for(let i=0;i<60;i++)w.step();assert.equal(w.cells.size,0);assert.deepEqual(w.output,[0,0,0]);}
});
test('antibiotics deactivate niches; probiotics restore only vacant niche sites',()=>{
  const w=blank();for(const i of [30,31,39,40])w.niches.set(i,{type:1,occupied:true});assert.deepEqual(w.intervene('antibiotic'),{niches:1,bacteria:0});assert.equal(w.niches.get(30).occupied,false);w.cells.set(30,microbe(0));assert.equal(w.intervene('probiotic').niches,0);w.cells.delete(30);assert.equal(w.intervene('probiotic').niches,1);assert(w.niches.get(30).occupied);assert.deepEqual(w.output,[0,0,0]);
});
test('probiotics add same-type connected blobs without overwriting cells or niches',()=>{
  const w=blank({weights:[0,1,0]});
  const nutrientSite=w.active[0],nicheSite=w.active[1];
  w.cells.set(nutrientSite,nutrient());w.niches.set(nicheSite,{type:0,occupied:true});
  const result=w.intervene('probiotic');
  assert.equal(result.niches,0);assert(result.bacteria>=3&&result.bacteria<=70);
  assert.deepEqual(w.cells.get(nutrientSite),nutrient());
  assert.deepEqual(w.niches.get(nicheSite),{type:0,occupied:true});
  assert.equal([...w.cells.values()].filter(p=>p.kind==='microbe'&&p.type===1).length,result.bacteria);
  assert.deepEqual(w.output,[0,0,0]);
});
test('probiotic shapes are connected and have 3 to 8 microbes',()=>{
  for(const rule of ['conway','bacteria'])for(let size=3;size<=8;size++){
    const w=blank({rule});
    const shape=w.probioticShape(size),points=new Set(shape.map(([x,y])=>`${x},${y}`));
    assert.equal(points.size,size);
    const seen=new Set(),stack=[shape[0]];
    while(stack.length){const [x,y]=stack.pop(),key=`${x},${y}`;if(seen.has(key))continue;seen.add(key);
      for(const [nx,ny] of shape)if(Math.abs(nx-x)<=1&&Math.abs(ny-y)<=1&&!seen.has(`${nx},${ny}`))stack.push([nx,ny]);}
    assert.equal(seen.size,size);
  }
});
test('probiotic dose ranges from 25 to 70 and the blobs can persist under both rules',()=>{
  for(const rule of ['conway','bacteria']){
    const w=new World({rule,size:61,nicheDensity:0,initialDensity:0,mucusWidth:0,clearanceRadius:0,random:()=>0,weights:[0,1,0]});
    assert.equal(w.intervene('probiotic').bacteria,25);
    for(const i of w.cells.keys())assert(w.neighbors(i).some(j=>w.cells.has(j)));
    for(let g=0;g<30;g++)w.step();
    assert(w.cells.size>0);
    assert([...w.cells.values()].every(cell=>cell.kind==='microbe'&&cell.type===1));
    assert.deepEqual(w.output,[0,0,0]);
    const max=new World({rule,size:61,nicheDensity:0,initialDensity:0,mucusWidth:0,clearanceRadius:0,random:()=>.999});
    assert.equal(max.intervene('probiotic').bacteria,70);
  }
});
test('random probiotic doses form separate connected groups of 3 to 8',()=>{
  for(const randomValue of [0,.5,.999]){
    const w=new World({rule:'bacteria',size:61,nicheDensity:0,initialDensity:0,random:()=>randomValue});
    const dose=w.intervene('probiotic').bacteria;
    assert.equal(dose,25+Math.floor(randomValue*46));
    const unseen=new Set(w.cells.keys()),groupSizes=[];
    while(unseen.size){const first=unseen.values().next().value,stack=[first];unseen.delete(first);let size=0;
      while(stack.length){const i=stack.pop();size++;for(const j of w.neighbors(i))if(unseen.delete(j))stack.push(j);}
      groupSizes.push(size);
    }
    assert(groupSizes.every(size=>size>=3&&size<=8));
    assert.equal(groupSizes.reduce((sum,size)=>sum+size,0),dose);
  }
});
test('each probiotic press adds free microbes of a single randomly selected type',()=>{
  let seed=1;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/2**32;};
  const w=new World({rule:'bacteria',size:61,nicheDensity:0,initialDensity:0,random});
  const dose=w.intervene('probiotic').bacteria;
  assert(dose>=25&&dose<=70);
  assert.equal(new Set([...w.cells.values()].map(cell=>cell.type)).size,1);
});
test('an inactive niche is not an immortal live cell',()=>{
  const w=blank();w.niches.set(40,{type:0,occupied:false});assert.equal(w.living(40),undefined);w.cells.set(40,microbe(0));w.step();assert(!w.living(40));
});
test('initial random population does not count as births',()=>{
  const w=blank({initialDensity:1,nutrientFraction:.5,random:()=>.25});assert(w.cells.size>0);assert.deepEqual(w.output,[0,0,0]);
});
test('Bacteria uses exactly B34/S456 for all neighbor counts and ordinary cell types',()=>{
  for(let count=0;count<=8;count++)for(const live of [false,true])for(const cell of [microbe(1),nutrient()]){
    const w=blank({rule:'bacteria'});
    if(live)w.cells.set(40,cell);
    for(const i of w.neighbors(40).slice(0,count))w.cells.set(i,cell);
    w.step();
    assert.equal(w.cells.has(40),(live?[4,5,6]:[3,4]).includes(count),`${cell.kind}, live=${live}, neighbors=${count}`);
  }
});
test('Bacteria niches remain immortal with every neighbor count',()=>{
  for(let count=0;count<=8;count++){
    const w=blank({rule:'bacteria'});w.niches.set(40,{type:0,occupied:true});
    for(const i of w.neighbors(40).slice(0,count))w.cells.set(i,microbe(1));
    w.step();assert(w.niches.get(40).occupied);assert(!w.cells.has(40));
  }
});
test('four-neighbor Bacteria births inherit type without changing sampled counts',()=>{
  const w=blank({rule:'bacteria'});
  for(const i of [30,31,32])w.cells.set(i,microbe(1));w.niches.set(39,{type:0,occupied:true});
  w.step();assert.deepEqual(w.cells.get(40),microbe(1));assert.deepEqual(w.output,[0,0,0]);
  w.cells.clear();const counts=[...w.output];w.step();assert.deepEqual(w.output,counts);
});
test('four-neighbor type ties work for Bacteria births',()=>{
  const w=blank({rule:'bacteria'});
  for(const [i,type] of [[30,0],[31,0],[32,1],[39,1]])w.cells.set(i,microbe(type));
  w.step();assert.deepEqual(w.cells.get(40),microbe(0));
});
test('Bacteria nutrients still convert beside niches and antibiotics deactivate those niches',()=>{
  const w=blank({rule:'bacteria'});w.cells.set(40,nutrient());w.niches.set(39,{type:2,occupied:true});
  for(const i of [30,31,32])w.cells.set(i,microbe(0));
  w.step();assert.deepEqual(w.cells.get(40),microbe(2));assert.deepEqual(w.output,[0,0,0]);
  assert.equal(w.intervene('antibiotic').niches,1);assert.equal(w.niches.get(39).occupied,false);
});
test('antibiotics leave nutrients and sampled history intact',()=>{
  for(const rule of ['conway','bacteria']){
    const w=blank({rule});for(const i of [30,31,39,40])w.niches.set(i,{type:1,occupied:true});
    const sites=w.active.filter(i=>!w.niches.has(i));for(const i of sites.slice(0,8))w.cells.set(i,microbe(i%3));
    w.cells.set(sites[8],nutrient());w.output=[5,8,9];
    assert.deepEqual(w.intervene('antibiotic'),{niches:1,bacteria:7});
    assert.equal([...w.cells.values()].filter(p=>p.kind==='microbe').length,1);assert.deepEqual(w.cells.get(sites[8]),nutrient());assert.deepEqual(w.output,[5,8,9]);
    assert.deepEqual(w.intervene('antibiotic'),{niches:1,bacteria:1});
    assert.equal([...w.cells.values()].filter(p=>p.kind==='microbe').length,0);
  }
});
test('antibiotics round up small populations and handle zero populations',()=>{
  const w=blank();assert.deepEqual(w.intervene('antibiotic'),{niches:0,bacteria:0});
  w.cells.set(40,microbe(1));assert.deepEqual(w.intervene('antibiotic'),{niches:0,bacteria:1});assert.equal(w.cells.size,0);
  assert.throws(()=>w.intervene('prebiotic'),/Unknown intervention/);
});
test('antibiotics remove eighty percent of current free bacteria, rounded up',()=>{
  for(const count of [10,11,20,30]){
    const w=blank();for(const i of w.active.slice(0,count))w.cells.set(i,microbe(i%3));
    assert.equal(w.intervene('antibiotic').bacteria,Math.ceil(count*.8));
    assert.equal(w.cells.size,count-Math.ceil(count*.8));
  }
});
test('Bacteria is the default, Conway remains selectable, and unknown rules are rejected',()=>{
  assert.equal(new World().rule.notation,'B34/S456');assert.equal(blank().rule.notation,'B3/S23');assert.throws(()=>blank({rule:'unknown'}),/Unknown rule/);
});
test('niches initialize only outside the central disk in viable mucus bands',()=>{
  const w=new World({rule:'bacteria',nicheDensity:1,initialDensity:0,random:()=>0});
  assert(w.niches.size>0);assert.equal(w.clearingZone.size,1257);
  for(const i of w.active)assert.equal(w.niches.has(i),w.nicheAllowed(i));
  assert(!w.nicheAllowed(30*61+50));assert(w.nicheAllowed(30*61+51));
  assert(w.nicheAllowed(30*61+57));assert(!w.nicheAllowed(30*61+58));
});
test('mucus progressively lowers the maximum survival count until the range is empty',()=>{
  for(const rule of ['conway','bacteria']){
    const w=new World({rule,nicheDensity:0,initialDensity:0});
    assert.deepEqual(w.survivalCounts(30*61+49),w.rule.survival);
    for(let layer=1;layer<=10;layer++){
      const i=30*61+49+layer,min=w.rule.survival[0],max=w.rule.survival.at(-1)-Math.ceil(layer/4);
      assert.equal(w.mucusLevels.get(i),layer);
      assert.deepEqual(w.survivalCounts(i),Array.from({length:Math.max(0,max-min+1)},(_,k)=>min+k));
    }
    assert.equal(w.mucusLevels.get(30*61+60),10);
  }
});
test('border survival applies to both cell types; leaky gut restores the base rules',()=>{
  for(const rule of ['conway','bacteria'])for(const leaky of [false,true])for(const p of [microbe(1),nutrient()])for(let count=0;count<=8;count++){
    const w=new World({rule,nicheDensity:0,initialDensity:0}),i=30*61+53;
    w.leakyGut=leaky;w.cells.set(i,p);for(const j of w.neighbors(i).slice(0,count))w.cells.set(j,p);
    const min=w.rule.survival[0],max=leaky?w.rule.survival.at(-1):w.rule.survival.at(-1)-1;
    w.step();assert.equal(w.cells.has(i),count>=min&&count<=max,`${rule} leaky=${leaky} ${p.kind} neighbors=${count}`);
  }
});
test('border births require a nonempty local survival range for bacteria and nutrients',()=>{
  for(const rule of ['conway','bacteria'])for(const leaky of [false,true])for(const p of [microbe(0),nutrient()])for(const x of [55,56,57,59])for(let count=0;count<=8;count++){
    const w=new World({rule,nicheDensity:0,initialDensity:0}),i=30*61+x;w.leakyGut=leaky;
    for(const j of w.neighbors(i).slice(0,count))w.cells.set(j,p);
    const expected=w.survivalCounts(i).length>0&&w.rule.birth.includes(count);
    w.step();assert.equal(w.cells.has(i),expected);
  }
});
test('initial bacteria and nutrients cannot appear where mucus blocks all life',()=>{
  for(const rule of ['conway','bacteria'])for(const nutrientFraction of [0,1]){
    const w=new World({rule,nicheDensity:0,initialDensity:1,nutrientFraction,random:()=>0});
    assert(w.cells.size>0);
    for(const i of w.active)assert.equal(w.cells.has(i),w.survivalCounts(i).length>0);
  }
});
test('restoring mucus removes previously permitted border cells on the next generation',()=>{
  for(const p of [microbe(0),nutrient()]){
    const w=new World({rule:'bacteria',nicheDensity:0,initialDensity:0}),i=30*61+59;
    w.leakyGut=true;w.cells.set(i,p);for(const j of w.neighbors(i).slice(0,4))w.cells.set(j,p);
    w.step();assert(w.cells.has(i));w.leakyGut=false;w.step();assert(!w.cells.has(i));
    for(const j of w.cells.keys())assert(w.survivalCounts(j).length>0);
  }
});
test('SEQUENCE counts free microbes across the entire field without clearing cells',()=>{
  const w=new World({rule:'conway',nicheDensity:0,initialDensity:0});
  const center=30*61+30,rim=30*61+50,outer=30*61+56;
  w.cells.set(center,microbe(0));w.cells.set(rim,nutrient());w.cells.set(outer,microbe(1));
  w.niches.set(30*61+52,{type:2,occupied:true});
  assert.equal(w.sequence(),2);assert.deepEqual(w.output,[1,1,0]);
  assert.equal(w.cells.size,3);assert(w.cells.has(center));assert(w.cells.has(rim));assert(w.cells.has(outer));
  assert.deepEqual(w.lastSample,{generation:0,speciesCounts:[1,1,0]});
});
test('leaky gut is reversible and does not permit niches in excluded zones',()=>{
  const w=new World({rule:'conway',nicheDensity:0,initialDensity:0}),border=30*61+59,center=30*61+30;
  const before=w.survivalCounts(border);w.leakyGut=true;assert.deepEqual(w.survivalCounts(border),w.rule.survival);
  w.niches.set(border,{type:0,occupied:false});w.niches.set(center,{type:0,occupied:false});assert.equal(w.intervene('probiotic').niches,0);
  w.leakyGut=false;assert.deepEqual(w.survivalCounts(border),before);
});
test('SEQUENCE replaces the previous snapshot and does not run automatically',()=>{
  for(const leaky of [false,true]){
    const w=new World({rule:'conway',nicheDensity:0,initialDensity:0});w.leakyGut=leaky;
    for(let k=0;k<30;k++)w.step();assert.equal(w.lastSample,null);assert.deepEqual(w.output,[0,0,0]);
    w.cells.set(1860,microbe(0));w.cells.set(1882,microbe(1));
    w.sequence();assert.deepEqual(w.output,[1,1,0]);assert.equal(w.cells.size,2);
    w.cells.clear();w.cells.set(1921,microbe(2));
    for(let k=0;k<30;k++)w.step();assert.deepEqual(w.output,[1,1,0]);
    w.cells.set(1921,microbe(2));w.sequence();assert.deepEqual(w.output,[0,0,1]);
    assert.equal(w.snapshots.length,2);assert.deepEqual(w.snapshots[0].speciesCounts,[1,1,0]);
    assert.deepEqual(w.lastSample,{generation:60,speciesCounts:[0,0,1]});
  }
});
test('empty snapshots replace previous counts with zero',()=>{
  const w=new World({rule:'conway',nicheDensity:0,initialDensity:0});
  w.cells.set(30*61+30,microbe(0));w.sequence();assert.deepEqual(w.output,[1,0,0]);
  w.cells.clear();w.sequence();assert.equal(w.snapshots.length,2);assert.deepEqual(w.output,[0,0,0]);assert.deepEqual(w.lastSample.speciesCounts,[0,0,0]);
});
test('new worlds reset snapshot history and sampling includes the entire field',()=>{
  const w=new World({rule:'conway',nicheDensity:0,initialDensity:0});
  w.cells.set(30*61+50,microbe(2));w.cells.set(30*61+51,microbe(1));w.cells.set(30*61+30,nutrient());
  w.sequence();assert.deepEqual(w.output,[0,1,1]);assert.deepEqual(w.lastSample.speciesCounts,[0,1,1]);
  const fresh=new World({rule:'conway',nicheDensity:0,initialDensity:0});assert.deepEqual(fresh.output,[0,0,0]);assert.deepEqual(fresh.snapshots,[]);
});
