// 기상청 ASOS 일자료 → wx.json (GitHub Actions에서 실행, 인증키는 저장소 Secrets의 KMA_KEY)
import fs from 'node:fs';
const KEY=process.env.KMA_KEY; if(!KEY){ console.error('KMA_KEY 비밀값이 없습니다.'); process.exit(1); }
const STN=[["속초",90],["북춘천",93],["철원",95],["동두천",98],["파주",99],["대관령",100],["춘천",101],["백령도",102],["북강릉",104],["강릉",105],["동해",106],["서울",108],["인천",112],["원주",114],["울릉도",115],["수원",119],["영월",121],["충주",127],["서산",129],["울진",130],["청주",131],["대전",133],["추풍령",135],["안동",136],["상주",137],["포항",138],["군산",140],["대구",143],["전주",146],["울산",152],["창원",155],["광주",156],["부산",159],["통영",162],["목포",165],["여수",168],["흑산도",169],["완도",170],["고창",172],["순천",174],["진도(첨찰산)",175],["홍성",177],["서청주",181],["제주",184],["고산",185],["성산",188],["서귀포",189],["진주",192],["강화",201],["양평",202],["이천",203],["인제",211],["홍천",212],["태백",216],["정선군",217],["제천",221],["보은",226],["천안",232],["보령",235],["부여",236],["금산",238],["세종",239],["부안",243],["임실",244],["정읍",245],["남원",247],["장수",248],["고창군",251],["영광군",252],["김해시",253],["순창군",254],["북창원",255],["양산시",257],["보성군",258],["강진군",259],["장흥",260],["해남",261],["고흥",262],["의령군",263],["함양군",264],["광양시",266],["진도군",268],["봉화",271],["영주",272],["문경",273],["청송군",276],["영덕",277],["의성",278],["구미",279],["영천",281],["경주시",283],["거창",284],["합천",285],["밀양",288],["산청",289],["거제",294],["남해",295],["북부산",296]];
const TH={rain:5,wind:15,hot:33,cold:0,snow:5}, MD=[31,28,31,30,31,30,31,31,30,31,30,31];
const kst=new Date(Date.now()+9*3600e3); const end=new Date(Date.UTC(kst.getUTCFullYear(),kst.getUTCMonth(),kst.getUTCDate()-1));
const start=new Date(end); start.setUTCFullYear(start.getUTCFullYear()-10); start.setUTCDate(start.getUTCDate()+1);
const ymd=d=>d.toISOString().slice(0,10).replace(/-/g,'');
const key=KEY.trim().includes('%')?KEY.trim():encodeURIComponent(KEY.trim());
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function get(code,page){
  const url='https://apis.data.go.kr/1360000/AsosDalyInfoService/getWthrDataList?serviceKey='+key+'&pageNo='+page+'&numOfRows=999&dataType=JSON&dataCd=ASOS&dateCd=DAY&startDt='+ymd(start)+'&endDt='+ymd(end)+'&stnIds='+code;
  for(let i=0;i<4;i++){
    try{ const t=await (await fetch(url)).text(); let j; try{ j=JSON.parse(t); }catch(e){ throw new Error(t.slice(0,200)); }
      const R=j.response||j; const h=R.header||(R.resultCode?R:null);
      if(!h) throw new Error('예상 밖 응답: '+t.slice(0,300));
      if(h.resultCode==='03') return {total:0,items:[]}; if(h.resultCode!=='00') throw new Error(h.resultCode+' '+h.resultMsg);
      const b=R.body||{}; let it=(b.items&&b.items.item)||[]; if(!Array.isArray(it)) it=[it];
      return {total:+b.totalCount||0,items:it};
    }catch(e){ if(i===3) throw e; await sleep(3000*(i+1)); }
  }
}
const num=v=>{ if(v==null||v==='') return null; const x=parseFloat(v); return isNaN(x)?null:x; };
async function station(code){
  const f=await get(code,1); let items=f.items;
  for(let p=2;p<=Math.ceil(f.total/999);p++){ items=items.concat((await get(code,p)).items); await sleep(200); }
  const rows=items.map(it=>({tm:String(it.tm).slice(0,10),tmin:num(it.minTa),tmax:num(it.maxTa),rn:num(it.sumRn)||0,ws:num(it.maxInsWs),sd:num(it.ddMefs)||0})).sort((a,b)=>a.tm<b.tm?-1:1);
  if(rows.length<365) throw new Error('자료 부족 '+rows.length+'일');
  const E=v=>v==null?'x':Math.round(v*10); const r=[];
  rows.forEach((x,i)=>{ const prev=i&&rows[i-1].tm; const exp=prev&&new Date(Date.parse(prev)+864e5).toISOString().slice(0,10);
    if(i&&exp===x.tm) r[r.length-1][1]++; else r.push([x.tm,1]); });
  const d={code,start:rows[0].tm,tmin:rows.map(x=>E(x.tmin)).join(','),tmax:rows.map(x=>E(x.tmax)).join(','),rn:rows.map(x=>E(x.rn)).join(','),ws:rows.map(x=>E(x.ws)).join(','),sd:rows.map(x=>E(x.sd)).join(','),r};
  const z=()=>Array(12).fill(0); const days=z(), c={rain:z(),wind:z(),hot:z(),cold:z(),snow:z()}, any=z();
  rows.forEach(x=>{ const m=+x.tm.slice(5,7)-1; days[m]++;
    const g={rain:x.rn>=TH.rain,wind:x.ws!=null&&x.ws>=TH.wind,hot:x.tmax!=null&&x.tmax>=TH.hot,cold:x.tmax!=null&&x.tmax<=TH.cold,snow:x.sd>=TH.snow};
    let a=false; for(const k in g) if(g[k]){ c[k][m]++; a=true; } if(a) any[m]++; });
  const avg=v=>v.map((n,m)=>days[m]?Math.round(n/days[m]*MD[m]*10)/10:0);
  const ym=s=>s.slice(0,7).replace('-','.'); const y0=+rows[0].tm.slice(0,4), y1=+rows[rows.length-1].tm.slice(0,4);
  const agg={code,wxn:avg(any),wxf:{rain:avg(c.rain),wind:avg(c.wind),hot:avg(c.hot),cold:avg(c.cold),snow:avg(c.snow)},years:ym(rows[0].tm)+'~'+ym(rows[rows.length-1].tm),yearList:Array.from({length:y1-y0+1},(_,i)=>String(y0+i)),days:rows.length,src:'API'};
  return {agg,daily:d};
}
let old={stations:{}}; try{ old=JSON.parse(fs.readFileSync('wx.json','utf8')); }catch(e){}
const out={updated:end.toISOString().slice(0,10),src:'기상청 ASOS 일자료',stations:{}}; let ok=0, fail=[];
for(const [name,code] of STN){
  try{ out.stations[name]=await station(code); ok++; console.log('OK',name,code); }
  catch(e){ fail.push(name+'('+e.message+')'); if(!ok&&fail.length>=3){ console.error('처음 3개 지점 연속 실패 — 중단합니다.\n'+e.message); process.exit(1); } if(old.stations[name]) out.stations[name]=old.stations[name]; console.log('FAIL',name,code,e.message); }
}
console.log('성공',ok,'/',STN.length, fail.length?'실패: '+fail.join(', '):'');
if(!ok){ console.error('모든 지점 실패 — 인증키 또는 서비스 승인을 확인하세요.'); process.exit(1); }
fs.writeFileSync('wx.json',JSON.stringify(out));
