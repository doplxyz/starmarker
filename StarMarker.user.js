// ==UserScript==
// @author         DOPPELGENGER,GEMINI3PRO,JULES
// @id             iitc-plugin-star-marker
// @name           IITC plugin: Star Marker
// @category       d.org.addon
// @version        1.1.4
// @description    [1.1.4] 監視ユーザ検知・履歴保存プラグイン
// @namespace      https://github.com/IITC-CE/ingress-intel-total-conversion
// @include        https://intel.ingress.com/*
// @include        https://intel-x.ingress.com/*
// @grant          none
// ==/UserScript==

function wrapper(plugin_info) {
    // ensure plugin framework is there, even if iitc is not yet loaded
    if(typeof window.plugin !== 'function') window.plugin = function() {};

    plugin_info.buildName = 'release';
    plugin_info.dateTimeVersion = '2025-02-25-000000'; // Updated date
    plugin_info.pluginId = 'iitc-plugin-portal-star';

    // -----------------------------------------------------------------------
    // PLUGIN START
    // -----------------------------------------------------------------------

    window.plugin.portalStar = function () {};
    var self = window.plugin.portalStar;

    // Constants
    const KEY_SETTINGS = 'plugin-portalstar-settings';
    const KEY_DATA = 'plugin-portalstar-data';
    const PANE_NAME = 'plugin-portalstar-pane';
    const PANE_ZINDEX = 500; // Lower Z-Index (Shadow Pane level) to be behind portal markers

    // --- Function 00000 Initialize Variables
    self.init = function() {
        self.settings = {
            users: [
                { name: '', starColor: '#ffff00', ringColor: '#ff0000' }, // Yellow Star, Red Ring
                { name: '', starColor: '#ffa500', ringColor: '#0000ff' }, // Orange Star, Blue Ring
                { name: '', starColor: '#008000', ringColor: '#800080' }, // Green Star, Purple Ring
                { name: '', starColor: '#00ffff', ringColor: '#ffc0cb' }, // Cyan Star, Pink Ring
                { name: '', starColor: '#ff00ff', ringColor: '#a52a2a' }  // Magenta Star, Brown Ring
            ],
            autoDeleteDays: 0,
            clearOnReload: false,
            deleteMode: false,
            deduplicate: false, // Default OFF
            starSize: 'normal'  // small, normal, big
        };
        // Data Structure: { guid: [ { ts: <epoch>, lat, lng, title, owner, users: [...] }, ... ] }
        self.data = {};
        self.starLayerGroup = null;
        self.ringLayerGroup = null;
        self.redrawTimer = null;
        self.saveTimer = null;
        self.pendingMarks = new Map();
    };

    // --- Function 00010 Load Settings
    self.loadSettings = function() {
        try {
            var loaded = localStorage.getItem(KEY_SETTINGS);
            if(loaded) {
                var parsed = JSON.parse(loaded);
                $.extend(true, self.settings, parsed);
            }
        } catch(e) {
            console.error('PortalStar: Error loading settings', e);
        }
    };

    // --- Function 00020 Save Settings
    self.saveSettings = function() {
        try {
            localStorage.setItem(KEY_SETTINGS, JSON.stringify(self.settings));
        } catch(e) {
            console.error('PortalStar: Error saving settings', e);
        }
    };

    // --- Function 00030 Load Data
    self.loadData = function() {
        try {
            if (self.settings.clearOnReload) {
                self.data = {};
                self.saveData();
                return;
            }
            var loaded = localStorage.getItem(KEY_DATA);
            if(loaded) {
                self.data = JSON.parse(loaded);
                // Migration check: If old format (Array of 5 elements), convert?
                // Assuming fresh start or compatible structure for now.
                // If the value is not an array (old version had single entry per GUID?), fix it.
                for (var guid in self.data) {
                    if (!Array.isArray(self.data[guid])) {
                        // Old format might be just properties directly? Or array [lat, lng...]
                        // Convert to array of objects
                        if (Array.isArray(self.data[guid]) && typeof self.data[guid][0] === 'number') {
                            // Old format: [lat, lng, title, timestamp, owner]
                            var d = self.data[guid];
                            self.data[guid] = [{
                                ts: d[3], lat: d[0], lng: d[1], title: d[2], owner: d[4], users: [d[4]]
                            }];
                        }
                    }
                }
            }
        } catch(e) {
            console.error('PortalStar: Error loading data', e);
            self.data = {};
        }
    };

    // --- Function 00040 Save Data
    self.saveData = function() {
        try {
            localStorage.setItem(KEY_DATA, JSON.stringify(self.data));
        } catch(e) {
            console.error('PortalStar: Error saving data', e);
        }
        self.updateCount();
    };

    // --- Function 00045 Delayed Save
    self.delayedSave = function() {
        if(self.saveTimer) clearTimeout(self.saveTimer);
        self.saveTimer = setTimeout(function() {
            self.saveData();
            self.saveTimer = null;
        }, 1000);
    };

    // --- Function 00050 Auto Prune Logs
    self.autoPruneLogs = function() {
        if(!self.settings.autoDeleteDays || self.settings.autoDeleteDays <= 0) return;

        var now = new Date().getTime();
        var cutoff = now - (self.settings.autoDeleteDays * 24 * 60 * 60 * 1000);
        var changed = false;

        $.each(self.data, function(guid, logs) {
            var newLogs = logs.filter(function(log) {
                return log.ts >= cutoff;
            });
            if (newLogs.length !== logs.length) {
                if (newLogs.length === 0) delete self.data[guid];
                else self.data[guid] = newLogs;
                changed = true;
            }
        });

        if(changed) {
            self.saveData();
            console.log('PortalStar: Auto-pruned old logs.');
        }
    };

    // --- Function 00080 Add CSS
    self.addCSS = function() {
        $('<style>').prop('type', 'text/css').html(`
            .portalstar-dialog { min-width: 350px; color: #ddd; }
            .portalstar-tabs { display: flex; border-bottom: 1px solid #444; margin-bottom: 10px; }
            .portalstar-tab { padding: 8px 12px; cursor: pointer; border: 1px solid transparent; color: #aaa; flex: 1; text-align: center; }
            .portalstar-tab.active { border: 1px solid #444; border-bottom: 1px solid #0e0e0e; background: #222; color: #ffce00; font-weight: bold; }
            .portalstar-content { display: none; }
            .portalstar-content.active { display: block; }
            .portalstar-row { margin-bottom: 8px; display: flex; align-items: center; }
            .portalstar-label { width: 120px; color: #ddd; }
            .portalstar-input { flex: 1; padding: 4px; background: #333; color: #fff; border: 1px solid #555; }
            .portalstar-btn { padding: 5px 10px; margin-right: 5px; cursor: pointer; background: #444; border: 1px solid #666; color: #fff; }
            .portalstar-btn:hover { background: #555; }
            .portalstar-btn.danger { background: #800; border-color: #a00; }
            .portalstar-preview { width: 20px; height: 20px; border-radius: 50%; display: inline-block; margin-left: 5px; border: 1px solid #fff; }

            /* Star/Ring CSS */
            .portalstar-star-icon, .portalstar-ring { pointer-events: none !important; }
            .portalstar-star-icon { text-align: center; }

            /* Delete Mode */
            body.portalstar-delete-mode .portalstar-star-icon,
            body.portalstar-delete-mode .portalstar-ring { pointer-events: auto !important; cursor: crosshair; }

            /* Viewer Table */
            .portalstar-log-table { width: 100%; border-collapse: collapse; font-size: 11px; }
            .portalstar-log-table th, .portalstar-log-table td { border: 1px solid #444; padding: 4px; text-align: left; vertical-align: top; }
            .portalstar-log-table th { background: #222; color: #fff; }
        `).appendTo('head');
    };

    // --- Function 00090 Update Toolbox
    self.updateToolbox = function() {
        if($('#portalstar-toolbox-link').length === 0) {
            $('#toolbox').append('<a id="portalstar-toolbox-link" onclick="window.plugin.portalStar.openSettings();return false;">PortalStar</a>');
        }

        if($('#portalstar-status').length === 0) {
            $('#sidebar').prepend('<div id="portalstar-status" style="padding:5px; border-bottom:1px solid #444; color:#ffce00;">' +
                'PortalStar: <span id="portalstar-count">0</span> 件 ' +
                '<label style="margin-left:10px;"><input type="checkbox" id="portalstar-delete-mode" onchange="window.plugin.portalStar.toggleDeleteMode()"> 削除モード</label>' +
                '</div>');
        }

        self.updateCount();
        $('#portalstar-delete-mode').prop('checked', self.settings.deleteMode);
    };

    self.updateCount = function() {
        var count = Object.keys(self.data).length;
        $('#portalstar-count').text(count);
    };

    // --- Function 00100 Toggle Delete Mode
    self.toggleDeleteMode = function() {
        self.settings.deleteMode = $('#portalstar-delete-mode').prop('checked');
        self.saveSettings();

        if (self.settings.deleteMode) {
            $(document.body).addClass('portalstar-delete-mode');
        } else {
            $(document.body).removeClass('portalstar-delete-mode');
        }
    };

    // --- Function 00110 Open Settings
    self.openSettings = function() {
        var html = '<div class="portalstar-dialog">';

        // Tabs
        html += '<div class="portalstar-tabs">';
        html += '<div class="portalstar-tab active" onclick="window.plugin.portalStar.switchTab(\'general\')">一般</div>';
        for(var i=0; i<5; i++) {
            html += '<div class="portalstar-tab" onclick="window.plugin.portalStar.switchTab(\'user'+i+'\')">User '+(i+1)+'</div>';
        }
        html += '</div>';

        // General Tab
        html += '<div id="portalstar-tab-general" class="portalstar-content active">';
        html += '<div class="portalstar-row"><label><input type="checkbox" id="ps-clear-reload" ' + (self.settings.clearOnReload ? 'checked' : '') + '> リロードでクリア</label></div>';
        html += '<div class="portalstar-row"><label><input type="checkbox" id="ps-deduplicate" ' + (self.settings.deduplicate ? 'checked' : '') + '> 重複データ整理 (最新のみ残す)</label></div>';
        html += '<div class="portalstar-row"><span class="portalstar-label">保存期間(日):</span><input type="number" id="ps-auto-prune" class="portalstar-input" value="' + self.settings.autoDeleteDays + '"></div>';

        html += '<div class="portalstar-row"><span class="portalstar-label">スターサイズ:</span>';
        html += '<select id="ps-star-size" class="portalstar-input">';
        html += '<option value="small" ' + (self.settings.starSize === 'small' ? 'selected' : '') + '>小 (Small)</option>';
        html += '<option value="normal" ' + (self.settings.starSize === 'normal' ? 'selected' : '') + '>中 (Normal)</option>';
        html += '<option value="big" ' + (self.settings.starSize === 'big' ? 'selected' : '') + '>大 (Big)</option>';
        html += '</select></div>';

        html += '<div style="border-top:1px solid #444; padding-top:10px; margin-top:10px;">';
        html += '<button class="portalstar-btn" onclick="window.plugin.portalStar.openViewer()">データ表示</button>';
        html += '<button class="portalstar-btn danger" onclick="window.plugin.portalStar.clearAllData()">全データ削除</button>';
        html += '</div>';

        html += '<div style="border-top:1px solid #444; padding-top:10px; margin-top:10px;">';
        html += '<button class="portalstar-btn" onclick="window.plugin.portalStar.exportData()">JSONエクスポート</button>';
        html += '<button class="portalstar-btn" onclick="$(\'#ps-import-file\').click()">JSONインポート</button>';
        html += '<input type="file" id="ps-import-file" style="display:none" onchange="window.plugin.portalStar.importData(this)">';
        html += '</div>';

        html += '<div style="margin-top:15px; font-size:0.8em; text-align:right; color:#666;">Ver 1.1.4</div>';
        html += '</div>';

        // User Tabs
        for(var i=0; i<5; i++) {
            var u = self.settings.users[i];
            html += '<div id="portalstar-tab-user'+i+'" class="portalstar-content">';
            html += '<div class="portalstar-row"><span class="portalstar-label">ユーザ名:</span><input type="text" id="ps-user-'+i+'-name" class="portalstar-input" value="' + (u.name || '') + '"></div>';
            html += '<div class="portalstar-row"><span class="portalstar-label">スター色:</span><input type="color" id="ps-user-'+i+'-star" value="' + (u.starColor || '#ffff00') + '"></div>';
            html += '<div class="portalstar-row"><span class="portalstar-label">リング色:</span><input type="color" id="ps-user-'+i+'-ring" value="' + (u.ringColor || '#ff0000') + '"></div>';
            html += '<div style="margin-top:10px; color:#aaa; font-size:0.9em;">正確なエージェント名を入力してください(大文字小文字区別)。</div>';
            html += '</div>';
        }

        html += '</div>';

        window.dialog({
            html: html,
            id: 'plugin-portalstar-settings',
            title: 'PortalStar 設定',
            width: 'auto',
            closeCallback: function() {
                self.saveSettingsFromUI();
            }
        });
    };

    // --- Function 00120 Switch Tab
    self.switchTab = function(tabName) {
        $('.portalstar-tab').removeClass('active');
        $('.portalstar-content').removeClass('active');

        var index = -1;
        if(tabName === 'general') index = 0;
        else index = parseInt(tabName.replace('user', '')) + 1;

        $('.portalstar-tab').eq(index).addClass('active');
        $('#portalstar-tab-' + tabName).addClass('active');
    };

    // --- Function 00130 Save Settings From UI
    self.saveSettingsFromUI = function() {
        self.settings.clearOnReload = $('#ps-clear-reload').prop('checked');
        self.settings.deduplicate = $('#ps-deduplicate').prop('checked');
        self.settings.autoDeleteDays = parseInt($('#ps-auto-prune').val()) || 0;
        self.settings.starSize = $('#ps-star-size').val();

        for(var i=0; i<5; i++) {
            self.settings.users[i].name = $('#ps-user-'+i+'-name').val().trim();
            self.settings.users[i].starColor = $('#ps-user-'+i+'-star').val();
            self.settings.users[i].ringColor = $('#ps-user-'+i+'-ring').val();
        }

        self.saveSettings();
        self.updateToolbox();
        self.redrawAllMarkers();
    };

    // --- Function 00140 Clear All Data
    self.clearAllData = function() {
        if(confirm('本当に全ての記録データを削除しますか？')) {
            self.data = {};
            self.saveData();
            self.redrawAllMarkers();
            alert('全データを削除しました。');
            self.updateToolbox();
        }
    };

    // --- Function 00150 Setup Layers (Renamed/Refactored for Robustness)
    self.ensureMarkerInfra = function() {
        if (!window.map || !window.L) return false;

        // Ensure Pane
        if (!map.getPane(PANE_NAME)) {
            map.createPane(PANE_NAME);
            var pane = map.getPane(PANE_NAME);
            pane.style.pointerEvents = 'none'; // Default non-interactive
            pane.style.zIndex = PANE_ZINDEX;
        }

        // Initialize Layer Groups if needed
        if (!self.starLayerGroup) {
            self.starLayerGroup = new L.LayerGroup();
        }
        if (!self.ringLayerGroup) {
            self.ringLayerGroup = new L.LayerGroup();
        }

        return true;
    };

    // --- Function 00160 Draw Marker
    self.drawMarker = function(guid, lat, lng, usersFound) {
        if (!usersFound || !Array.isArray(usersFound)) return;

        // Priority: User 1 > User 5
        var userConfig = null;
        var usersFoundLower = usersFound.map(function(u){ return (u || '').toLowerCase(); });

        for(var i=0; i<self.settings.users.length; i++) {
            var u = self.settings.users[i];
            var settingName = (u.name || '').trim().toLowerCase();
            if(settingName && usersFoundLower.indexOf(settingName) !== -1) {
                userConfig = u;
                break; // Stop at highest priority
            }
        }

        if(!userConfig) return;

        var latlng = L.latLng(lat, lng);

        // Draw Ring
        if(self.ringLayerGroup) {
            var ring = L.circleMarker(latlng, {
                radius: 10, // Fixed radius for now
                color: userConfig.ringColor,
                fill: false,
                fillOpacity: 0,
                weight: 2,
                pane: PANE_NAME,
                className: 'portalstar-ring', // Ensure CSS pointer-events works
                interactive: true // Handle click via delete mode logic
            });

            // Fallback for older Leaflet versions that don't support className option on circleMarker
            if (ring._path) {
                try {
                    L.DomUtil.addClass(ring._path, 'portalstar-ring');
                } catch(e) {
                    ring._path.classList.add('portalstar-ring');
                }
            }

            ring.on('click', function(e) {
                if(self.settings.deleteMode) {
                    L.DomEvent.stop(e);
                    self.deletePortalData(guid);
                }
            });

            self.ringLayerGroup.addLayer(ring);
        }

        // Draw Star
        if(self.starLayerGroup) {
            var sizePx = 24;
            var anchorPx = 12;
            if (self.settings.starSize === 'small') { sizePx = 12; anchorPx = 6; }
            if (self.settings.starSize === 'big') { sizePx = 36; anchorPx = 18; }

            var starIcon = L.divIcon({
                className: 'portalstar-star-icon',
                html: '<div style="color:' + userConfig.starColor + '; font-size:'+sizePx+'px; text-shadow:0 0 3px black; line-height:1;">★</div>',
                iconSize: [sizePx, sizePx],
                iconAnchor: [anchorPx, anchorPx]
            });

            var star = L.marker(latlng, {
                icon: starIcon,
                interactive: true,
                pane: PANE_NAME,
                keyboard: false
            });

            star.on('click', function(e) {
                if(self.settings.deleteMode) {
                    L.DomEvent.stop(e);
                    self.deletePortalData(guid);
                }
            });

            self.starLayerGroup.addLayer(star);
        }
    };

    self.deletePortalData = function(guid) {
        if(self.data[guid]) {
            delete self.data[guid];
            self.saveData();
            self.redrawAllMarkers();
            // Feedback
            if(window.chat) window.chat.addNickname('PortalStar: 削除しました ' + guid);
        }
    };

    // --- Function 00170 Redraw All Markers
    self.redrawAllMarkers = function() {
        if(!self.starLayerGroup || !self.ringLayerGroup) return;

        self.starLayerGroup.clearLayers();
        self.ringLayerGroup.clearLayers();

        $.each(self.data, function(guid, logs) {
            if(!logs || logs.length === 0) return;
            // Use the LATEST log entry for display
            var latest = logs[logs.length - 1];
            if(latest) {
                self.drawMarker(guid, latest.lat, latest.lng, latest.users);
            }
        });
    };

    self.delayedRedraw = function() {
        if(self.redrawTimer) clearTimeout(self.redrawTimer);
        self.redrawTimer = setTimeout(function() {
            self.redrawAllMarkers();
            self.redrawTimer = null;
        }, 500);
    };

    // --- Function 00180 Detection Logic
    self.isDetailsReady = function(d) {
        if (!d) return false;
        // Stricter check (from Android Mini plugin)
        var hasMods = Array.isArray(d.mods) && d.mods.filter(Boolean).length > 0;
        var hasReso = Array.isArray(d.resonators) && d.resonators.filter(Boolean).some(function(r) { return r && r.owner; });
        return hasMods || hasReso;
    };

    self.processPortal = function(guid) {
        if (!guid) return;
        var p = window.portals[guid];
        var d = window.portalDetail.get(guid) || (p && p.options.data);

        if (!d || !self.isDetailsReady(d)) return;

        // Scrape Owners
        var userSet = new Set();
        if (d.owner) userSet.add(d.owner);
        if (d.mods) {
            d.mods.forEach(function(m) {
                if(m && m.owner) userSet.add(m.owner);
            });
        }
        if (d.resonators) {
            d.resonators.forEach(function(r) {
                if(r && r.owner) userSet.add(r.owner);
            });
        }

        var currentUsers = Array.from(userSet).sort();
        if (currentUsers.length === 0) return;

        // Case-Insensitive Check
        var currentUsersLower = new Set(currentUsers.map(function(u){ return u.toLowerCase(); }));
        var watchedFound = false;

        for(var i=0; i<self.settings.users.length; i++) {
            var settingName = (self.settings.users[i].name || '').trim().toLowerCase();
            if(settingName && currentUsersLower.has(settingName)) {
                watchedFound = true;
                break;
            }
        }

        if(!watchedFound) {
            if(self.data[guid]) {
                delete self.data[guid];
                self.saveData();
                self.deletePortalData(guid);
            }
            return;
        }

        // Coordinate Extraction (Robust)
        var lat = (p && p.getLatLng) ? p.getLatLng().lat : (d.latE6 ? d.latE6/1E6 : NaN);
        var lng = (p && p.getLatLng) ? p.getLatLng().lng : (d.lngE6 ? d.lngE6/1E6 : NaN);

        if (isNaN(lat) || isNaN(lng)) {
             // Abort if no valid coordinates (cannot draw marker)
            return;
        }

        var title = d.title || 'Untitled';
        var now = new Date().getTime();

        // Prepare new log entry
        var newEntry = {
            ts: now,
            lat: lat,
            lng: lng,
            title: title,
            owner: d.owner || '',
            users: currentUsers
        };

        // Storage & Deduplication Logic
        if (!self.data[guid]) self.data[guid] = [];
        var logs = self.data[guid];

        if (self.settings.deduplicate && logs.length > 0) {
            var lastLog = logs[logs.length - 1];
            // Compare users
            if (JSON.stringify(lastLog.users) === JSON.stringify(currentUsers)) {
                // Same users as last time. Update the last log to "Now".
                // Keep the LATEST data.
                logs[logs.length - 1] = newEntry;
            } else {
                logs.push(newEntry);
            }
        } else {
            logs.push(newEntry);
        }

        self.delayedSave();
        self.delayedRedraw();
    };

    self.queueCheck = function(guid) {
        if (!guid) return;
        if (self.pendingMarks.has(guid)) return; // Already queued

        var tries = 0;
        var maxTries = 10;
        var interval = 250;

        var check = function() {
            var p = window.portals[guid];
            var d = window.portalDetail.get(guid) || (p && p.options.data);

            if (d && self.isDetailsReady(d)) {
                self.pendingMarks.delete(guid);
                self.processPortal(guid);
            } else {
                tries++;
                if (tries < maxTries) {
                    setTimeout(check, interval);
                } else {
                    self.pendingMarks.delete(guid);
                }
            }
        };

        self.pendingMarks.set(guid, true);
        setTimeout(check, 100); // Initial delay
    };

    // Hooks
    self.onPortalSelected = function(data) {
        const guid = data?.selectedPortalGuid || window.selectedPortal;
        if (guid) self.queueCheck(guid);
    };

    self.onDetailsUpdated = function(data) {
        const guid = data?.guid || data?.details?.guid || window.selectedPortal;
        if (guid) self.queueCheck(guid);
    };

    // --- Function 00190 Viewer
    self.openViewer = function() {
        var html = '<div style="height: 400px; overflow-y: auto;">';
        html += '<table class="portalstar-log-table">';
        html += '<thead><tr><th>日時</th><th>ポータル名</th><th>検知ユーザ</th></tr></thead>';
        html += '<tbody>';

        // Flatten data for viewing
        var allLogs = [];
        $.each(self.data, function(guid, logs) {
            logs.forEach(function(l) {
                allLogs.push({ guid: guid, log: l });
            });
        });

        // Sort by Date Descending
        allLogs.sort(function(a, b) {
            return b.log.ts - a.log.ts;
        });

        allLogs.forEach(function(item) {
            var d = new Date(item.log.ts);
            var dateStr = d.getFullYear() + '/' +
                          ('0' + (d.getMonth() + 1)).slice(-2) + '/' +
                          ('0' + d.getDate()).slice(-2) + ' ' +
                          ('0' + d.getHours()).slice(-2) + ':' +
                          ('0' + d.getMinutes()).slice(-2) + ':' +
                          ('0' + d.getSeconds()).slice(-2);

            html += '<tr>';
            html += '<td style="white-space:nowrap;">' + dateStr + '</td>';
            html += '<td>' + (item.log.title || 'Unknown') + '</td>';
            html += '<td>' + (item.log.users ? item.log.users.join(', ') : '') + '</td>';
            html += '</tr>';
        });

        html += '</tbody></table></div>';

        window.dialog({
            html: html,
            title: 'PortalStar ログ表示',
            width: 500,
            dialogClass: 'ui-dialog-portalstar'
        });
    };

    // --- Function 00200 Export
    self.exportData = function() {
        var exportList = [];
        $.each(self.data, function(guid, logs) {
            logs.forEach(function(l) {
                var d = new Date(l.ts);
                var dateStr = d.getFullYear() + '/' +
                              ('0' + (d.getMonth() + 1)).slice(-2) + '/' +
                              ('0' + d.getDate()).slice(-2) + ' ' +
                              ('0' + d.getHours()).slice(-2) + ':' +
                              ('0' + d.getMinutes()).slice(-2) + ':' +
                              ('0' + d.getSeconds()).slice(-2);

                exportList.push({
                    date: dateStr,
                    guid: guid,
                    title: l.title,
                    lat: l.lat,
                    lng: l.lng,
                    owner: l.owner,
                    users: l.users
                });
            });
        });

        var json = JSON.stringify(exportList, null, 2);
        var blob = new Blob([json], {type: 'application/json'});
        var url = URL.createObjectURL(blob);

        var now = new Date();
        var filename = 'StarMarker_' +
                       now.getFullYear() +
                       ('0' + (now.getMonth() + 1)).slice(-2) +
                       ('0' + now.getDate()).slice(-2) + '_' +
                       ('0' + now.getHours()).slice(-2) +
                       ('0' + now.getMinutes()).slice(-2) + '.json';

        var a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(function() {
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        }, 0);
    };

    // --- Function 00210 Import
    self.importData = function(elem) {
        if(!elem.files || !elem.files[0]) return;
        var file = elem.files[0];
        var reader = new FileReader();

        reader.onload = function(e) {
            try {
                var imported = JSON.parse(e.target.result);
                if(!Array.isArray(imported)) throw new Error('Invalid JSON');

                var count = 0;
                imported.forEach(function(item) {
                    // item: { date, guid, title, lat, lng, owner, users }
                    // Convert date string back to TS if possible, or just use current time if missing?
                    // Expected format: YYYY/MM/DD HH:mm:ss
                    if (!item.guid || !item.date) return;

                    var ts = new Date(item.date).getTime();
                    if (isNaN(ts)) ts = new Date().getTime(); // Fallback

                    var guid = item.guid;
                    if (!self.data[guid]) self.data[guid] = [];

                    // Check for duplicate log
                    var exists = self.data[guid].some(function(l) {
                        return l.ts === ts && JSON.stringify(l.users) === JSON.stringify(item.users);
                    });

                    if (!exists) {
                        self.data[guid].push({
                            ts: ts,
                            lat: item.lat,
                            lng: item.lng,
                            title: item.title,
                            owner: item.owner,
                            users: item.users || []
                        });
                        count++;
                    }
                });

                // Sort logs by time after import
                $.each(self.data, function(guid, logs) {
                    logs.sort(function(a, b) { return a.ts - b.ts; });
                });

                self.saveData();
                self.redrawAllMarkers();
                alert('インポート完了: ' + count + '件追加');

            } catch(err) {
                console.error(err);
                alert('インポート失敗: ' + err.message);
            }
        };
        reader.readAsText(file);
        elem.value = '';
    };

    // --- Function 00220 Setup
    var setup = function () {
        self.init();
        self.addCSS();
        self.loadSettings();
        self.loadData();
        self.autoPruneLogs();

        // Retry Loop for Map/Layer Initialization
        var tries = 0;
        var initTimer = setInterval(function() {
            tries++;
            if (self.ensureMarkerInfra()) {
                clearInterval(initTimer);

                // Add Layers
                if (window.layerChooser) {
                    window.layerChooser.addOverlay(self.starLayerGroup, 'PortalStar Stars');
                    window.layerChooser.addOverlay(self.ringLayerGroup, 'PortalStar Rings');
                } else {
                    map.addLayer(self.starLayerGroup);
                    map.addLayer(self.ringLayerGroup);
                }

                self.toggleDeleteMode(); // Set initial pointer-events state
                self.redrawAllMarkers();
            } else if (tries >= 20) {
                clearInterval(initTimer);
                console.warn('PortalStar: Failed to initialize map layers (timeout).');
            }
        }, 500);

        // UI Injection Retry
        var uiTries = 0;
        var uiTimer = setInterval(function() {
            if ($('#toolbox').length > 0) {
                self.updateToolbox();
                if ($('#portalstar-toolbox-link').length > 0) {
                    clearInterval(uiTimer);
                }
            }
            uiTries++;
            if (uiTries >= 20) clearInterval(uiTimer);
        }, 500);

        // Register Hooks
        window.addHook('portalSelected', self.onPortalSelected);
        window.addHook('portalDetailsUpdated', self.onDetailsUpdated);

        console.log('PortalStar: Initialized');
    };

    setup.info = plugin_info;
    if(!window.bootPlugins) window.bootPlugins = [];
    window.bootPlugins.push(setup);
    if(window.iitcLoaded && typeof setup === 'function') setup();
}

var script = document.createElement('script');
var info = {};
if (typeof GM_info !== 'undefined' && GM_info && GM_info.script) info.script = { version: GM_info.script.version, name: GM_info.script.name, description: GM_info.script.description };
script.appendChild(document.createTextNode('('+ wrapper +')('+JSON.stringify(info)+');'));
(document.body || document.head || document.documentElement).appendChild(script);
