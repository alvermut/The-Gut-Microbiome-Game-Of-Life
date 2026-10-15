export const RULES=Object.freeze({
  conway:Object.freeze({name:'Conway',notation:'B3/S23',birth:Object.freeze([3]),survival:Object.freeze([2,3])}),
  bacteria:Object.freeze({name:'Bacteria',notation:'B34/S456',birth:Object.freeze([3,4]),survival:Object.freeze([4,5,6])})
});

// Five-cell cores: a Conway boat is stable; the Bacteria core becomes a
// repeating four-cell oscillator. Smaller/larger connected variants can engraft.
const PROBIOTIC_SEEDS={
  conway:[[0,0],[1,0],[0,1],[2,1],[1,2]],
  bacteria:[[0,0],[0,1],[1,1],[0,2],[2,2]]
};

export class World {
  constructor({size=61,types=3,nicheDensity=.012,initialDensity=.24,nutrientFraction=.3,weights=[1,1,1,1,1],random=Math.random,rule='bacteria',mucusWidth=10,clearanceRadius=20}={}) {
    if(!Object.hasOwn(RULES,rule))throw new RangeError(`Unknown rule: ${rule}`);
    this.rule=RULES[rule];
    Object.assign(this,{width:size,height:size,types,random,mucusWidth,clearanceRadius});
    this.leakyGut=false;this.lastSample=null;this.mucusLevels=new Map();this.clearingZone=new Set();
    this.generation=0;this.output=Array(types).fill(0);this.snapshots=[];
    this.niches=new Map();this.cells=new Map();this.active=[];this.mask=new Set();this.adjacent=new Map();
    const center=(size-1)/2;
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
      const distance=Math.hypot(x-center,y-center);
      if(distance>center)continue;
      const i=y*size+x;this.active.push(i);this.mask.add(i);
      if(clearanceRadius>0&&distance<=clearanceRadius)this.clearingZone.add(i);
      if(mucusWidth>0&&distance>=center-mucusWidth)this.mucusLevels.set(i,Math.min(mucusWidth,Math.floor(distance-(center-mucusWidth))+1));
    }
    for(const i of this.active){
      const x=i%size,y=Math.floor(i/size),neighbors=[];
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if((dx||dy)&&x+dx>=0&&x+dx<size&&y+dy>=0&&y+dy<size&&this.mask.has(i+dy*size+dx))neighbors.push(i+dy*size+dx);
      this.adjacent.set(i,neighbors);
    }
    const total=weights.slice(0,types).reduce((a,b)=>a+b,0);
    const chooseType=()=>{let draw=this.random()*total;for(let t=0;t<types;t++){draw-=weights[t];if(draw<0)return t;}return types-1;};
    this.chooseType=chooseType;
    for(const i of this.active){
      if(this.nicheAllowed(i)&&random()<nicheDensity)this.niches.set(i,{type:chooseType(),occupied:true});
      else if(this.survivalCounts(i).length&&random()<initialDensity)this.cells.set(i,random()<nutrientFraction?{kind:'nutrient',type:-1}:{kind:'microbe',type:chooseType()});
    }
  }
  neighbors(i){return this.adjacent.get(i)||[];}
  nicheAllowed(i){return this.mask.has(i)&&!this.clearingZone.has(i)&&this.survivalForLevel(this.mucusLevels.get(i)||0).length>0;}
  survivalCounts(i){
    const level=this.leakyGut?0:(this.mucusLevels.get(i)||0);
    return this.survivalForLevel(level);
  }
  survivalForLevel(level){
    if(!level)return this.rule.survival;
    const min=this.rule.survival[0],max=this.rule.survival.at(-1)-Math.ceil(level*5/(2*this.mucusWidth));
    if(max<min)return [];
    return Array.from({length:max-min+1},(_,k)=>min+k);
  }
  living(i){const niche=this.niches.get(i);return niche?.occupied?niche:this.cells.get(i);}
  majority(cells){
    const counts=new Map();for(const p of cells)counts.set(p.type,(counts.get(p.type)||0)+1);
    const max=Math.max(...counts.values()),tied=[...counts].filter(([,n])=>n===max).map(([t])=>t);
    return tied.length===1?tied[0]:tied[Math.floor(this.random()*tied.length)];
  }
  step(){
    const next=new Map();
    // Ordinary cells update simultaneously with the selected rule; niches count as life.
    for(const i of this.active){
      if(this.niches.get(i)?.occupied)continue;
      const survival=this.survivalCounts(i);
      if(!survival.length)continue; // The outer barrier permits neither survival nor birth.
      const neighbors=this.neighbors(i).map(j=>this.living(j)).filter(Boolean),p=this.cells.get(i);
      if(p){if(survival.includes(neighbors.length))next.set(i,p);}
      else if(this.rule.birth.includes(neighbors.length)){
        const type=this.majority(neighbors);next.set(i,{kind:type===-1?'nutrient':'microbe',type});
      }
    }
    // After the cellular update, nutrients touching niches become matching free bacteria.
    // A contested nutrient chooses one adjacent niche; conversions cannot cascade.
    for(const [i,p] of next)if(p.kind==='nutrient'){
      const niches=this.neighbors(i).map(j=>this.niches.get(j)).filter(n=>n?.occupied);
      if(niches.length){const niche=niches.length===1?niches[0]:niches[Math.floor(this.random()*niches.length)];next.set(i,{kind:'microbe',type:niche.type});}
    }
    this.cells=next;this.generation++;
  }
  sequence(){
    const speciesCounts=Array(this.types).fill(0);
    for(const cell of this.cells.values())if(cell.kind==='microbe')speciesCounts[cell.type]++;
    this.output=speciesCounts;
    this.lastSample={generation:this.generation,speciesCounts:[...speciesCounts]};
    this.snapshots.push(this.lastSample);
    return speciesCounts.reduce((total,count)=>total+count,0);
  }
  sample(items,count){
    const result=[];
    for(let k=0;k<Math.min(count,items.length);k++){const j=k+Math.floor(this.random()*(items.length-k));[items[k],items[j]]=[items[j],items[k]];result.push(items[k]);}
    return result;
  }
  probioticShape(size){
    const seed=PROBIOTIC_SEEDS[this.rule.name.toLowerCase()];
    const shape=size>=5?seed.map(point=>[...point]):[[...seed[Math.floor(this.random()*seed.length)]]];
    while(shape.length<size){
      const present=new Set(shape.map(([x,y])=>`${x},${y}`)),frontier=new Map();
      for(const [x,y] of shape)for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(dx||dy){
        const nx=x+dx,ny=y+dy,key=`${nx},${ny}`;
        if(present.has(key))continue;
        if(size<5){if(!seed.some(([sx,sy])=>sx===nx&&sy===ny))continue;}
        else if(nx< -1||nx>3||ny< -1||ny>3)continue;
        frontier.set(key,[nx,ny]);
      }
      const choices=[...frontier.values()];
      shape.push(choices[Math.floor(this.random()*choices.length)]);
    }
    const turns=Math.floor(this.random()*4);
    const rotated=shape.map(([sx,sy])=>{for(let k=0;k<turns;k++)[sx,sy]=[-sy,sx];return [sx,sy];});
    const minX=Math.min(...rotated.map(([x])=>x)),minY=Math.min(...rotated.map(([,y])=>y));
    return rotated.map(([x,y])=>[x-minX,y-minY]);
  }
  intervene(action){
    if(action!=='antibiotic'&&action!=='probiotic')throw new RangeError(`Unknown intervention: ${action}`);
    const candidates=[...this.niches.keys()].filter(i=>action==='antibiotic'?this.niches.get(i).occupied:this.nicheAllowed(i)&&!this.niches.get(i).occupied&&!this.cells.has(i));
    const selected=this.sample(candidates,Math.ceil(candidates.length*.25));
    for(const i of selected)this.niches.get(i).occupied=action==='probiotic';
    let bacteria=0;
    if(action==='antibiotic'){
      const living=[...this.cells.keys()].filter(i=>this.cells.get(i).kind==='microbe');
      const removed=this.sample(living,Math.ceil(living.length*.80));
      for(const i of removed)this.cells.delete(i);
      bacteria=removed.length;
    }else{
      const target=25+Math.floor(this.random()*46),type=this.chooseType(),added=new Set(),baseMax=this.rule.survival.at(-1);
      while(bacteria<target){
        const remaining=target-bacteria;
        const sizes=[3,4,5,6,7,8].filter(size=>size<=remaining&&(remaining===size||remaining-size>=3));
        const size=bacteria===0?5:sizes[Math.floor(this.random()*sizes.length)];
        const shape=this.probioticShape(size);
        let placed=false;
        const commit=sites=>{
          for(const i of sites){this.cells.set(i,{kind:'microbe',type});added.add(i);}
          bacteria+=sites.length;placed=true;
        };
        for(const gap of [3,2,1]){
          const eligible=i=>this.mask.has(i)&&!this.living(i)&&this.survivalCounts(i).at(-1)===baseMax
            &&![...added].some(j=>Math.abs(i%this.width-j%this.width)<=gap&&Math.abs(Math.floor(i/this.width)-Math.floor(j/this.width))<=gap);
          for(const anchor of this.sample([...this.active],this.active.length)){
            const ax=anchor%this.width,ay=Math.floor(anchor/this.width);
            const sites=shape.map(([dx,dy])=>(ay+dy)*this.width+ax+dx);
            if(shape.some(([dx,dy])=>ax+dx>=this.width||ay+dy>=this.height))continue;
            if(sites.every(eligible)){commit(sites);break;}
          }
          if(!placed)for(const anchor of this.sample([...this.active],this.active.length)){
            if(!eligible(anchor))continue;
            const sites=[anchor],included=new Set(sites);
            while(sites.length<size){
              const frontier=new Set();
              for(const i of sites)for(const j of this.neighbors(i))if(!included.has(j)&&eligible(j))frontier.add(j);
              if(!frontier.size)break;
              const next=this.sample([...frontier],1)[0];sites.push(next);included.add(next);
            }
            if(sites.length===size){commit(sites);break;}
          }
          if(placed)break;
        }
        if(!placed)break;
      }
    }
    return {niches:selected.length,bacteria};
  }
}
