// Largest-remainder rounding keeps displayed nonempty fractions summing to 1.
export function relativeAbundances(counts){
  const total=counts.reduce((a,b)=>a+b,0);
  if(!total)return counts.map(()=>null);
  const units=counts.map(n=>Math.floor(n*10000/total));
  const order=counts.map((n,i)=>i).sort((a,b)=>(counts[b]*10000%total)-(counts[a]*10000%total)||a-b);
  const missing=10000-units.reduce((a,b)=>a+b,0);
  for(const i of order.slice(0,missing))units[i]++;
  return units.map(n=>(n/10000).toFixed(4));
}
