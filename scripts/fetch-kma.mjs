// 기상청 ASOS 일자료 → wx.json (GitHub Actions에서 실행, 인증키는 저장소 Secrets의 KMA_KEY)
// 지원: 기상청 API허브 kma_sfcdd3.php(기간) → kma_sfcdd.php(일별) → 공공데이터포털 순으로 자동 시도
// KMA_SOURCE 비밀값으로 고정 가능: sfcdd3 / sfcdd / datago
import fs from 'node:fs';
const KEY=(process.env.KMA_KEY||'').trim(); if(!KEY){ console.error('KMA_KEY 비밀값이 없습니다.'); process.exit(1); }
const FORCE=(process.env.KMA_SOURCE||'').trim();
const STN=[["속초",90],["북춘천",93],["철원",95],["동두천",98],["파주",99],["대관령",100],["춘천",101],["백령도",102],["북강릉",104],["강릉",105],["동해",106],["서울",108],["인천",112],["원주",114],["울릉도",115],["수원",119],["영월",121],["충주",127],["서산",129],["울진",130],["청주",131],["대전",133],["추풍령",135],["안동",136],["상주",137],["포항",138],["군산",140],["대구",143],["전주",146],["울산",152],["창원",155],["광주",156],["부산",159],["통영",162],["목포",165],["여수",168],["흑산도",169],["완도",170],["고창",172],["순천",174],["진도(첨찰산)",175],["홍성",177],["서청주",181],["제주",184],["고산",185],["성산",188],["서귀포",189],["진주",192],["강화",201],["양평",202],["이천",203],["인제",211],["홍천",212],["태백",216],["정선군",217],["제천",221],["보은",226],["천안",232],["보령",235],["부여",236],["금산",238],["세종",239],["부안",243],["임실",244],["정읍",245],["남원",247],["장수",248],["고창군",251],["영광군",252],["김해시",253],["순창군",254],["북창원",255],["양산시",257],["보성군",258],["강진군",259],["장흥",260],["해남",261],["고흥",262],["의령군",263],["함양군",264],["광양시",266],["진도군",268],["봉화",271],["영주",272],["문경",273],["청송군",276],["영덕",277],["의성",278],["구미",279],["영천",281],["경주시",283],["거창",284],["합천",285],["밀양",288],["산청",289],["거제",294],["남해",295],["북부산",296]];
const CODES=new Set(STN.map(s=>s[1]));
const TH={rain:5,wind:15,hot:33,cold:0,snow:5}, MD=[31,28,31,30,31,30,31,31,30,31,30,31];
const kst=new Date(Date.now()+9*3600e3); const END=new Date(Date.UTC(kst.getUTCFullYear(),kst.getUTCMonth(),kst.getUTCDate()-1));
const START=new Date(END); START.setUTCFullYear(START.getUTCFullYear()-10); START.setUTCDate(START.getUTCDate()+1);
const ymd=d=>d.toISOString().slice(0,10).replace(/-/g,'');
const iso=s=>s.slice(0,4)+'-'+s.slice(4,6)+'-'+s.slice(6,8);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const fatal=m=>{ const e=new Error(m); e.fatal=true; return e; };

async function fetchText(url){
  for(let i=0;i<4;i++){
    try{ const r=await fetch(url); const t=await r.text();
      if(r.status===401||r.status===403) throw fatal('HTTP '+r.status+' '+t.slice(0,300));
      if(!r.ok) throw new Error('HTTP '+r.status+' '+t.slice(0,200));
      return t;
    }catch(e){ if(e.fatal||i===3) throw e; await sleep(2000*(i+1)); }
  }
}
// ---- 기상청 API허브 typ01 텍스트 해석 (help=1 의 "# N. 이름 :" 정의로 열 위치를 찾음) ----
let COLS_LOGGED=false;
function parseTyp01(t){
  const s=t.trim();
  if(s.startsWith('{')||s.startsWith('<')) throw fatal('API허브 응답: '+s.slice(0,300));
  const cols=[]; for(const m of t.matchAll(/^#\s*(\d+)\.\s*([A-Za-z0-9_]+)\s*:/gm)) cols[+m[1]-1]=m[2].toUpperCase();
  const lines=t.split('\n').filter(l=>l.trim()&&!l.trim().startsWith('#'));
  if(!cols.length) throw fatal('열 정의를 찾지 못함: '+s.slice(0,300));
  if(!COLS_LOGGED){ console.log('API허브 열:',cols.join(',')); COLS_LOGGED=true; }
  const at=(...names)=>{ for(const n of names){ const i=cols.indexOf(n); if(i>=0) return i; } return -1; };
  const I={tm:at('TM','YYMMDD'),stn:at('STN','STN_ID'),tmax:at('TA_MAX'),tmin:at('TA_MIN'),rn:at('RN_DAY','RN'),ws:at('WS_INS','WS_INS_MAX'),sd:at('SD_NEW','SD_NEW_DAY','SD_DAY')};
  const miss=Object.keys(I).filter(k=>I[k]<0&&k!=='sd');
  if(miss.length) throw fatal('필요한 열 없음('+miss.join(',')+') — 열 목록: '+cols.join(','));
  const out=[];
  for(const l of lines){
    const f=(l.includes(',')?l.split(','):l.trim().split(/\s+/)).map(x=>x.trim());
    const tm=String(f[I.tm]||'').slice(0,8); const code=parseInt(f[I.stn],10); if(!/^\d{8}$/.test(tm)||!CODES.has(code)) continue;
    const v=i=>{ if(i<0) return null; const x=parseFloat(f[i]); return isNaN(x)?null:x; };
    const tx=v(I.tmax), tn=v(I.tmin), rn=v(I.rn), ws=v(I.ws), sd=v(I.sd);
    out.push({code,tm:iso(tm),tmax:tx==null||tx<=-50?null:tx,tmin:tn==null||tn<=-50?null:tn,rn:rn==null||rn<0?0:rn,ws:ws==null||ws<0?null:ws,sd:sd==null||sd<0?0:sd});
  }
  return out;
}
const HUB='https://apihub.kma.go.kr/api/typ01/url/';
let old={stations:{}}; try{ old=JSON.parse(fs.readFileSync('wx.json','utf8')); }catch(e){}
// 기간 조회: 지점별·연도별
async function viaSfcdd3(code){
  let rows=[]; const y0=START.getUTCFullYear(), y1=END.getUTCFullYear();
  for(let y=y0;y<=y1;y++){
    const a=y===y0?ymd(START):y+'0101', b=y===y1?ymd(END):y+'1231';
    rows=rows.concat(parseTyp01(await fetchText(HUB+'kma_sfcdd3.php?tm1='+a+'&tm2='+b+'&stn='+code+'&help=1&authKey='+encodeURIComponent(KEY))));
  }
  return rows.filter(r=>r.code===code);
}
// 일별 조회: 하루씩 전 지점 (약 3,650회)
async function viaSfcddAll(){
  // 이어받기: 기존 wx.json 의 마지막 날 다음부터만 조회
  const by=oldRows(); let from=new Date(START);
  const last=Object.values(by).map(a=>a.length?a[a.length-1].tm:'').filter(Boolean).sort()[0];
  if(last){ const d=new Date(Date.parse(last)+864e5); if(d>from) from=d; console.log('기존 자료 '+last+'까지 있음 → 이후만 조회'); }
  const days=[]; for(let d=new Date(from);d<=END;d.setUTCDate(d.getUTCDate()+1)) days.push(ymd(d));
  console.log('조회할 날짜',days.length,'일'); let done=0, bad=0;
  const work=async day=>{
    try{ parseTyp01(await fetchText(HUB+'kma_sfcdd.php?tm='+day+'&stn=0&help=1&authKey='+encodeURIComponent(KEY))).forEach(r=>(by[r.code]||(by[r.code]=[])).push(r)); }
    catch(e){ if(e.fatal&&done<5) throw e; bad++; }
    if(++done%200===0) console.log('일별 조회',done,'/',days.length);
  };
  for(let i=0;i<days.length;i+=12) await Promise.all(days.slice(i,i+12).map(work));
  if(bad) console.log('실패한 날짜',bad,'일');
  const s0=START.toISOString().slice(0,10); for(const k in by) by[k]=by[k].filter(r=>r.tm>=s0);
  return by;
}
// 공공데이터포털
async function viaDatago(code){
  const key=KEY.includes('%')?KEY:encodeURIComponent(KEY);
  const q=p=>'https://apis.data.go.kr/1360000/AsosDalyInfoService/getWthrDataList?serviceKey='+key+'&pageNo='+p+'&numOfRows=999&dataType=JSON&dataCd=ASOS&dateCd=DAY&startDt='+ymd(START)+'&endDt='+ymd(END)+'&stnIds='+code;
  const get=async p=>{ const t=await fetchText(q(p)); let j; try{ j=JSON.parse(t); }catch(e){ throw fatal('공공데이터포털: '+t.slice(0,300)); }
    const E=j.OpenAPI_ServiceResponse&&j.OpenAPI_ServiceResponse.cmmMsgHeader; if(E) throw fatal('공공데이터포털: '+E.errMsg+' ('+E.returnAuthMsg+')');
    const R=j.response||j, h=R.header; if(!h) throw fatal('공공데이터포털 예상 밖 응답: '+t.slice(0,300));
    if(h.resultCode==='03') return {total:0,items:[]}; if(h.resultCode!=='00') throw new Error(h.resultCode+' '+h.resultMsg);
    const b=R.body||{}; let it=(b.items&&b.items.item)||[]; if(!Array.isArray(it)) it=[it]; return {total:+b.totalCount||0,items:it}; };
  const f=await get(1); let items=f.items; for(let p=2;p<=Math.ceil(f.total/999);p++) items=items.concat((await get(p)).items);
  const n=v=>{ if(v==null||v==='') return null; const x=parseFloat(v); return isNaN(x)?null:x; };
  return items.map(it=>({code,tm:String(it.tm).slice(0,10),tmin:n(it.minTa),tmax:n(it.maxTa),rn:n(it.sumRn)||0,ws:n(it.maxInsWs),sd:n(it.ddMefs)||0}));
}
// 기존 wx.json 일자료 → 행
function oldRows(){
  const by={};
  for(const n in old.stations){ const d=old.stations[n]&&old.stations[n].daily; if(!d||!d.r) continue;
    const P=x=>x.split(',').map(v=>v==='x'?null:+v/10); const tn=P(d.tmin),tx=P(d.tmax),rn=P(d.rn),ws=P(d.ws),sd=P(d.sd);
    const rows=[]; let i=0; d.r.forEach(([st,c])=>{ const t=new Date(st+'T00:00:00Z'); for(let k=0;k<c;k++){ rows.push({code:d.code,tm:t.toISOString().slice(0,10),tmin:tn[i],tmax:tx[i],rn:rn[i]||0,ws:ws[i],sd:sd[i]||0}); t.setUTCDate(t.getUTCDate()+1); i++; } });
    by[d.code]=rows; }
  return by;
}
// ---- 집계 ----
function build(code,rows){
  const seen=new Set(); rows=rows.filter(x=>!seen.has(x.tm)&&seen.add(x.tm)).sort((a,b)=>a.tm<b.tm?-1:1);
  if(rows.length<365) throw new Error('자료 부족 '+rows.length+'일');
  const E=v=>v==null?'x':Math.round(v*10); const r=[];
  rows.forEach((x,i)=>{ const exp=i&&new Date(Date.parse(rows[i-1].tm)+864e5).toISOString().slice(0,10); if(i&&exp===x.tm) r[r.length-1][1]++; else r.push([x.tm,1]); });
  const daily={code,start:rows[0].tm,tmin:rows.map(x=>E(x.tmin)).join(','),tmax:rows.map(x=>E(x.tmax)).join(','),rn:rows.map(x=>E(x.rn)).join(','),ws:rows.map(x=>E(x.ws)).join(','),sd:rows.map(x=>E(x.sd)).join(','),r};
  const z=()=>Array(12).fill(0); const days=z(), c={rain:z(),wind:z(),hot:z(),cold:z(),snow:z()}, any=z();
  rows.forEach(x=>{ const m=+x.tm.slice(5,7)-1; days[m]++;
    const g={rain:x.rn>=TH.rain,wind:x.ws!=null&&x.ws>=TH.wind,hot:x.tmax!=null&&x.tmax>=TH.hot,cold:x.tmax!=null&&x.tmax<=TH.cold,snow:x.sd>=TH.snow};
    let a=false; for(const k in g) if(g[k]){ c[k][m]++; a=true; } if(a) any[m]++; });
  const avg=v=>v.map((n,m)=>days[m]?Math.round(n/days[m]*MD[m]*10)/10:0);
  const ym=s=>s.slice(0,7).replace('-','.'); const y0=+rows[0].tm.slice(0,4), y1=+rows[rows.length-1].tm.slice(0,4);
  const agg={code,wxn:avg(any),wxf:{rain:avg(c.rain),wind:avg(c.wind),hot:avg(c.hot),cold:avg(c.cold),snow:avg(c.snow)},years:ym(rows[0].tm)+'~'+ym(rows[rows.length-1].tm),yearList:Array.from({length:y1-y0+1},(_,i)=>String(y0+i)),days:rows.length,src:'API'};
  return {agg,daily};
}
// ---- 실행 ----
const out={updated:END.toISOString().slice(0,10),src:'기상청 ASOS 일자료',stations:{}}; let ok=0; const fail=[];
const put=(name,code,rows)=>{ try{ out.stations[name]=build(code,rows); ok++; console.log('OK',name,code); }catch(e){ fail.push(name+'('+e.message+')'); if(old.stations[name]) out.stations[name]=old.stations[name]; console.log('FAIL',name,code,e.message); } };
async function perStation(fn,label){
  for(const [name,code] of STN){
    try{ put(name,code,await fn(code)); }
    catch(e){ if(e.fatal&&!ok) throw e; fail.push(name+'('+e.message+')'); if(old.stations[name]) out.stations[name]=old.stations[name]; console.log('FAIL',name,code,e.message); }
  }
  console.log('['+label+'] 성공',ok,'/',STN.length);
}
const order=FORCE?[FORCE]:(Object.keys(old.stations).length?['sfcdd','sfcdd3','datago']:['sfcdd3','sfcdd','datago']); let used=null;
for(const m of order){
  try{
    console.log('시도:',m);
    if(m==='sfcdd3') await perStation(viaSfcdd3,m);
    else if(m==='datago') await perStation(viaDatago,m);
    else if(m==='sfcdd'){ const by=await viaSfcddAll(); for(const [name,code] of STN) put(name,code,by[code]||[]); console.log('[sfcdd] 성공',ok,'/',STN.length); }
    used=m; break;
  }catch(e){ console.log('×',m,'—',e.message); ok=0; fail.length=0; out.stations={}; }
}
if(fail.length) console.log('실패 지점:',fail.join(', '));
if(!used||!ok){ console.error('모든 방식 실패 — 위 × 줄의 메시지를 확인하세요.'); process.exit(1); }
fs.writeFileSync('wx.json',JSON.stringify(out));
console.log('wx.json 저장 ('+used+')');
