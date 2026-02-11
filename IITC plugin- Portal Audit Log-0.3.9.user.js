// ==UserScript==
// @id             iitc-plugin-portal-audit-log
// @name           IITC plugin: Portal Audit Log
// @category       d.org.addon
// @version        0.3.9
// @description    [0.3.9]監視ユーザ一致で★マーカーを付ける。通常時のタップ透過を強化(BugFix)。
// @match          https://intel.ingress.com/*
// @include        https://intel.ingress.com/*
// @grant          none
// ==/UserScript==

function wrapper(plugin_info) {
  if (typeof window.plugin !== 'function') window.plugin = function(){};
  window.plugin.portalAudit = {};

  const KEY = 'plugin-portal-audit-v1';
  const KEY_WATCH = 'plugin-portal-audit-watchlist';
  const KEY_STARS = 'plugin-portal-audit-stars'; // ★の状態保存用
  const KEY_OPTS = 'plugin-portal-audit-options'; // 設定保存用

  // ---------- storage ----------
  const loadStore = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch(e){ return []; } };
  const saveStore = (d) => localStorage.setItem(KEY, JSON.stringify(d));
  const getWatch = () => (localStorage.getItem(KEY_WATCH) || '').trim();
  const setWatch = (s) => localStorage.setItem(KEY_WATCH, (s||'').trim());

  // Stars & Options
  const getStars = () => { try { return JSON.parse(localStorage.getItem(KEY_STARS) || '{}'); } catch(e){ return {}; } };
  const setStars = (d) => localStorage.setItem(KEY_STARS, JSON.stringify(d));
  const getOpts = () => { try { return JSON.parse(localStorage.getItem(KEY_OPTS) || '{"clearOnReload":false}'); } catch(e){ return {clearOnReload:false}; } };
  const saveOpts = (d) => localStorage.setItem(KEY_OPTS, JSON.stringify(d));

  const escCSV = (s) => `"${String(s ?? '').replace(/"/g,'""')}"`;

  // ---------- CSV（固定列） ----------
  function toCSV(rows){
    const header = ['ts','guid','name','lat','lng','MOD1','MOD2','MOD3','MOD4',
                    'Resonator1','Resonator2','Resonator3','Resonator4','Resonator5','Resonator6','Resonator7','Resonator8'];
    const out = [header.join(',')];
    for (const r of rows){
      const modSlots = ['', '', '', ''];
      (r.mods||[]).slice(0,4).forEach((m,i)=>{
        const rarity=m?.rarity||'', name=m?.name||'Unknown', owner=m?.owner||'';
        modSlots[i]=`${rarity} ${name}${owner?' by '+owner:''}`.trim();
      });
      let resoSlots = Array.isArray(r.resonatorOwnersBySlot) ? r.resonatorOwnersBySlot.slice(0,8) : null;
      if (!resoSlots){
        const uniq = r.resonators||[];
        resoSlots=['','','','','','','',''];
        for(let i=0;i<Math.min(uniq.length,8);i++) resoSlots[i]=uniq[i]||'';
      }
      while(resoSlots.length<8) resoSlots.push('');
      out.push([r.ts,r.guid,escCSV(r.name),r.lat,r.lng,...modSlots.map(escCSV),...resoSlots.map(escCSV)].join(','));
    }
    return out.join('\n');
  }

  // ---------- CSVダウンロード（PC+Android対応） ----------
  function downloadCsvUtf8Bom(name, text){
    const csv = '\ufeff' + text;
    try {
      // 1) PC向け: Blob + a.download
      const blob = new Blob([csv], {type:'text/csv'});
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.dispatchEvent(new MouseEvent('click'));
      setTimeout(()=>URL.revokeObjectURL(a.href), 1500);
      return;
    } catch(e){}

    try {
      // 2) Android向け: data:URLで新規タブ
      const url = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
      window.open(url, '_blank');
      return;
    } catch(e){}

    // 3) 最後の手段: promptで表示
    window.prompt('CSVをコピーしてください', csv);
  }

  // ---------- CSVインポート（★復活用） ----------
  function parseCsvLine(line){
    const out=[]; let cur=''; let q=false;
    for (let i=0;i<line.length;i++){
      const c=line[i];
      if (q){
        if (c===`"`){ if (line[i+1]===`"`){ cur+=`"`; i++; } else { q=false; } }
        else cur+=c;
      } else {
        if (c===`,`) { out.push(cur); cur=''; }
        else if (c===`"`) q=true;
        else cur+=c;
      }
    }
    out.push(cur); return out;
  }
  function importCsvAndRestoreMarks(text){
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    const lines = text.split(/\r?\n/).filter(l => l.trim().length>0);
    if (lines.length<=1) return 0;
    const header = parseCsvLine(lines[0]).map(h => h.replace(/^"|"$/g,''));
    const idx = Object.fromEntries(header.map((h,i)=>[h,i]));
    if (idx.lat==null || idx.lng==null) return 0;

    let count = 0;
    for (let li=1; li<lines.length; li++){
      const cols = parseCsvLine(lines[li]);
      const lat = parseFloat((cols[idx.lat]||'').replace(/^"|"$/g,''));
      const lng = parseFloat((cols[idx.lng]||'').replace(/^"|"$/g,''));
      if (Number.isNaN(lat) || Number.isNaN(lng)) continue;

      const mods = [];
      for (let m=1; m<=4; m++){
        const key = 'MOD'+m;
        const v = idx[key]!=null ? (cols[idx[key]]||'').replace(/^"|"$/g,'') : '';
        if (!v) continue;
        const pos = v.toLowerCase().lastIndexOf(' by ');
        const owner = pos>=0 ? v.slice(pos+4) : '';
        mods.push({owner});
      }
      const bySlot=[];
      for (let r=1; r<=8; r++){
        const key = 'Resonator'+r;
        const v = idx[key]!=null ? (cols[idx[key]]||'').replace(/^"|"$/g,'') : '';
        bySlot.push(v);
      }
      if(hitWatchedUser(mods, bySlot)){
          const guid = (idx.guid!=null) ? (cols[idx.guid]||'').replace(/^"|"$/g,'') : ('import_'+li);
          registerStar(guid, {lat, lng});
          count++;
      }
    }
    return count;
  }

  // ---------- readiness ----------
  function isDetailsRich(d){
    if (!d) return false;
    const hasMods = Array.isArray(d.mods) && d.mods.filter(Boolean).length>0;
    const hasReso = Array.isArray(d.resonators) && d.resonators.filter(Boolean).some(r=>r&&r.owner);
    return hasMods || hasReso;
  }
  const pending = new Map();
  function recordWhenReady(guid, initialDelay=120){
    if (!guid) return;
    if (pending.has(guid)) return;
    pending.set(guid, {tries:0,timer:null});
    const MAX_TRIES=12, INTERVAL=250;
    const step=()=>{
      const p = window.portals[guid];
      const d = window.portalDetail.get(guid) || p?.options?.data;
      if (d && isDetailsRich(d) && p){ pending.delete(guid); doRecord(guid,d,p); return; }
      const st=pending.get(guid); if(!st) return;
      st.tries++; if(st.tries>=MAX_TRIES){ if(d&&p) doRecord(guid,d,p); pending.delete(guid); return; }
      st.timer=setTimeout(step,INTERVAL);
    };
    setTimeout(step, initialDelay);
  }

  // ---------- markers（透過クリック + Android fix） ----------
  let markerLayer = null;
  const guidToMarker = new Map();
  const paneName = 'paPane';
  let isDeleteMode = false;

  function ensureMarkerInfra(){
    if (!window.map || !window.L) return false;
    if (!markerLayer){
      if (!map.getPane(paneName)){
        map.createPane(paneName);
        const pane = map.getPane(paneName);
        pane.style.pointerEvents = 'none'; // 重要：Pane自体は常にクリックを透過させる
        pane.style.zIndex = 710;
      }
      markerLayer = new L.LayerGroup();
      window.addLayerGroup('Audit Stars', markerLayer, true);
    }
    return true;
  }

  // モード切替時の処理（CSSクラスの付与のみ行う）
  function updateDeleteModeState() {
      // bodyにクラスをつけることでCSS側でpointer-eventsを制御する
      if(isDeleteMode) {
          document.body.classList.add('pa-delete-mode');
      } else {
          document.body.classList.remove('pa-delete-mode');
      }
  }

  function parseWatchList(){
    const raw=getWatch(); if(!raw) return [];
    return raw.split(',').map(s=>s.trim()).filter(Boolean).map(s=>s.toLowerCase());
  }
  function hitWatchedUser(mods, bySlot){
    const watch=parseWatchList(); if(watch.length===0) return false;
    const owners=new Set([...mods.map(m=>(m.owner||'').toLowerCase()), ...bySlot.map(o=>(o||'').toLowerCase())]);
    return watch.some(w=>owners.has(w));
  }

  function registerStar(guid, latlng) {
      if(!guid) return;
      const stars = getStars();
      stars[guid] = {lat: latlng.lat, lng: latlng.lng};
      setStars(stars);
      renderStar(guid, latlng);
  }

  function unregisterStar(guid) {
      const stars = getStars();
      delete stars[guid];
      setStars(stars);

      const group = guidToMarker.get(guid);
      if (group){ markerLayer.removeLayer(group); guidToMarker.delete(guid); }
  }

  function renderStar(guid, latlng) {
    if (!ensureMarkerInfra()) return;
    if (guidToMarker.has(guid)) return;

    // interactive: true にするが、pointer-events は CSS で制御する
    const star = L.marker([latlng.lat, latlng.lng], {
      icon: L.divIcon({ className:'pa-star', html:'★', iconSize:[12,12], iconAnchor:[6,6] }),
      interactive: true,
      pane: paneName
    });

    star.on('click', (ev) => {
        if(isDeleteMode) {
            L.DomEvent.stopPropagation(ev); // 地図へのクリック伝播を止める
            unregisterStar(guid);
        }
    });

    const ring = L.circleMarker([latlng.lat, latlng.lng], {
      radius: 10, color: '#ff2d2d', weight: 2, fillOpacity: 0,
      interactive: false, pane: paneName
    });

    const group = L.layerGroup([ring, star]);
    markerLayer.addLayer(group);
    if (group.eachLayer) group.eachLayer(l => l.bringToFront && l.bringToFront());
    guidToMarker.set(guid, group);
  }

  function clearAllMarks(){
    if (!markerLayer) return;
    markerLayer.clearLayers();
    guidToMarker.clear();
    setStars({});
  }

  function checkAndMark(guid, latlng, mods, bySlot){
    if (hitWatchedUser(mods, bySlot)){
        registerStar(guid, latlng);
    }
  }

  // ---------- record ----------
  function doRecord(guid, d, portal){
    const latlng = portal?.getLatLng ? portal.getLatLng() : {lat:'',lng:''};
    const mods = (d.mods||[]).filter(Boolean).map(m=>({ name:m.name||m.type||'Unknown', rarity:m.rarity||'', owner:m.owner||'' }));
    const bySlot = []; const arr=d.resonators||[];
    for(let i=0;i<8;i++) bySlot.push(arr[i]?.owner||'');
    const uniqOwners = Array.from(new Set(bySlot.filter(Boolean)));

    const store=loadStore();
    const last=store.length?store[store.length-1]:null;

    if (last && last.guid===guid && (Date.now()-Date.parse(last.ts))<5000) { checkAndMark(guid,latlng,mods,bySlot); return; }

    store.push({ ts:new Date().toISOString(), guid, name:d.title||'', lat:latlng.lat, lng:latlng.lng,
                 mods, resonators:uniqOwners, resonatorOwnersBySlot:bySlot });
    saveStore(store);
    checkAndMark(guid,latlng,mods,bySlot);
  }

  // ---------- UI ----------
  function addToolboxLink(){
    try{
      if (document.getElementById('portal-audit-opt')) return;
      const tb=document.getElementById('toolbox');
      if(!tb) return;
      tb.appendChild(document.createTextNode(' '));
      const a=document.createElement('a');
      a.id='portal-audit-opt'; a.href='#'; a.textContent='Audit Opt';
      a.addEventListener('click', (ev)=>{ ev.preventDefault(); openDialog(); });
      tb.appendChild(a);
    }catch(_){}
  }

  function openDialog(){
    const $ = window.jQuery || window.$;
    const opts = getOpts();
    const html = $(`
      <div>
        <p>記録件数: <b id="pa-count">${loadStore().length}</b></p>
        <div style="margin:6px 0;">
          <label>監視ユーザ（カンマ区切り）:</label><br>
          <input id="pa-watch" type="text" style="width:100%; box-sizing:border-box;" placeholder="spiral99,iijimas,YakimuraR">
          <div style="font-size:11px;opacity:.8;margin-top:3px;">一致ポータルに★マーカー</div>
        </div>

        <div style="margin:6px 0; padding:4px; border:1px solid #444;">
          <label style="cursor:pointer;"><input id="pa-opt-volatile" type="checkbox"> ページリロードで★を全消去する</label>
        </div>

        <div class="buttonbar" style="display:flex;flex-direction:column;gap:6px;">
          <a id="pa-del-mode" class="button" href="#" style="display:block;text-align:center;color:#eee;">削除モード: OFF</a>
          <a id="pa-import" class="button" href="#" style="display:block;text-align:center;">CSVインポート（★復活）</a>
          <a id="pa-export" class="button" href="#" style="display:block;text-align:center;">CSV出力（UTF-8）</a>
          <a id="pa-record" class="button" href="#" style="display:block;text-align:center;">現在ポータルを手動記録</a>
          <a id="pa-clear-marks" class="button" href="#" style="display:block;text-align:center; color:#f88;">★マーカーを全消去</a>
          <a id="pa-clear" class="button" href="#" style="display:block;text-align:center;">溜め込みログを全消去</a>
        </div>
      </div>
    `);
    window.dialog({ title:'Portal Audit', html, id:'pa-dialog', modal:false });

    // Watchlist
    html.find('#pa-watch').val(getWatch());
    html.find('#pa-watch').on('change blur',(e)=>{ setWatch(e.target.value); });

    // Options
    const cbVolatile = html.find('#pa-opt-volatile');
    cbVolatile.prop('checked', opts.clearOnReload);
    cbVolatile.on('change', (e) => {
        opts.clearOnReload = e.target.checked;
        saveOpts(opts);
    });

    // Delete Mode
    const updateDelBtn = () => {
        const btn = html.find('#pa-del-mode');
        btn.text(isDeleteMode ? '削除モード: ON (★クリックで消去)' : '削除モード: OFF');
        btn.css('background', isDeleteMode ? '#500' : '');
    };
    updateDelBtn();
    html.find('#pa-del-mode').on('click', (e) => {
        e.preventDefault();
        isDeleteMode = !isDeleteMode;
        updateDelBtn();
        updateDeleteModeState();
    });

    html.find('#pa-export').on('click', (e)=>{ e.preventDefault(); downloadCsvUtf8Bom('portal_audit.csv', toCSV(loadStore())); });
    html.find('#pa-record').on('click', (e)=>{ e.preventDefault(); const g=window.selectedPortal; if(g) recordWhenReady(g,0); html.find('#pa-count').text(loadStore().length); });
    html.find('#pa-clear-marks').on('click', (e)=>{ e.preventDefault(); if(confirm('表示中の★を全て消去しますか？')) clearAllMarks(); });
    html.find('#pa-clear').on('click', (e)=>{ e.preventDefault(); if (confirm('保存しているログをすべて削除しますか？')) { saveStore([]); html.find('#pa-count').text('0'); } });

    const file = $('<input type="file" accept=".csv" style="display:none;">').appendTo(html);
    html.find('#pa-import').on('click', (e)=>{ e.preventDefault(); file.trigger('click'); });
    file.on('change', async (ev)=>{ const f = ev.target.files[0]; if (!f) return;
      const text = await f.text(); const n = importCsvAndRestoreMarks(text);
      window.alert(n ? `★を ${n} 件ぶん復活しました` : 'インポートに失敗しました'); });
  }

  function onDetailsUpdated(d){ const g=d?.guid||d?.details?.guid||window.selectedPortal; if(g) recordWhenReady(g,80); }
  function onPortalSelected(d){ const g=d?.selectedPortalGuid||window.selectedPortal; if(g) recordWhenReady(g,150); }

  function setup(){
    const inject = ()=>addToolboxLink();
    inject(); setTimeout(inject,500); setTimeout(inject,1500);
    const mo = new MutationObserver(()=>inject());
    mo.observe(document.body, { subtree:true, childList:true });
    setInterval(inject, 2000);

    setTimeout(()=>{
        if (window.map && window.L) ensureMarkerInfra();

        const opts = getOpts();
        if (opts.clearOnReload) {
            setStars({});
        } else {
            const stars = getStars();
            for(const guid in stars) {
                renderStar(guid, stars[guid]);
            }
        }
        updateDeleteModeState(); // 念のため初期状態反映
    }, 500);

    window.addHook('portalSelected', onPortalSelected);
    window.addHook('portalDetailsUpdated', onDetailsUpdated);

    // CSS修正: !important を付与して確実に制御
    const css=document.createElement('style');
    css.textContent=`
        .pa-star {
            color: #ffb400; font-weight: bold; font-size: 12px; text-shadow: 0 0 2px #000;
            pointer-events: none !important;
        }
        body.pa-delete-mode .pa-star {
            pointer-events: auto !important;
            cursor: pointer;
        }
    `;

    document.head.appendChild(css);

    document.addEventListener('keydown',(ev)=>{
      if(ev.shiftKey && ev.key==='E'){ ev.preventDefault(); openDialog(); }
      if(ev.shiftKey && ev.key==='R'){ ev.preventDefault(); const g=window.selectedPortal; if(g) recordWhenReady(g,0); }
    });
  }

  setup.info = plugin_info;
  if (!window.bootPlugins) window.bootPlugins = [];
  window.bootPlugins.push(setup);
  if (window.iitcLoaded) setup();
}

var script=document.createElement('script'); var info={};
if (typeof GM_info!=='undefined' && GM_info && GM_info.script){
  info.script={version:GM_info.script.version,name:GM_info.script.name,description:GM_info.script.description};
}
script.appendChild(document.createTextNode('('+wrapper+')('+JSON.stringify(info)+');'));
(document.body||document.head||document.documentElement).appendChild(script);