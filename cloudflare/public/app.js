const $ = selector => document.querySelector(selector);
const cities = ['臺北市','新北市','桃園市','臺中市','臺南市','高雄市','基隆市','新竹市','新竹縣','苗栗縣','彰化縣','南投縣','雲林縣','嘉義市','嘉義縣','屏東縣','宜蘭縣','花蓮縣','臺東縣','澎湖縣','金門縣','連江縣'];
for (const city of cities) { const option = document.createElement('option'); option.value=city; option.textContent=city; $('#city').append(option); }
function el(tag,text,className) { const node=document.createElement(tag); node.textContent=text; if(className)node.className=className; return node; }
function sourceLink(url,text) { const a=el('a',text); a.href=url; a.target='_blank'; a.rel='noopener noreferrer'; return a; }
function renderSources(sources) {
  $('#sources').replaceChildren(...sources.map(s=>{
    const div=el('div','','source'); div.append(el('strong',s.name),el('p',s.coverage));
    const date=s.last_success?new Date(s.last_success).toLocaleString('zh-TW',{timeZone:'Asia/Taipei'}):'尚未取得';
    div.append(el('p',`最近取得：${date} · ${s.record_count.toLocaleString()} 筆${s.source_period?' · '+s.source_period+' 學年度':''}`));
    const state=s.status==='pending'?'尚未接入':s.status==='failed'?'更新失敗，保留上次成功資料':s.stale?'資料取得時間較久，請核對官方來源':'已取得資料';
    div.append(el('p',state,'status'),sourceLink(s.page,'查看官方資料集')); return div;
  }));
}
let params,offset=0,controller;
async function runSearch(append=false) {
  controller?.abort(); controller=new AbortController(); const active=controller;
  if(!append){params=new URLSearchParams(new FormData($('#search')));offset=0;$('#results').replaceChildren();}
  params.set('offset',String(offset)); $('#more').hidden=true; $('#message').textContent='正在查詢機構名錄…';
  try {
    const response=await fetch('/api/search?'+params,{signal:active.signal}); const data=await response.json();
    if(!response.ok)throw new Error(data.message||'查詢暫時無法完成，請稍後重試。');
    renderSources(data.sources);
    for(const r of data.results){
      const card=el('article','');card.append(el('span',r.category+' · '+r.city,'tag'),el('h3',r.name),el('p',r.address));
      card.append(el('p',r.period?r.period+' 學年度名錄':'官方名錄登載'),sourceLink(r.sourceUrl,'核對官方來源 ↗')); $('#results').append(card);
    }
    offset+=data.results.length;
    $('#message').textContent=offset?`已顯示 ${offset} 筆機構名錄。請核對地址，確認是你要找的機構。`:'目前已接入的名錄中未找到符合項目；不代表安全或未立案。請換完整名稱、調整縣市，或查官方來源。';
    if(data.sources.some(s=>s.status!=='ok'||s.stale))$('#message').textContent+=' 部分來源尚未接入或更新異常，結果可能不完整。';
    $('#more').hidden=!data.hasMore;
  }catch(error){if(error.name!=='AbortError')$('#message').textContent=error.message;}
}
$('#search').addEventListener('submit',event=>{event.preventDefault();runSearch();});
$('#more').addEventListener('click',()=>runSearch(true));
fetch('/api/status').then(r=>{if(!r.ok)throw new Error();return r.json();}).then(data=>renderSources(data.sources)).catch(()=>{$('#sources').textContent='目前無法確認資料狀態，請稍後再試。';});
