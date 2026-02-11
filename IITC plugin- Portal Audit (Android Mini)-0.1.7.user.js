// ==UserScript==
// @id             iitc-plugin-portal-audit-mini-android
// @name           IITC plugin: Portal Audit (Android Mini)
// @category       d.org.addon
// @version        0.1.6
// @description    [0.1.6]監視ユーザ一致のポータルへ★マーカー（クリック透過）。PC版CSVインポート対応。レイヤーON/OFF対応。削除モード維持対応。
// @match          https://intel.ingress.com/*
// @include        https://intel.ingress.com/*
// @grant          none
// ==/UserScript==

function wrapper(plugin_info){
  if (typeof window.plugin !== 'function') window.plugin = function(){};
  window.plugin.portalAuditMini = {};

  // =========================
  // [Checkpoint-a1-001] 定数・設定
  // =========================
  const KEY_WATCH = 'plugin-portal-audit-mini-watchlist'; // カンマ区切りの監視ユーザ
  const KEY_IMPORTED = 'plugin-portal-audit-mini-imported'; // インポート済みCSV（★復活）
  const KEY_STARRED = 'plugin-portal-audit-mini-starred';   // タップ★（保持）
  const KEY_CLEAR_ON_RELOAD = 'plugin-portal-audit-mini-clearOnReload'; // 1ならリロード時に★全消去
  const PANE_NAME = 'paMiniPane';                          // 透過クリック用 Pane 名
  const PANE_ZINDEX = 710;                                 // Android でも前面に出やすい値

  // 追加: 削除モード管理
  let isDeleteMode = false;

  // =========================
  // [Checkpoint-a2-001] 監視ユーザ 入出力
  // =========================
  function getWatchRaw(){ return (localStorage.getItem(KEY_WATCH) || '').trim(); }
  function setWatchRaw(s){ localStorage.setItem(KEY_WATCH, (s||'').trim()); }
  function parsedWatch(){
    const raw = getWatchRaw();
    if (!raw) return [];
    return raw.split(',').map(s=>s.trim()).filter(Boolean).map(s=>s.toLowerCase());
  }


  // =========================
  // [Checkpoint-a2b-001] CSVインポート（PC版CSVから★復活）
  // =========================
  function loadImported(){
    try { return JSON.parse(localStorage.getItem(KEY_IMPORTED) || '[]') || []; }
    catch(e){ return []; }
  }
  function saveImported(list){
    try { localStorage.setItem(KEY_IMPORTED, JSON.stringify(list || [])); }
    catch(e){}
  }

  function loadStarred(){
    try { return JSON.parse(localStorage.getItem(KEY_STARRED) || '[]') || []; }
    catch(e){ return []; }
  }
  function saveStarred(list){
    try { localStorage.setItem(KEY_STARRED, JSON.stringify(list || [])); }
    catch(e){}
  }

  function getClearOnReload(){
    return (localStorage.getItem(KEY_CLEAR_ON_RELOAD) || '0') === '1';
  }
  function setClearOnReload(v){
    localStorage.setItem(KEY_CLEAR_ON_RELOAD, v ? '1' : '0');
  }

  function upsertStarred(guid, latlng){
    if (!guid || typeof guid !== 'string') return;
    if (guid.startsWith('imp_')) return; // インポート枠は別管理
    if (!latlng || latlng.lat==null || latlng.lng==null) return;

    const rec = { guid, lat: latlng.lat, lng: latlng.lng };
    const list = loadStarred();
    const idx = list.findIndex(x => x && x.guid === guid);
    if (idx >= 0) list[idx] = rec;
    else list.push(rec);
    saveStarred(list);
  }

  // 追加: データ削除（削除モード用）
  function deleteStoredData(id){
    // インポートデータの場合 (IDが imp_ で始まる)
    if (id.startsWith('imp_')) {
      const realGuid = id.replace(/^imp_/, '');
      let list = loadImported();
      const beforeLen = list.length;
      list = list.filter(r => r.guid !== realGuid);
      if (list.length !== beforeLen) {
        saveImported(list);
      }
    } else {
      // タップ保存の場合
      let list = loadStarred();
      const beforeLen = list.length;
      list = list.filter(r => r.guid !== id);
      if (list.length !== beforeLen) {
        saveStarred(list);
      }
    }
  }

  function restoreStarredMarks(){
    const list = loadStarred();
    if (!list.length) return 0;
    if (!ensureMarkerInfra()) return 0;

    let applied = 0;
    for (const r of list){
      if (!r || !r.guid) continue;
      const lat = (typeof r.lat === 'number') ? r.lat : parseFloat(r.lat);
      const lng = (typeof r.lng === 'number') ? r.lng : parseFloat(r.lng);
      if (Number.isNaN(lat) || Number.isNaN(lng)) continue;

      const before = guidToMarker.has(r.guid);
      markPortal(r.guid, {lat, lng}, [], [], true); // 強制表示
      const after = guidToMarker.has(r.guid);
      if (!before && after) applied++;
    }
    return applied;
  }

  // PC版CSVのクオート・カンマ対応（RFC4180軽量版）
  function parseCsvLine(line){
    const out=[]; let cur=''; let q=false;
    for (let i=0;i<line.length;i++){
      const c=line[i];
      if (q){
        if (c===`"`){
          if (line[i+1]===`"`){ cur+=`"`; i++; }
          else { q=false; }
        } else cur+=c;
      } else {
        if (c===`,`) { out.push(cur); cur=''; }
        else if (c===`"`) q=true;
        else cur+=c;
      }
    }
    out.push(cur);
    return out;
  }
  function stripQuotes(s){ return (s||'').replace(/^"|"$/g,''); }

  // MOD列の " ... by OWNER" から OWNER だけ拾う（PC版CSV互換）
  function pickOwnerFromModCell(v){
    v = stripQuotes(v||'');
    const pos = v.toLowerCase().lastIndexOf(' by ');
    return pos>=0 ? v.slice(pos+4).trim() : '';
  }

  // CSVを読み込み、インポートデータを保存して、即座に★復活
  // return {rows, applied}
  function importCsvAndPersist(text){
    if (!text) return {rows:0, applied:0};
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

    const lines = text.split(/\r?\n/).filter(l => l.trim().length>0);
    if (lines.length<=1) return {rows:0, applied:0};

    const header = parseCsvLine(lines[0]).map(stripQuotes);
    const idx = Object.fromEntries(header.map((h,i)=>[h,i]));
    if (idx.lat==null || idx.lng==null) return {rows:0, applied:0};

    // 1行=1ポータル扱い（同一GUIDは最後を優先）
    const byGuid = new Map();
    for (let li=1; li<lines.length; li++){
      const cols = parseCsvLine(lines[li]);
      const guid = stripQuotes(idx.guid!=null ? (cols[idx.guid]||'') : '') || `row_${li}`;
      const lat = parseFloat(stripQuotes(cols[idx.lat]||''));
      const lng = parseFloat(stripQuotes(cols[idx.lng]||''));
      if (Number.isNaN(lat) || Number.isNaN(lng)) continue;

      const modsOwners = [];
      for (let m=1; m<=4; m++){
        const key='MOD'+m;
        const v = idx[key]!=null ? (cols[idx[key]]||'') : '';
        modsOwners.push(pickOwnerFromModCell(v));
      }
      const resOwners=[];
      for (let r=1; r<=8; r++){
        const key='Resonator'+r;
        const v = idx[key]!=null ? (cols[idx[key]]||'') : '';
        resOwners.push(stripQuotes(v));
      }

      byGuid.set(guid, {guid, lat, lng, modsOwners, resOwners});
    }

    const list = Array.from(byGuid.values());
    saveImported(list);

    const applied = restoreImportedMarks(); // watchlistに一致するものだけ描画
    return {rows:list.length, applied};
  }

  // インポート由来の★だけ消す（watchlistによるlive判定は残す）
  function clearImportedMarks(){
    if (!markerLayer) return;
    for (const [k, v] of Array.from(guidToMarker.entries())){
      if (k && typeof k==='string' && k.startsWith('imp_')){
        try { markerLayer.removeLayer(v); } catch(_){ }
        guidToMarker.delete(k);
      }
    }
  }

  // インポート済みデータから★を復活（watchlist一致のみ）
  // return applied count
  function restoreImportedMarks(){
    clearImportedMarks();
    const list = loadImported();
    if (!list.length) return 0;
    if (!ensureMarkerInfra()) return 0;

    let applied=0;
    for (const r of list){
      const mods = (r.modsOwners||[]).map(o=>({owner:o||''}));
      const bySlot = Array.isArray(r.resOwners) ? r.resOwners.slice(0,8) : [];
      const latlng = {lat:r.lat, lng:r.lng};

      // インポート由来はGUIDを衝突させない（live判定と別枠）
      const id = 'imp_' + (r.guid || '');
      const before = guidToMarker.has(id);
      markPortal(id, latlng, mods, bySlot);
      const after = guidToMarker.has(id);
      if (!before && after) applied++;
    }
    return applied;
  }

  // =========================
  // [Checkpoint-a3-001] マーカー周り（クリック透過 / 削除モード）
  // =========================
  let markerLayer = null;
  const guidToMarker = new Map();

  function ensureMarkerInfra(){
    if (!window.map || !window.L) return false;
    if (!markerLayer){
      if (!map.getPane(PANE_NAME)){
        map.createPane(PANE_NAME);
        const pane = map.getPane(PANE_NAME);
        pane.style.pointerEvents = 'none'; // 透過クリック
        pane.style.zIndex = String(PANE_ZINDEX);
      }
      try{
        // 変更: ここで addTo(map) しない。LayerChooserに任せる。
        markerLayer = L.layerGroup([], { pane: PANE_NAME });
      }catch(_){
        // フォールバック
        markerLayer = L.layerGroup();
      }
    }
    return true;
  }

  function clearAllMarks(){
    if (!markerLayer) return;
    markerLayer.clearLayers();
    guidToMarker.clear();
  }

  function hitWatchedUser(mods, bySlot){
    const watch = parsedWatch(); if (!watch.length) return false;
    const owners = new Set([
      ...mods.map(m => (m.owner||'').toLowerCase()),
      ...bySlot.map(o => (o||'').toLowerCase()),
    ]);
    return watch.some(w => owners.has(w));
  }

  function deleteMarker(guid) {
    const group = guidToMarker.get(guid);
    if (group) {
        markerLayer.removeLayer(group);
        guidToMarker.delete(guid);
        deleteStoredData(guid);
    }
  }

  function markPortal(guid, latlng, mods, bySlot, force){
    force = !!force;
    if (!ensureMarkerInfra()) return;
    if (!force && !hitWatchedUser(mods, bySlot)) return;

    const old = guidToMarker.get(guid);
    if (old){ markerLayer.removeLayer(old); guidToMarker.delete(guid); }

    const star = L.marker([latlng.lat, latlng.lng], {
      icon: L.divIcon({ className:'pa-mini-star', html:'★', iconSize:[12,12], iconAnchor:[6,6] }),
      interactive: true, // 削除タップ用
      pane: PANE_NAME
    });

    // 【修正】円（リング）もクリック対象にする
    const ring = L.circleMarker([latlng.lat, latlng.lng], {
      radius: 10, color: '#ff2d2d', weight: 2, fillOpacity: 0,
      className: 'pa-mini-ring', // CSS制御用クラス追加
      interactive: true, // 削除タップ用
      pane: PANE_NAME
    });

    // 削除モード用イベントリスナー（星と円の両方につける）
    const onDelete = (e) => {
        if (isDeleteMode) {
            L.DomEvent.stop(e);
            deleteMarker(guid);
        }
    };
    star.on('click', onDelete);
    ring.on('click', onDelete);

    const group = L.layerGroup([ring, star], { pane: PANE_NAME }).addTo(markerLayer);
    if (group.eachLayer) group.eachLayer(l => l.bringToFront && l.bringToFront());
    guidToMarker.set(guid, group);
    upsertStarred(guid, latlng);
  }

  // =========================
  // [Checkpoint-a4-001] 詳細ロード待ち → 判定 → マーク
  // =========================
  function isDetailsReady(d){
    if (!d) return false;
    const hasMods = Array.isArray(d.mods) && d.mods.filter(Boolean).length>0;
    const hasReso = Array.isArray(d.resonators) && d.resonators.filter(Boolean).some(r=>r && r.owner);
    return hasMods || hasReso;
  }

  const pending = new Map(); // guid -> {tries, timer}
  function whenReadyMark(guid, initialDelay=120){
    if (!guid) return;
    if (pending.has(guid)) return;
    pending.set(guid, {tries:0, timer:null});

    const MAX_TRIES=12, INTERVAL=250;

    const step = () => {
      const p = window.portals[guid];
      const d = window.portalDetail.get(guid) || p?.options?.data;
      if (d && isDetailsReady(d) && p){
        pending.delete(guid);
        const latlng = p.getLatLng ? p.getLatLng() : {lat:'',lng:''};
        const mods = (d.mods||[]).filter(Boolean).map(m=>({owner: m.owner || ''}));
        const bySlot = Array.from({length:8}, (_,i)=> (d.resonators||[])[i]?.owner || '');
        markPortal(guid, latlng, mods, bySlot);
        return;
      }
      const st = pending.get(guid); if (!st) return;
      st.tries++;
      if (st.tries >= MAX_TRIES){
        // 最終回：あるだけで判定
        if (d && p){
          const latlng = p.getLatLng ? p.getLatLng() : {lat:'',lng:''};
          const mods = (d.mods||[]).filter(Boolean).map(m=>({owner: m.owner || ''}));
          const bySlot = Array.from({length:8}, (_,i)=> (d.resonators||[])[i]?.owner || '');
          markPortal(guid, latlng, mods, bySlot);
        }
        pending.delete(guid);
        return;
      }
      st.timer = setTimeout(step, INTERVAL);
    };

    setTimeout(step, initialDelay);
  }

  // =========================
  // [Checkpoint-a5-001] UI（Audit Opt + ダイアログ：監視ユーザのみ）
  // =========================
  function addToolboxLink(){
    try{
      if (document.getElementById('portal-audit-mini-opt')) return;
      const tb = document.getElementById('toolbox');
      if (!tb) return;
      tb.appendChild(document.createTextNode(' '));
      const a = document.createElement('a');
      a.id = 'portal-audit-mini-opt'; a.href='#'; a.textContent='Audit Opt';
      a.addEventListener('click', (ev)=>{ ev.preventDefault(); openDialog(); });
      tb.appendChild(a);
    }catch(_){}
  }

  function toggleDeleteMode(enable) {
      isDeleteMode = enable;
      const btn = document.getElementById('pam-btn-delete-mode');
      if (btn) {
          btn.textContent = isDeleteMode ? '削除モード中 (★をタップ)' : '削除モード OFF';
          btn.style.background = isDeleteMode ? '#800' : '#222';
      }
      // CSSクラスで pointer-events を制御
      if (isDeleteMode) {
          document.body.classList.add('pa-mini-delete-mode');
      } else {
          document.body.classList.remove('pa-mini-delete-mode');
      }
  }

  function openDialog(){
    const $ = window.jQuery || window.$;
    const html = $(`
      <div>
        <div style="margin:6px 0;">
          <label>監視ユーザ（カンマ区切り）:</label><br>
          <input id="pam-watch" type="text" style="width:100%;box-sizing:border-box;" placeholder="userA,userB">
          <div style="font-size:11px;opacity:.8;margin-top:3px;">
            一致したポータルに★マーカーを表示します。
          </div>
          <label style="display:flex;align-items:center;gap:6px;margin-top:6px;">
            <input id="pam-clear-reload" type="checkbox">
            <span>リロード時に★をクリア</span>
          </label>
        </div>

        <div style="margin:8px 0;padding-top:6px;border-top:1px solid rgba(255,255,255,.15);">
          <div style="margin-bottom:8px;">
             <button id="pam-btn-delete-mode" style="width:100%; padding:6px; border:1px solid #555; background:#222; color:#eee; cursor:pointer;">削除モード OFF</button>
             <div style="font-size:11px;opacity:.8;margin-top:2px;">※ONにすると★をタップして削除できます。</div>
          </div>

          <div style="font-size:12px;opacity:.9;margin-bottom:6px;">
            PC版のCSV（portal_audit.csv）を読み込んで、★を復活できます（端末再起動/リロード後も保持）
          </div>

          <div class="buttonbar" style="display:flex;flex-direction:column;gap:6px;">
            <a id="pam-import" class="button" href="#" style="display:block;text-align:center;">CSVインポート（★復活）</a>
            <a id="pam-clear-all" class="button" href="#" style="display:block;text-align:center;">★全部クリア</a>
          </div>

          <div id="pam-import-stat" style="font-size:11px;opacity:.8;margin-top:6px;"></div>
        </div>
      </div>
`);
    window.dialog({ title:'Portal Audit (Mini)', html, id:'pam-dialog', modal:false
       // 【修正】ダイアログを閉じても削除モードを解除しない（維持する）
       // closeCallback: () => { toggleDeleteMode(false); }
    });

    html.find('#pam-watch').val(getWatchRaw());
    html.find('#pam-watch').on('change blur', (e)=> setWatchRaw(e.target.value));
    html.find('#pam-clear-reload').prop('checked', getClearOnReload());
    html.find('#pam-clear-reload').on('change', (e)=> setClearOnReload(!!e.target.checked));

    // 削除モードボタン
    toggleDeleteMode(isDeleteMode); // 状態復元
    html.find('#pam-btn-delete-mode').on('click', (e) => {
        e.preventDefault();
        toggleDeleteMode(!isDeleteMode);
    });

    // CSVインポート（ファイル選択）
    const file = $('<input type="file" accept=".csv,text/csv" style="display:none;">').appendTo(html);
    const updateStat = ()=> {
      const n = loadImported().length;
      html.find('#pam-import-stat').text(n ? `インポート件数: ${n}` : 'インポートなし');
    };
    updateStat();

    html.find('#pam-import').on('click', (e)=>{ e.preventDefault(); file.trigger('click'); });
    file.on('change', async (ev)=>{ const f = ev.target.files && ev.target.files[0]; if (!f) return;
      try{
        const text = await f.text();
        const r = importCsvAndPersist(text);
        updateStat();
        window.alert(`CSV ${r.rows} 行ぶん読込。watch一致の★を ${r.applied} 件 描画しました。`);
      }catch(err){
        window.alert('インポートに失敗しました');
      } finally {
        // 同じファイルを連続で選べるように
        ev.target.value='';
      }
    });

    html.find('#pam-clear-all').on('click', (e)=>{ e.preventDefault();
      clearAllMarks();
      saveImported([]);
      saveStarred([]);
      updateStat();
      window.alert('★を全部クリアしました');
    });

  }

  // =========================
  // [Checkpoint-a6-001] Hooks（選択/詳細更新 → マーク）
  // =========================
  function onDetailsUpdated(data){
    const guid = data?.guid || data?.details?.guid || window.selectedPortal;
    if (guid) whenReadyMark(guid, 80);
  }
  function onPortalSelected(data){
    const guid = data?.selectedPortalGuid || window.selectedPortal;
    if (guid) whenReadyMark(guid, 150);
  }

  // =========================
  // [Checkpoint-a7-001] setup（UI復活対策つき）
  // =========================
  function setup(){
    // リロード時に★全消去（設定ONのときだけ）
    if (getClearOnReload()){
      saveImported([]);
      saveStarred([]);
    }

    // UIの注入：初回＋遅延＋定期＋DOM監視で復活
    const inject = ()=>addToolboxLink();
    // 保存済み★（インポート＋タップ）を復活（mapが立ち上がるまで少しリトライ）
    const reviveStored = ()=>{
      let tries=0;
      const t = setInterval(()=>{
        tries++;
        if (ensureMarkerInfra()){
          restoreImportedMarks();
          restoreStarredMarks();
          clearInterval(t);
        } else if (tries>=20){
          clearInterval(t);
        }
      }, 500);
    };

    inject(); setTimeout(inject,500); setTimeout(inject,1500);
    setInterval(inject, 2000);
    new MutationObserver(inject).observe(document.body, {subtree:true, childList:true});

    // map 準備後に Pane/Layer を用意
    setTimeout(()=>{
        if (window.map && window.L) {
            ensureMarkerInfra();
            // 変更: Layer Chooser への登録
            if (window.layerChooser) {
                window.layerChooser.addOverlay(markerLayer, 'Audit Star');
            } else {
                // fallback
                map.addLayer(markerLayer);
            }
        }
    }, 0);

    // フック
    window.addHook('portalSelected', onPortalSelected);
    reviveStored();
    window.addHook('portalDetailsUpdated', onDetailsUpdated);

    // ★見た目（ズレ回避：relative指定なし）
    // 追加: 削除モード時のCSS。円（リング）にも適用。
    const css = document.createElement('style');
    css.textContent = `
      .pa-mini-star { color:#ffb400; font-weight:bold; font-size:12px; text-shadow:0 0 2px #000; pointer-events:none; }
      .pa-mini-ring { pointer-events:none; }
      body.pa-mini-delete-mode .pa-mini-star,
      body.pa-mini-delete-mode .pa-mini-ring { pointer-events:auto !important; cursor:crosshair; }
    `;
    document.head.appendChild(css);
  }

  // =========================
  // [Checkpoint-a8-001] IITC登録
  // =========================
  setup.info = plugin_info;
  if (!window.bootPlugins) window.bootPlugins = [];
  window.bootPlugins.push(setup);
  if (window.iitcLoaded) setup();
}

// injector
var script=document.createElement('script'); var info={};
if (typeof GM_info!=='undefined' && GM_info && GM_info.script){
  info.script={version:GM_info.script.version,name:GM_info.script.name,description:GM_info.script.description};
}
script.appendChild(document.createTextNode('('+wrapper+')('+JSON.stringify(info)+');'));
(document.body||document.head||document.documentElement).appendChild(script);