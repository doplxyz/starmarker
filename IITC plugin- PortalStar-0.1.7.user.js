// ==UserScript==
// @author         DOPPELGENGER,GEMINI3PRO,JULES
// @id             iitc-plugin-portal-star
// @name           IITC plugin: PortalStar
// @category       d.org.addon
// @version        0.1.7
// @namespace      https://example.com/
// @include        https://intel.ingress.com/*
// @include        https://intel-x.ingress.com/*
// @grant          none
// ==/UserScript==

function wrapper(plugin_info) {
  if (typeof window.plugin !== 'function') window.plugin = function () {};
  window.plugin.portalStar = {};
  const self = window.plugin.portalStar;

  // --- Function 00010 Constants & State
  const KEY_SETTINGS = 'plugin-portal-star-settings';
  const KEY_DATA = 'plugin-portal-star-data';
  const PANE_NAME = 'plugin-portal-star-pane';
  const Z_INDEX = 700;

  self.isDeleteMode = false;
  self.starLayer = null;
  self.ringLayer = null;
  self.guidToLayers = {};

  const DEFAULT_SETTINGS = {
    slots: [
      { name: '', starColor: '#ffff00', ringColor: '#ff0000', active: true },
      { name: '', starColor: '#00ff00', ringColor: '#0000ff', active: true },
      { name: '', starColor: '#00ffff', ringColor: '#ff00ff', active: true },
      { name: '', starColor: '#ffffff', ringColor: '#aaaaaa', active: true },
      { name: '', starColor: '#ffa500', ringColor: '#800080', active: true }
    ],
    autoDeleteDays: 0,
    clearOnReload: false
  };

  self.settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  self.data = [1, []];

  // --- Function 00020 Storage & Settings
  self.loadSettings = function() {
    try {
      const s = localStorage.getItem(KEY_SETTINGS);
      if (s) {
        const parsed = JSON.parse(s);
        self.settings = { ...DEFAULT_SETTINGS, ...parsed };
        if (!self.settings.slots || self.settings.slots.length !== 5) {
             const oldSlots = self.settings.slots || [];
             self.settings.slots = JSON.parse(JSON.stringify(DEFAULT_SETTINGS.slots));
             oldSlots.forEach((slot, i) => {
                 if (i < 5) self.settings.slots[i] = { ...self.settings.slots[i], ...slot };
             });
        }
      }
    } catch(e) { console.error('PortalStar loadSettings error', e); }
  };

  self.saveSettings = function() {
    localStorage.setItem(KEY_SETTINGS, JSON.stringify(self.settings));
  };

  self.loadData = function() {
    try {
      if (self.settings.clearOnReload) {
         self.data = [1, []];
         self.saveData();
         return;
      }
      const d = localStorage.getItem(KEY_DATA);
      if (d) {
        self.data = JSON.parse(d);
        if (!Array.isArray(self.data) || self.data.length < 2) {
            self.data = [1, []];
        }
      }
    } catch(e) { console.error('PortalStar loadData error', e); self.data = [1, []]; }
  };

  self.saveData = function() {
    try {
        localStorage.setItem(KEY_DATA, JSON.stringify(self.data));
    } catch(e) { console.error('PortalStar saveData error', e); }
  };

  // --- Function 00030 Data Logic
  self.addData = function(guid, lat, lng, mods, resos, owner, title) {
      const ts = new Date().toISOString();
      const record = [ts, guid, lat, lng, mods, resos, owner, title];
      self.data[1].push(record);
      self.saveData();
      return record;
  };

  self.deleteData = function(guid) {
      self.data[1] = self.data[1].filter(r => r[1] !== guid);
      self.saveData();
  };

  self.deduplicate = function() {
      const unique = new Map();
      let count = 0;
      // Reverse iteration to keep latest? Or just first found?
      // Since it's a log, keeping all unique events is good, but "deduplication" usually means exact duplicates.
      // Guid + Timestamp + Details check.
      // We will use JSON string of the record (excluding timestamp if slight variance? No, exact duplicate log entries)
      // Actually prompt says: "remove entries where guid, timestamp, and details are identical"
      self.data[1].forEach(r => {
          const key = JSON.stringify(r);
          if (!unique.has(key)) {
              unique.set(key, r);
          } else {
              count++;
          }
      });
      self.data[1] = Array.from(unique.values());
      self.saveData();
      return count;
  };

  self.autoDelete = function() {
      if (!self.settings.autoDeleteDays || self.settings.autoDeleteDays <= 0) return 0;
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - self.settings.autoDeleteDays);
      const initialCount = self.data[1].length;
      self.data[1] = self.data[1].filter(r => new Date(r[0]) > cutoff);
      const deleted = initialCount - self.data[1].length;
      if (deleted > 0) self.saveData();
      return deleted;
  };

  self.exportData = function() {
      const dataStr = JSON.stringify(self.data);
      const now = new Date();
      const y = now.getFullYear();
      const m = ('0' + (now.getMonth()+1)).slice(-2);
      const d = ('0' + now.getDate()).slice(-2);
      const h = ('0' + now.getHours()).slice(-2);
      const min = ('0' + now.getMinutes()).slice(-2);
      const fileName = `StarMarker_${y}${m}${d}_${h}${min}.json`;

      const blob = new Blob([dataStr], {type: "application/json"});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
  };

  self.importData = function(file) {
      const reader = new FileReader();
      reader.onload = function(e) {
          try {
              const json = JSON.parse(e.target.result);
              if (Array.isArray(json) && json.length >= 2 && Array.isArray(json[1])) {
                  const newRecords = json[1];
                  self.data[1] = self.data[1].concat(newRecords);
                  self.deduplicate();
                  self.saveData();
                  self.redrawAll();
                  alert(`インポート完了: ${newRecords.length} 件`);
              } else {
                  alert('エラー: 無効なフォーマットです。');
              }
          } catch(err) {
              alert('インポートエラー: ' + err);
          }
      };
      reader.readAsText(file);
  };

  // --- Function 00040 Map/Layer Logic
  self.ensureInfra = function() {
      if (!window.map || !window.L) return false;
      if (!map.getPane(PANE_NAME)) {
          map.createPane(PANE_NAME);
          const pane = map.getPane(PANE_NAME);
          pane.style.pointerEvents = 'none';
          pane.style.zIndex = Z_INDEX;
      }
      if (!self.starLayer) {
          self.starLayer = new L.LayerGroup();
          window.layerChooser.addOverlay(self.starLayer, 'PortalStar Stars');
      }
      if (!self.ringLayer) {
          self.ringLayer = new L.LayerGroup();
          window.layerChooser.addOverlay(self.ringLayer, 'PortalStar Rings');
      }
      return true;
  };

  self.getMatchSlot = function(record) {
      const owner = (record[6] || '').toLowerCase();
      const mods = (record[4] || []).map(m => (m || '').toLowerCase());
      const resos = (record[5] || []).map(r => (r || '').toLowerCase());

      for (let i = 0; i < 5; i++) {
          const slot = self.settings.slots[i];
          if (!slot.active || !slot.name) continue;
          const target = slot.name.toLowerCase();

          if (owner === target || mods.includes(target) || resos.includes(target)) {
              return slot;
          }
      }
      return null;
  };

  self.drawMarker = function(record) {
      if (!self.ensureInfra()) return;
      const guid = record[1];
      const lat = record[2];
      const lng = record[3];

      if (self.guidToLayers[guid]) {
          self.starLayer.removeLayer(self.guidToLayers[guid].star);
          self.ringLayer.removeLayer(self.guidToLayers[guid].ring);
          delete self.guidToLayers[guid];
      }

      const slot = self.getMatchSlot(record);
      if (!slot) return;

      const starIcon = L.divIcon({
          className: 'portal-star-icon',
          html: `<div style="color:${slot.starColor}">★</div>`,
          iconSize: [12, 12],
          iconAnchor: [6, 6]
      });
      const star = L.marker([lat, lng], {
          icon: starIcon,
          interactive: true,
          pane: PANE_NAME
      });

      const ring = L.circleMarker([lat, lng], {
          radius: 10,
          color: slot.ringColor,
          weight: 2,
          fillOpacity: 0,
          interactive: true,
          pane: PANE_NAME,
          className: 'portal-star-ring'
      });

      const onClick = function(e) {
          if (self.isDeleteMode) {
              L.DomEvent.stop(e);
              self.deleteData(guid);
              self.starLayer.removeLayer(star);
              self.ringLayer.removeLayer(ring);
              delete self.guidToLayers[guid];
          }
      };
      star.on('click', onClick);
      ring.on('click', onClick);

      self.starLayer.addLayer(star);
      self.ringLayer.addLayer(ring);
      self.guidToLayers[guid] = { star, ring };
  };

  self.redrawAll = function() {
      if (!self.ensureInfra()) return;
      self.starLayer.clearLayers();
      self.ringLayer.clearLayers();
      self.guidToLayers = {};

      self.data[1].forEach(record => {
          self.drawMarker(record);
      });
  };

  // --- Function 00050 UI Logic
  self.toggleDeleteMode = function() {
      self.isDeleteMode = !self.isDeleteMode;
      const body = document.body;
      if (self.isDeleteMode) {
          body.classList.add('portal-star-delete-mode');
      } else {
          body.classList.remove('portal-star-delete-mode');
      }
      const btn = $('#ps-btn-delete-mode');
      if (btn.length) {
          btn.text(self.isDeleteMode ? 'Delete Mode: ON' : 'Delete Mode: OFF')
             .toggleClass('active', self.isDeleteMode);
      }
  };

  self.openSettings = function() {
      const html = `
        <div class="portal-star-settings">
          <div style="margin-bottom:8px;">
            記録数: <b>${self.data[1].length}</b>
          </div>

          <table class="ps-slot-table">
            <tr>
              <th>No.</th>
              <th>Target Agent Name</th>
              <th>Star</th>
              <th>Ring</th>
              <th>Set</th>
            </tr>
            ${self.settings.slots.map((slot, i) => `
              <tr>
                <td>${i+1}</td>
                <td><input type="text" class="ps-slot-name" data-idx="${i}" value="${slot.name}" placeholder="AgentName"></td>
                <td><input type="color" class="ps-slot-star" data-idx="${i}" value="${slot.starColor}"></td>
                <td><input type="color" class="ps-slot-ring" data-idx="${i}" value="${slot.ringColor}"></td>
                <td><input type="checkbox" class="ps-slot-active" data-idx="${i}" ${slot.active ? 'checked' : ''}></td>
              </tr>
            `).join('')}
          </table>

          <div class="ps-controls">
            <label>
              Auto-Delete (Days):
              <input type="number" id="ps-auto-delete" value="${self.settings.autoDeleteDays}" style="width:50px;">
              <small>(0 = disabled)</small>
            </label>
             <label>
              <input type="checkbox" id="ps-clear-reload" ${self.settings.clearOnReload ? 'checked' : ''}>
              Clear Visuals on Reload
            </label>
          </div>

          <div class="ps-buttons">
             <button id="ps-btn-export">JSON Export (Backup)</button>
             <button id="ps-btn-import" onclick="document.getElementById('ps-file-input').click()">JSON Import (Restore)</button>
             <input type="file" id="ps-file-input" style="display:none" accept=".json">
             <button id="ps-btn-dedupe">Deduplication (Optimize)</button>
             <button id="ps-btn-delete-mode" class="${self.isDeleteMode?'active':''}">Delete Mode: ${self.isDeleteMode?'ON':'OFF'}</button>
             <button id="ps-btn-clear-markers" class="danger">Clear All Markers</button>
             <button id="ps-btn-clear-logs" class="danger">Clear All Logs</button>
          </div>
        </div>
      `;

      window.dialog({
          html: html,
          id: 'plugin-portal-star-dialog',
          title: 'PortalStar Settings',
          width: 'auto',
          dialogClass: 'ui-dialog-portal-star'
      });

      $('.ps-slot-name').on('change', function() { self.settings.slots[$(this).data('idx')].name = this.value; self.saveSettings(); self.redrawAll(); });
      $('.ps-slot-star').on('change', function() { self.settings.slots[$(this).data('idx')].starColor = this.value; self.saveSettings(); self.redrawAll(); });
      $('.ps-slot-ring').on('change', function() { self.settings.slots[$(this).data('idx')].ringColor = this.value; self.saveSettings(); self.redrawAll(); });
      $('.ps-slot-active').on('change', function() { self.settings.slots[$(this).data('idx')].active = this.checked; self.saveSettings(); self.redrawAll(); });

      $('#ps-auto-delete').on('change', function() { self.settings.autoDeleteDays = parseInt(this.value) || 0; self.saveSettings(); });
      $('#ps-clear-reload').on('change', function() { self.settings.clearOnReload = this.checked; self.saveSettings(); });

      $('#ps-btn-export').on('click', () => self.exportData());
      $('#ps-file-input').on('change', function() { if(this.files[0]) self.importData(this.files[0]); this.value=''; });
      $('#ps-btn-dedupe').on('click', () => { const n = self.deduplicate(); alert(`Deleted ${n} duplicates.`); $('#plugin-portal-star-dialog').dialog('close'); self.openSettings(); });
      $('#ps-btn-delete-mode').on('click', () => self.toggleDeleteMode());

      $('#ps-btn-clear-markers').on('click', () => {
          if(confirm('マーカーを全て消去しますか？ (データは残ります)')) {
              self.starLayer.clearLayers();
              self.ringLayer.clearLayers();
              self.guidToLayers = {};
          }
      });
      $('#ps-btn-clear-logs').on('click', () => {
          if(confirm('ログデータを全て削除しますか？')) {
              self.data[1] = [];
              self.saveData();
              self.redrawAll();
              $('#plugin-portal-star-dialog').dialog('close');
              self.openSettings();
          }
      });
  };

  // --- Function 00060 Core Logic
  self.processPortal = function(guid, p, d) {
      if (!p || !d) return;
      const latlng = p.getLatLng();
      const owner = d.owner || '';
      const mods = (d.mods || []).map(m => m ? m.owner : '');
      const resos = (d.resonators || []).map(r => r ? r.owner : '');
      const title = d.title || '';

      const tempRecord = [null, guid, latlng.lat, latlng.lng, mods, resos, owner, title];
      if (self.getMatchSlot(tempRecord)) {
          self.addData(guid, latlng.lat, latlng.lng, mods, resos, owner, title);
          self.drawMarker(self.data[1][self.data[1].length-1]);
      }
  };

  // --- Function 00070 Hooks & Setup
  self.onPortalSelected = function(data) {
      const guid = data.selectedPortalGuid;
      if (guid) self.queueCheck(guid);
  };

  self.onDetailsUpdated = function(data) {
      const guid = data.guid;
      if (guid) self.queueCheck(guid);
  };

  self.pendingChecks = new Map();
  self.queueCheck = function(guid) {
      if (self.pendingChecks.has(guid)) return;

      const check = () => {
          const p = window.portals[guid];
          const d = window.portalDetail.get(guid);

          if (p && d) {
              self.processPortal(guid, p, d);
              self.pendingChecks.delete(guid);
          } else {
              const attempts = self.pendingChecks.get(guid) || 0;
              if (attempts < 10) {
                  self.pendingChecks.set(guid, attempts + 1);
                  setTimeout(check, 250);
              } else {
                  self.pendingChecks.delete(guid);
              }
          }
      };

      self.pendingChecks.set(guid, 0);
      setTimeout(check, 100);
  };

  self.setup = function() {
      self.loadSettings();
      self.loadData();

      const deleted = self.autoDelete();
      if (deleted > 0) console.log(`PortalStar: Auto-deleted ${deleted} old records.`);

      $('<style>').html(`
        .portal-star-icon { pointer-events: none; font-size: 12px; font-weight: bold; text-shadow: 0 0 2px #000; text-align:center; line-height:12px; }
        .portal-star-ring { pointer-events: none; }
        body.portal-star-delete-mode .portal-star-icon,
        body.portal-star-delete-mode .portal-star-ring { pointer-events: auto !important; cursor: crosshair; }

        .ui-dialog-portal-star { max-width: 600px !important; color: #ddd; background: rgba(0,0,0,0.8); }
        .ps-slot-table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
        .ps-slot-table th, .ps-slot-table td { padding: 4px; border-bottom: 1px solid #444; text-align: center; }
        .ps-slot-name { width: 100%; box-sizing: border-box; background: #222; color: #eee; border: 1px solid #555; }
        .ps-controls { margin-bottom: 10px; padding: 6px; border: 1px solid #444; background: #222; display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
        .ps-buttons { display: flex; flex-direction: column; gap: 5px; }
        .ps-buttons button { padding: 6px; background: #333; color: #eee; border: 1px solid #555; cursor: pointer; }
        .ps-buttons button.active { background: #800; border-color: #f00; }
        .ps-buttons button.danger { color: #f88; }
      `).appendTo('head');

      $('#toolbox').append('<a onclick="window.plugin.portalStar.openSettings();return false;">PortalStar Opt</a>');

      const initMap = setInterval(() => {
          if (window.map && window.L) {
              self.ensureInfra();
              self.redrawAll();
              clearInterval(initMap);
          }
      }, 500);

      window.addHook('portalSelected', self.onPortalSelected);
      window.addHook('portalDetailsUpdated', self.onDetailsUpdated);
  };

  self.setup.info = plugin_info;
  if (!window.bootPlugins) window.bootPlugins = [];
  window.bootPlugins.push(self.setup);
  if (window.iitcLoaded) self.setup();
}

var script = document.createElement('script');
var info = {};
if (typeof GM_info !== 'undefined' && GM_info && GM_info.script) {
  info.script = { version: GM_info.script.version, name: GM_info.script.name, description: GM_info.script.description };
}
script.appendChild(document.createTextNode('(' + wrapper + ')(' + JSON.stringify(info) + ');'));
(document.body || document.head || document.documentElement).appendChild(script);
