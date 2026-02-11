// ==UserScript==
// @author         DOPPELGENGER,GEMINI3PRO,JULES
// @id             iitc-plugin-portal-star
// @name           IITC plugin: PortalStar
// @category       d.org.addon
// @version        1.0.0
// @description    [1.0.0]A brief description of the plugin
// @namespace      https://example.com/
// @include        https://intel.ingress.com/*
// @include        https://intel-x.ingress.com/*
// @grant          none
// ==/UserScript==

function wrapper(plugin_info) {
  'use strict';

  if (typeof window.plugin !== 'function') window.plugin = function () {};
  window.plugin.portalStar = window.plugin.portalStar || {};
  const S = window.plugin.portalStar;

  // --- Function 00000 Globals and Configuration
  const KEY_DATA = 'plugin-portal-star-data';
  const KEY_CONFIG = 'plugin-portal-star-config';
  const KEY_OPTS = 'plugin-portal-star-options';
  const PANE_NAME = 'portalStarPane';
  const PANE_ZINDEX = 710;

  // Default Configuration
  const DEFAULT_CONFIG = {
    slots: [
      { name: '', colorStar: '#FFFF00', colorRing: '#FF0000', active: false },
      { name: '', colorStar: '#FFFF00', colorRing: '#FF0000', active: false },
      { name: '', colorStar: '#FFFF00', colorRing: '#FF0000', active: false },
      { name: '', colorStar: '#FFFF00', colorRing: '#FF0000', active: false },
      { name: '', colorStar: '#FFFF00', colorRing: '#FF0000', active: false }
    ]
  };

  const DEFAULT_OPTS = {
    autoDeleteDays: 0 // 0 = OFF
  };

  // Data Format: [version, [ [ts, guid, lat, lng, [mod_owners], [reso_owners], owner, title], ... ]]
  const DATA_VERSION = 1;
  const DEFAULT_DATA = [DATA_VERSION, []];

  S.data = JSON.parse(JSON.stringify(DEFAULT_DATA));
  S.config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  S.options = JSON.parse(JSON.stringify(DEFAULT_OPTS));

  S.starLayer = null;
  S.ringLayer = null;
  S.deleteMode = false;

  // --- Function 00010 UI Initialization
  S.openSettings = function() {
    // Generate Slot Rows
    let slotRows = '';
    S.config.slots.forEach((slot, i) => {
      slotRows += `
        <tr>
          <td>Slot ${i + 1}</td>
          <td><input type="text" class="ps-slot-name" data-idx="${i}" value="${slot.name}" placeholder="Agent Name"></td>
          <td><input type="color" class="ps-slot-star" data-idx="${i}" value="${slot.colorStar}"></td>
          <td><input type="color" class="ps-slot-ring" data-idx="${i}" value="${slot.colorRing}"></td>
          <td style="text-align:center;"><input type="checkbox" class="ps-slot-active" data-idx="${i}" ${slot.active ? 'checked' : ''}></td>
        </tr>
      `;
    });

    const html = `
      <div class="portal-star-settings">
        <div class="ps-tabs">
          <button class="ps-tab-btn active" data-tab="slots">設定 (Slots)</button>
          <button class="ps-tab-btn" data-tab="data">データ管理</button>
        </div>

        <div id="ps-tab-slots" class="ps-tab-content active">
          <p class="ps-desc">ターゲットエージェントとマーカー色を設定します (優先度: Slot 1 > Slot 5)</p>
          <table class="ps-slot-table">
            <thead>
              <tr>
                <th>No.</th>
                <th>ターゲット名</th>
                <th>星の色</th>
                <th>円の色</th>
                <th>有効</th>
              </tr>
            </thead>
            <tbody>
              ${slotRows}
            </tbody>
          </table>
        </div>

        <div id="ps-tab-data" class="ps-tab-content">
          <div class="ps-data-controls">
            <div class="ps-control-group">
              <label>ログ自動削除 (日): <input type="number" id="ps-auto-delete" value="${S.options.autoDeleteDays}" min="0" style="width: 50px;"></label>
              <span class="ps-note">(0 = 無効)</span>
            </div>

            <div class="ps-control-group">
              <button id="ps-btn-dedup">重複削除</button>
              <button id="ps-btn-export">出力 (Export)</button>
              <button id="ps-btn-import">読込 (Import)</button>
              <input type="file" id="ps-file-input" style="display:none" accept=".json">
            </div>

            <div class="ps-control-group danger-zone">
              <button id="ps-btn-clear-markers" class="danger">マーカー全消去 (ログ削除)</button>
              <button id="ps-btn-clear-all" class="danger">ログ全消去 (全データ)</button>
            </div>

            <div class="ps-stat">
              現在のログ件数: <span id="ps-log-count">${S.data[1].length}</span>
            </div>
          </div>
        </div>

        <div class="ps-footer">
          <button id="ps-btn-delete-mode" class="${S.deleteMode ? 'active' : ''}">${S.deleteMode ? '削除モード中 (マップタップ)' : '削除モード OFF'}</button>
        </div>
      </div>
    `;

    window.dialog({
      html: html,
      id: 'plugin-portal-star-dialog',
      dialogClass: 'ui-dialog-portal-star',
      title: 'PortalStar Opt',
      width: 'auto',
      position: { my: 'center', at: 'center', of: window },
      draggable: true
    });

    // Event Listeners
    $('.ps-tab-btn').on('click', function() {
      $('.ps-tab-btn').removeClass('active');
      $(this).addClass('active');
      $('.ps-tab-content').removeClass('active');
      $(`#ps-tab-${$(this).data('tab')}`).addClass('active');
    });

    // Slot Inputs
    $('.ps-slot-name').on('change', function() { S.config.slots[$(this).data('idx')].name = this.value; S.saveSettings(); S.drawMarkers(); });
    $('.ps-slot-star').on('change', function() { S.config.slots[$(this).data('idx')].colorStar = this.value; S.saveSettings(); S.drawMarkers(); });
    $('.ps-slot-ring').on('change', function() { S.config.slots[$(this).data('idx')].colorRing = this.value; S.saveSettings(); S.drawMarkers(); });
    $('.ps-slot-active').on('change', function() { S.config.slots[$(this).data('idx')].active = this.checked; S.saveSettings(); S.drawMarkers(); });

    // Data Controls
    $('#ps-auto-delete').on('change', function() { S.options.autoDeleteDays = parseInt(this.value) || 0; S.saveSettings(); });
    $('#ps-btn-dedup').on('click', function() { S.deduplicate(); $('#ps-log-count').text(S.data[1].length); });
    $('#ps-btn-export').on('click', function() { S.exportData(); });
    $('#ps-btn-import').on('click', function() { $('#ps-file-input').click(); });
    $('#ps-file-input').on('change', function() { if(this.files[0]) S.importData(this.files[0]); });

    $('#ps-btn-clear-markers').on('click', function() {
      if(confirm('現在表示されているマーカーに対応するログを全て削除しますか？')) {
        S.clearVisibleMarkers();
        $('#ps-log-count').text(S.data[1].length);
      }
    });

    $('#ps-btn-clear-all').on('click', function() {
      if(confirm('全てのログデータを削除しますか？この操作は取り消せません。')) {
        S.data[1] = [];
        S.saveData();
        S.drawMarkers();
        $('#ps-log-count').text(0);
      }
    });

    $('#ps-btn-delete-mode').on('click', function() {
      S.toggleDeleteMode();
      $(this).text(S.deleteMode ? '削除モード中 (マップタップ)' : '削除モード OFF');
      $(this).toggleClass('active', S.deleteMode);
    });
  };

  S.addToolboxLink = function() {
    if ($('#portal-star-toolbox-link').length === 0) {
      $('#toolbox').append('<a id="portal-star-toolbox-link" onclick="window.plugin.portalStar.openSettings();return false;">PortalStar Opt</a>');
    }
  };

  S.toggleDeleteMode = function() {
    S.deleteMode = !S.deleteMode;
    if (S.deleteMode) {
      $(document.body).addClass('ps-delete-mode-active');
    } else {
      $(document.body).removeClass('ps-delete-mode-active');
    }
  };

  // --- Function 00020 Data Management
  S.loadSettings = function() {
    try {
      const c = localStorage.getItem(KEY_CONFIG);
      if (c) S.config = { ...DEFAULT_CONFIG, ...JSON.parse(c) };
      const o = localStorage.getItem(KEY_OPTS);
      if (o) S.options = { ...DEFAULT_OPTS, ...JSON.parse(o) };
    } catch(e) { console.error('PortalStar loadSettings error', e); }
  };

  S.saveSettings = function() {
    localStorage.setItem(KEY_CONFIG, JSON.stringify(S.config));
    localStorage.setItem(KEY_OPTS, JSON.stringify(S.options));
  };

  S.loadData = function() {
    try {
      const d = localStorage.getItem(KEY_DATA);
      if (d) {
        const parsed = JSON.parse(d);
        if (Array.isArray(parsed) && parsed[0] === DATA_VERSION) {
          S.data = parsed;
        } else {
          // Migration or Reset? For now, reset if version mismatch
          console.warn('PortalStar Data Version Mismatch or Invalid Format. Resetting.');
          S.data = JSON.parse(JSON.stringify(DEFAULT_DATA));
        }
      }
    } catch(e) { console.error('PortalStar loadData error', e); }
  };

  S.saveData = function() {
    try {
      localStorage.setItem(KEY_DATA, JSON.stringify(S.data));
    } catch(e) { console.error('PortalStar saveData error', e); }
  };

  S.addLog = function(logEntry) {
    // logEntry: [ts, guid, lat, lng, [mod_owners], [reso_owners], owner, title]
    S.data[1].push(logEntry);
    S.saveData();
    S.drawMarkers();
  };

  S.deduplicate = function() {
    const uniqueMap = new Map();
    // Keep the LATEST one if duplicates exist? Or just first?
    // "remove exact duplicate logs (same guid + timestamp + details)"
    // Using stringify as key
    const initialCount = S.data[1].length;

    // Sort by timestamp desc to keep latest if we were doing that, but for exact dupes, order doesn't matter much.
    // However, let's just use JSON string as key.
    const newLogs = [];
    const seen = new Set();

    for (const log of S.data[1]) {
      // Key: guid + ts + details
      // log structure: [ts, guid, lat, lng, mods, resos, owner, title]
      const key = log[0] + log[1] + JSON.stringify(log[4]) + JSON.stringify(log[5]) + log[6] + log[7];
      if (!seen.has(key)) {
        seen.add(key);
        newLogs.push(log);
      }
    }

    S.data[1] = newLogs;
    S.saveData();
    alert(`重複削除完了: ${initialCount - newLogs.length} 件削除しました。`);
  };

  S.autoDelete = function() {
    if (S.options.autoDeleteDays <= 0) return;
    const cutoff = Date.now() - (S.options.autoDeleteDays * 24 * 60 * 60 * 1000);
    const initialCount = S.data[1].length;

    S.data[1] = S.data[1].filter(log => {
      const ts = new Date(log[0]).getTime();
      return ts >= cutoff;
    });

    if (S.data[1].length !== initialCount) {
      S.saveData();
      console.log(`PortalStar: Auto-deleted ${initialCount - S.data[1].length} logs.`);
    }
  };

  S.clearLogs = function(guid) {
    const initialCount = S.data[1].length;
    S.data[1] = S.data[1].filter(log => log[1] !== guid);
    if (S.data[1].length !== initialCount) {
      S.saveData();
    }
  };

  S.clearVisibleMarkers = function() {
    // Determine which logs correspond to visible markers
    // To do this correctly, we need to know which GUIDs have markers.
    // We can iterate logs, check if they match config, if so, delete ALL logs for that GUID.
    const guidsToDelete = new Set();
    const latestLogs = S.getLatestLogsByGuid();

    for (const [guid, log] of Object.entries(latestLogs)) {
      if (S.matchLog(log)) {
        guidsToDelete.add(guid);
      }
    }

    const initialCount = S.data[1].length;
    S.data[1] = S.data[1].filter(log => !guidsToDelete.has(log[1]));

    S.saveData();
    S.drawMarkers();
    alert(`表示中のマーカーに関連するログを削除しました (${initialCount - S.data[1].length} 件)`);
  };

  S.exportData = function() {
    const dataStr = JSON.stringify(S.data);
    const fileName = `StarMarker_${new Date().toISOString().slice(0,10).replace(/-/g,'')}_${new Date().toISOString().slice(11,16).replace(/:/g,'')}.json`;

    if (typeof window.android !== 'undefined' && window.android && window.android.saveFile) {
      window.android.saveFile(fileName, 'application/json', dataStr);
    } else {
      const blob = new Blob([dataStr], {type: "application/json"});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  S.importData = function(file) {
    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const data = JSON.parse(e.target.result);
        if (Array.isArray(data) && data[0] === DATA_VERSION) {
          if (confirm('既存データにインポートデータを結合しますか？')) {
             S.data[1] = S.data[1].concat(data[1]);
             S.deduplicate(); // Also saves and alerts
             S.drawMarkers();
          }
        } else {
          alert('データ形式が無効です (Version mismatch or invalid JSON)');
        }
      } catch(e) {
        alert('インポートエラー: ' + e);
      }
    };
    reader.readAsText(file);
  };

  // --- Function 00030 Map & Layer Logic
  S.ensureInfra = function() {
    if (!window.map || !window.L) return false;

    if (!map.getPane(PANE_NAME)) {
      map.createPane(PANE_NAME);
      const pane = map.getPane(PANE_NAME);
      pane.style.pointerEvents = 'none';
      pane.style.zIndex = PANE_ZINDEX;
    }

    if (!S.starLayer) {
      S.starLayer = new L.LayerGroup();
      window.addLayerGroup('PortalStar: Stars', S.starLayer, true);
    }
    if (!S.ringLayer) {
      S.ringLayer = new L.LayerGroup();
      window.addLayerGroup('PortalStar: Rings', S.ringLayer, true);
    }

    return true;
  };

  // --- Function 00040 Marker Logic
  S.getLatestLogsByGuid = function() {
    const latest = {};
    for (const log of S.data[1]) {
      const guid = log[1];
      const ts = new Date(log[0]).getTime();
      if (!latest[guid] || ts > new Date(latest[guid][0]).getTime()) {
        latest[guid] = log;
      }
    }
    return latest;
  };

  S.matchLog = function(log) {
    // log: [ts, guid, lat, lng, mods, resos, owner, title]
    const mods = log[4] || [];
    const resos = log[5] || [];
    const owner = log[6] || '';

    // Check against slots in priority order
    for (const slot of S.config.slots) {
      if (slot.active && slot.name) {
        const target = slot.name.toLowerCase();

        // Check Owner
        if (owner.toLowerCase() === target) return slot;

        // Check Mods
        if (mods.some(m => m && m.toLowerCase() === target)) return slot;

        // Check Resos
        if (resos.some(r => r && r.toLowerCase() === target)) return slot;
      }
    }
    return null;
  };

  S.drawMarkers = function() {
    if (!S.ensureInfra()) return;

    S.starLayer.clearLayers();
    S.ringLayer.clearLayers();

    const latestLogs = S.getLatestLogsByGuid();

    for (const [guid, log] of Object.entries(latestLogs)) {
      const matchedSlot = S.matchLog(log);
      if (matchedSlot) {
        S.createMarker(log, matchedSlot);
      }
    }
  };

  S.createMarker = function(log, slot) {
    const lat = log[2];
    const lng = log[3];
    const guid = log[1];

    const starIcon = L.divIcon({
      className: 'plugin-portal-star-marker',
      html: `<div style="color:${slot.colorStar}">★</div>`,
      iconSize: [20, 20],
      iconAnchor: [10, 10]
    });

    const star = L.marker([lat, lng], {
      icon: starIcon,
      interactive: true, // Handled by pointer-events in CSS
      pane: PANE_NAME
    });

    const ring = L.circleMarker([lat, lng], {
      radius: 10,
      color: slot.colorRing,
      weight: 2,
      fillOpacity: 0,
      className: 'plugin-portal-star-ring',
      interactive: true, // Handled by pointer-events in CSS
      pane: PANE_NAME
    });

    const clickHandler = function(e) {
      if (S.deleteMode) {
        L.DomEvent.stop(e);
        if(confirm('このポータルのログを削除しますか？')) {
            S.deleteMarker(guid);
        }
      }
    };

    star.on('click', clickHandler);
    ring.on('click', clickHandler);

    S.starLayer.addLayer(star);
    S.ringLayer.addLayer(ring);
  };

  S.deleteMarker = function(guid) {
    S.clearLogs(guid);
    S.drawMarkers();
  };

  // --- Function 00050 Core Logic
  S.queue = {};
  S.processQueue = function(guid) {
    if (S.queue[guid]) clearTimeout(S.queue[guid]);

    S.queue[guid] = setTimeout(function() {
      delete S.queue[guid];
      S.checkAndRecord(guid);
    }, 500); // Debounce
  };

  S.checkAndRecord = function(guid) {
    const p = window.portals[guid];
    const d = window.portalDetail.get(guid);

    // Need both portal object (for lat/lng) and details (for mods/resos)
    if (!p || !d) return;

    const latlng = p.getLatLng();
    const mods = (d.mods || []).map(m => (m ? (m.owner || '') : '')); // Extract owners
    const resos = (d.resonators || []).map(r => (r ? (r.owner || '') : '')); // Extract owners
    const owner = (d.owner || '');
    const title = (d.title || '');

    // Construct Log Entry Temp to check matching
    // [ts, guid, lat, lng, mods, resos, owner, title]
    const tempLog = [new Date().toISOString(), guid, latlng.lat, latlng.lng, mods, resos, owner, title];

    if (S.matchLog(tempLog)) {
      // It matches! Add to log.
      S.addLog(tempLog);
    }
  };

  S.onPortalSelected = function(data) {
    const guid = data.selectedPortalGuid;
    if (guid) S.processQueue(guid);
  };

  S.onPortalDetailsUpdated = function(data) {
    const guid = data.guid;
    if (guid) S.processQueue(guid);
  };

  // --- Function 00060 Setup & Boot
  S.setupCSS = function() {
    $('<style>').prop('id', 'portal-star-css').prop('type', 'text/css').html(`
      .plugin-portal-star-marker {
        font-size: 20px;
        line-height: 20px;
        text-align: center;
        text-shadow: 0 0 2px #000;
        pointer-events: none;
      }
      .plugin-portal-star-ring {
        pointer-events: none;
      }

      body.ps-delete-mode-active .plugin-portal-star-marker,
      body.ps-delete-mode-active .plugin-portal-star-ring {
        pointer-events: auto;
        cursor: crosshair;
      }

      .portal-star-settings { font-size: 14px; }
      .ps-tabs { display: flex; gap: 5px; margin-bottom: 10px; border-bottom: 1px solid #444; }
      .ps-tab-btn { padding: 5px 10px; cursor: pointer; background: #222; border: 1px solid #444; border-bottom: none; color: #aaa; }
      .ps-tab-btn.active { background: #444; color: #fff; font-weight: bold; }
      .ps-tab-content { display: none; }
      .ps-tab-content.active { display: block; }

      .ps-slot-table { width: 100%; border-collapse: collapse; }
      .ps-slot-table th { text-align: left; border-bottom: 1px solid #555; padding: 5px; }
      .ps-slot-table td { padding: 5px; border-bottom: 1px solid #333; }
      .ps-slot-table input[type="text"] { width: 100%; box-sizing: border-box; }

      .ps-data-controls { display: flex; flex-direction: column; gap: 10px; margin-top: 10px; }
      .ps-control-group { padding: 5px; border: 1px solid #333; background: #222; }
      .ps-control-group.danger-zone { border-color: #844; background: #311; }
      .ps-control-group button { margin-right: 5px; }
      .ps-control-group button.danger { color: #f88; border-color: #844; }

      .ps-footer { margin-top: 15px; border-top: 1px solid #444; padding-top: 10px; }
      #ps-btn-delete-mode { width: 100%; padding: 8px; background: #222; border: 1px solid #555; color: #eee; cursor: pointer; }
      #ps-btn-delete-mode.active { background: #800; border-color: #f00; font-weight: bold; }

      .ui-dialog-portal-star { max-width: 600px !important; }
    `).appendTo('head');
  };

  function setup() {
    S.setupCSS();
    S.loadSettings();
    S.loadData();
    S.autoDelete();

    S.addToolboxLink();

    // Ensure Map Infra
    const initMap = setInterval(function() {
      if (window.map && window.L) {
        S.ensureInfra();
        S.drawMarkers();
        clearInterval(initMap);
      }
    }, 500);

    // Register Hooks
    window.addHook('portalSelected', S.onPortalSelected);
    window.addHook('portalDetailsUpdated', S.onPortalDetailsUpdated);
  }

  setup.info = plugin_info;
  if (!window.bootPlugins) window.bootPlugins = [];
  window.bootPlugins.push(setup);
  if (window.iitcLoaded) setup();
}

(function() {
  var info = { "script": { "name": "IITC plugin: PortalStar", "version": "1.0.0", "description": "[1.0.0]A brief description of the plugin" } };
  var script = document.createElement('script');
  script.appendChild(document.createTextNode('(' + wrapper + ')(' + JSON.stringify(info) + ');'));
  (document.body || document.head || document.documentElement).appendChild(script);
})();
