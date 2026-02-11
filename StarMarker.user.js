// ==UserScript==
// @author         IITC User
// @name           IITC plugin: Star Marker
// @category       Layer
// @version        1.0.0
// @description    [1.0.0]A brief description of the plugin
// @id             star-marker
// @namespace      https://github.com/IITC-CE/ingress-intel-total-conversion
// @match          https://intel.ingress.com/*
// @match          https://intel-x.ingress.com/*
// @grant          none
// ==/UserScript==

function wrapper(plugin_info) {
// ensure plugin framework is there, even if iitc is not yet loaded
if(typeof window.plugin !== 'function') window.plugin = function() {};

plugin_info.buildName = 'release';
plugin_info.dateTimeVersion = '2025-05-20-000000'; // Placeholder date
plugin_info.pluginId = 'star-marker';

// -----------------------------------------------------------------------
// PLUGIN START
// -----------------------------------------------------------------------

window.plugin.starMarker = function () {};
var self = window.plugin.starMarker;

// Constants
const KEY_SETTINGS = 'plugin-starmarker-settings';
const KEY_DATA = 'plugin-starmarker-data';

// --- Function 00000 Initialize Variables
self.init = function() {
    self.settings = {
        users: [
            { name: '', starColor: 'yellow', ringColor: 'red' },
            { name: '', starColor: 'orange', ringColor: 'blue' },
            { name: '', starColor: 'green', ringColor: 'purple' },
            { name: '', starColor: 'cyan', ringColor: 'pink' },
            { name: '', starColor: 'magenta', ringColor: 'brown' }
        ],
        autoDeleteDays: 0,
        clearOnReload: false,
        deleteMode: false
    };
    self.data = {}; // Stored by GUID: [lat, lng, title, timestamp, ownerName]
    self.starLayerGroup = null;
    self.ringLayerGroup = null;
    self.redrawTimer = null;
    self.saveTimer = null;
};

// --- Function 00010 Load Settings
self.loadSettings = function() {
    try {
        var loaded = localStorage.getItem(KEY_SETTINGS);
        if(loaded) {
            var parsed = JSON.parse(loaded);
            // Merge defaults to ensure new fields exist
            $.extend(true, self.settings, parsed);
        }
    } catch(e) {
        console.error('Star Marker: Error loading settings', e);
    }
};

// --- Function 00020 Save Settings
self.saveSettings = function() {
    try {
        localStorage.setItem(KEY_SETTINGS, JSON.stringify(self.settings));
    } catch(e) {
        console.error('Star Marker: Error saving settings', e);
    }
};

// --- Function 00030 Load Data
self.loadData = function() {
    try {
        var loaded = localStorage.getItem(KEY_DATA);
        if(loaded) {
            self.data = JSON.parse(loaded);
        }
    } catch(e) {
        console.error('Star Marker: Error loading data', e);
    }
};

// --- Function 00040 Save Data
self.saveData = function() {
    try {
        localStorage.setItem(KEY_DATA, JSON.stringify(self.data));
    } catch(e) {
        console.error('Star Marker: Error saving data', e);
    }
    // Update UI count if element exists
    if($('#starmarker-count').length) {
        $('#starmarker-count').text(Object.keys(self.data).length);
    }
};

// --- Function 00045 Delayed Save
self.delayedSave = function() {
    if(self.saveTimer) clearTimeout(self.saveTimer);
    self.saveTimer = setTimeout(function() {
        self.saveData();
        self.saveTimer = null;
    }, 1000); // 1 sec delay
};

// --- Function 00050 Auto Prune Logs
self.autoPruneLogs = function() {
    if(!self.settings.autoDeleteDays || self.settings.autoDeleteDays <= 0) return;

    var now = new Date().getTime();
    var cutoff = now - (self.settings.autoDeleteDays * 24 * 60 * 60 * 1000);
    var changed = false;

    $.each(self.data, function(guid, details) {
        // details format: [lat, lng, title, timestamp, ownerName]
        var ts = details[3];
        if(ts < cutoff) {
            delete self.data[guid];
            changed = true;
        }
    });

    if(changed) {
        self.saveData();
        console.log('Star Marker: Auto-pruned old logs.');
    }
};

// --- Function 00060 Deduplicate Data
self.deduplicateData = function() {
    // Since we use GUID as key, exact duplicates are impossible in storage structure.
    // This function will look for entries with same lat/lng/owner but different GUIDs (if that happens?)
    // Or just same Lat/Lng.
    // Requirement (16): "Completely duplicate data deletion optimization button"
    // Since key is GUID, maybe it means same Lat/Lng/Owner?
    // Portals can move, but GUID stays same.
    // If GUID is same, it overwrites.
    // So "Duplicate" might mean: Entries that are identical in content?
    // Let's assume it cleans up entries that might be stale or invalid.
    // For now, let's just re-save to ensure clean JSON.
    // Or, remove entries where Owner is not in the watched list?
    // "Updates without info update might accumulate same info" -> But we overwrite by GUID.
    // Maybe they mean if multiple GUIDs refer to same physical portal (very rare/impossible)?
    // Or maybe the user *thinks* they are duplicates.
    // I'll implement a cleanup that removes entries without valid coordinates or owner.

    var initialCount = Object.keys(self.data).length;
    var validOwners = self.settings.users.map(function(u) { return u.name; }).filter(function(n) { return n; });

    // Optional: Remove entries for users no longer watched?
    // The requirement says "Complete duplicate data deletion".
    // I will interpret this as "Compact the database".

    // Actually, if I imported data, I might have multiple entries for same location if GUID changed?
    // Let's iterate and check for coordinate duplicates.
    var coordMap = {};
    var toDelete = [];

    $.each(self.data, function(guid, details) {
        var key = details[0].toFixed(6) + ',' + details[1].toFixed(6) + ',' + details[4]; // Lat,Lng,Owner
        if(coordMap[key]) {
            // Duplicate found (same location, same owner, different GUID?)
            // Keep the newer one.
            if(details[3] > coordMap[key].ts) {
                toDelete.push(coordMap[key].guid);
                coordMap[key] = { guid: guid, ts: details[3] };
            } else {
                toDelete.push(guid);
            }
        } else {
            coordMap[key] = { guid: guid, ts: details[3] };
        }
    });

    toDelete.forEach(function(guid) {
        delete self.data[guid];
    });

    if(toDelete.length > 0) {
        self.saveData();
        alert('Star Marker: Removed ' + toDelete.length + ' duplicates.');
    } else {
        alert('Star Marker: No duplicates found.');
    }
};

// --- Function 00080 Add CSS
self.addCSS = function() {
    $('<style>').prop('type', 'text/css').html(`
        .starmarker-dialog { min-width: 300px; }
        .starmarker-tabs { display: flex; border-bottom: 1px solid #444; margin-bottom: 10px; }
        .starmarker-tab { padding: 8px 12px; cursor: pointer; border: 1px solid transparent; color: #aaa; }
        .starmarker-tab.active { border: 1px solid #444; border-bottom: 1px solid #0e0e0e; background: #222; color: #ffce00; font-weight: bold; }
        .starmarker-content { display: none; }
        .starmarker-content.active { display: block; }
        .starmarker-row { margin-bottom: 8px; display: flex; align-items: center; }
        .starmarker-label { width: 100px; color: #ddd; }
        .starmarker-input { flex: 1; padding: 4px; background: #333; color: #fff; border: 1px solid #555; }
        .starmarker-btn { padding: 5px 10px; margin-right: 5px; cursor: pointer; background: #444; border: 1px solid #666; color: #fff; }
        .starmarker-btn:hover { background: #555; }
        .starmarker-btn.danger { background: #800; border-color: #a00; }
        .starmarker-btn.success { background: #080; border-color: #0a0; }
        .starmarker-preview { width: 20px; height: 20px; border-radius: 50%; display: inline-block; margin-left: 5px; border: 1px solid #fff; }
    `).appendTo('head');
};

// --- Function 00090 Update Toolbox
self.updateToolbox = function() {
    // Add link to settings
    if($('#starmarker-toolbox-link').length === 0) {
        $('#toolbox').append('<a id="starmarker-toolbox-link" onclick="window.plugin.starMarker.openSettings();return false;">Star Marker</a>');
    }

    // Add count display
    // Requirement (1): Maintain record count display
    if($('#starmarker-status').length === 0) {
        // Create a small status area in sidebar or append to toolbox link?
        // Let's put it in sidebar
        $('#sidebar').prepend('<div id="starmarker-status" style="padding:5px; border-bottom:1px solid #444; color:#ffce00;">' +
            'Star Marker: <span id="starmarker-count">0</span> records ' +
            '<label style="margin-left:10px;"><input type="checkbox" id="starmarker-delete-mode" onchange="window.plugin.starMarker.toggleDeleteMode()"> Del Mode</label>' +
            '</div>');
    }

    // Update count
    $('#starmarker-count').text(Object.keys(self.data).length);

    // Update delete mode checkbox
    $('#starmarker-delete-mode').prop('checked', self.settings.deleteMode);
};

// --- Function 00100 Toggle Delete Mode
self.toggleDeleteMode = function() {
    self.settings.deleteMode = $('#starmarker-delete-mode').prop('checked');
    self.saveSettings();
    // Re-draw or update interactivity will be handled in map logic
    if(self.updateLayerInteractivity) {
        self.updateLayerInteractivity();
    }
};

// --- Function 00110 Open Settings
self.openSettings = function() {
    var html = '<div class="starmarker-dialog">';

    // Tabs
    html += '<div class="starmarker-tabs">';
    html += '<div class="starmarker-tab active" onclick="window.plugin.starMarker.switchTab(\'general\')">General</div>';
    for(var i=0; i<5; i++) {
        html += '<div class="starmarker-tab" onclick="window.plugin.starMarker.switchTab(\'user'+i+'\')">User '+(i+1)+'</div>';
    }
    html += '</div>';

    // General Tab
    html += '<div id="starmarker-tab-general" class="starmarker-content active">';
    html += '<div class="starmarker-row"><label><input type="checkbox" id="sm-clear-reload" ' + (self.settings.clearOnReload ? 'checked' : '') + '> Clear stars on page reload</label></div>';
    html += '<div class="starmarker-row"><span class="starmarker-label">Auto Prune (Days):</span><input type="number" id="sm-auto-prune" class="starmarker-input" value="' + self.settings.autoDeleteDays + '"></div>';
    html += '<div style="font-size:0.8em; color:#888; margin-bottom:10px;">(0 = Disabled)</div>';

    html += '<div style="border-top:1px solid #444; padding-top:10px; margin-top:10px;">';
    html += '<button class="starmarker-btn" onclick="window.plugin.starMarker.deduplicateData()">Optimize/Dedup</button>';
    html += '<button class="starmarker-btn danger" onclick="window.plugin.starMarker.clearAllData()">Clear All Data</button>';
    html += '</div>';

    html += '<div style="border-top:1px solid #444; padding-top:10px; margin-top:10px;">';
    html += '<button class="starmarker-btn" onclick="window.plugin.starMarker.exportData()">Export JSON</button>';
    html += '<button class="starmarker-btn" onclick="$(\'#sm-import-file\').click()">Import JSON</button>';
    html += '<input type="file" id="sm-import-file" style="display:none" onchange="window.plugin.starMarker.importData(this)">';
    html += '</div>';

    html += '<div style="margin-top:15px; font-size:0.8em; text-align:right; color:#666;">Ver 1.0.0</div>';
    html += '</div>';

    // User Tabs
    for(var i=0; i<5; i++) {
        var u = self.settings.users[i];
        html += '<div id="starmarker-tab-user'+i+'" class="starmarker-content">';
        html += '<div class="starmarker-row"><span class="starmarker-label">Username:</span><input type="text" id="sm-user-'+i+'-name" class="starmarker-input" value="' + (u.name || '') + '"></div>';
        html += '<div class="starmarker-row"><span class="starmarker-label">Star Color:</span><input type="text" id="sm-user-'+i+'-star" class="starmarker-input" value="' + (u.starColor || '') + '"><div class="starmarker-preview" style="background:'+u.starColor+'"></div></div>';
        html += '<div class="starmarker-row"><span class="starmarker-label">Ring Color:</span><input type="text" id="sm-user-'+i+'-ring" class="starmarker-input" value="' + (u.ringColor || '') + '"><div class="starmarker-preview" style="background:'+u.ringColor+'"></div></div>';
        html += '<div style="margin-top:10px; color:#aaa; font-size:0.9em;">Enter exact ingress agent name (case sensitive).</div>';
        html += '</div>';
    }

    html += '</div>'; // End dialog div

    window.dialog({
        html: html,
        id: 'plugin-starmarker-settings',
        title: 'Star Marker Settings',
        width: 'auto',
        closeCallback: function() {
            self.saveSettingsFromUI();
        }
    });
};

// --- Function 00120 Switch Tab
self.switchTab = function(tabName) {
    $('.starmarker-tab').removeClass('active');
    $('.starmarker-content').removeClass('active');

    // Find the clicked tab element by iterating or just logic
    // Actually standard helper:
    var index = -1;
    if(tabName === 'general') index = 0;
    else index = parseInt(tabName.replace('user', '')) + 1;

    $('.starmarker-tab').eq(index).addClass('active');
    $('#starmarker-tab-' + tabName).addClass('active');
};

// --- Function 00130 Save Settings From UI
self.saveSettingsFromUI = function() {
    self.settings.clearOnReload = $('#sm-clear-reload').prop('checked');
    self.settings.autoDeleteDays = parseInt($('#sm-auto-prune').val()) || 0;

    for(var i=0; i<5; i++) {
        self.settings.users[i].name = $('#sm-user-'+i+'-name').val().trim();
        self.settings.users[i].starColor = $('#sm-user-'+i+'-star').val().trim();
        self.settings.users[i].ringColor = $('#sm-user-'+i+'-ring').val().trim();
    }

    self.saveSettings();
    self.updateToolbox(); // Update delete mode state if changed (though handled by toggleDeleteMode)

    // Refresh markers if colors/users changed
    if(self.redrawAllMarkers) self.redrawAllMarkers();
};

// --- Function 00140 Clear All Data
self.clearAllData = function() {
    if(confirm('Are you sure you want to delete ALL recorded data?')) {
        self.data = {};
        self.saveData();
        if(self.redrawAllMarkers) self.redrawAllMarkers();
        alert('All data cleared.');
        self.updateToolbox();
    }
};

// --- Function 00150 Setup Layers
self.setupLayers = function() {
    self.starLayerGroup = new L.LayerGroup();
    self.ringLayerGroup = new L.LayerGroup();

    window.addLayerGroup('Star Marker Stars', self.starLayerGroup, true);
    window.addLayerGroup('Star Marker Rings', self.ringLayerGroup, true);

    // Initial draw
    self.redrawAllMarkers();
};

// --- Function 00160 Draw Marker
self.drawMarker = function(guid, lat, lng, ownerName) {
    // Find user config
    var userIndex = -1;
    // Priority: User 1 (index 0) > User 5 (index 4)
    // Actually the data stores 'ownerName'. We need to match it to settings.
    // If user changes settings (e.g. swaps User 1 and 2), the colors should update.
    // So we search for ownerName in settings.users.

    var userConfig = null;
    for(var i=0; i<self.settings.users.length; i++) {
        if(self.settings.users[i].name === ownerName) {
            userConfig = self.settings.users[i];
            break;
        }
    }

    if(!userConfig) return; // Owner not watched anymore?

    var latlng = L.latLng(lat, lng);

    // Draw Ring
    if(self.ringLayerGroup) {
        // Requirement (14): Independent display ON/OFF (Handled by LayerGroup)
        // Requirement (4): Do not obstruct tap (interactive: false)
        var ring = L.circleMarker(latlng, {
            radius: 10,
            color: userConfig.ringColor || 'red',
            fill: false,
            weight: 2,
            interactive: false
        });
        ring.options.guid = guid; // For reference
        self.ringLayerGroup.addLayer(ring);
    }

    // Draw Star
    if(self.starLayerGroup) {
        var starIcon = L.divIcon({
            className: 'starmarker-star-icon',
            html: '<div style="color:' + (userConfig.starColor || 'yellow') + '; font-size:24px; text-shadow:0 0 3px black; line-height:1;">★</div>',
            iconSize: [24, 24],
            iconAnchor: [12, 12] // Center it
        });

        var star = L.marker(latlng, {
            icon: starIcon,
            interactive: false,
            keyboard: false
        });
        star.options.guid = guid;
        self.starLayerGroup.addLayer(star);
    }
};

// --- Function 00170 Redraw All Markers
self.redrawAllMarkers = function() {
    if(!self.starLayerGroup || !self.ringLayerGroup) return;

    self.starLayerGroup.clearLayers();
    self.ringLayerGroup.clearLayers();

    $.each(self.data, function(guid, details) {
        // details: [lat, lng, title, timestamp, ownerName]
        self.drawMarker(guid, details[0], details[1], details[4]);
    });
};

// --- Function 00175 Delayed Redraw
self.delayedRedraw = function() {
    if(self.redrawTimer) clearTimeout(self.redrawTimer);
    self.redrawTimer = setTimeout(function() {
        self.redrawAllMarkers();
        self.redrawTimer = null;
    }, 500); // 500ms delay
};

// --- Function 00180 Handle Portal Added
self.handlePortalAdded = function(data) {
    var p = data.portal;
    var guid = p.options.guid;
    var details = p.options.data;

    if(!details.owner) return;

    // Check if owner is watched
    var matchedUser = null;
    for(var i=0; i<self.settings.users.length; i++) {
        if(self.settings.users[i].name === details.owner) {
            matchedUser = self.settings.users[i];
            break;
        }
    }

    if(matchedUser) {
        var lat = p.getLatLng().lat;
        var lng = p.getLatLng().lng;
        var title = details.title || 'Untitled';
        var timestamp = new Date().getTime();

        // Add or Update
        self.data[guid] = [lat, lng, title, timestamp, details.owner];
        self.delayedSave();

        // Debounced redraw
        self.delayedRedraw();
    }
};

// --- Function 00190 Handle Portal Selected (Delete Mode)
self.handlePortalSelected = function(data) {
    if(!self.settings.deleteMode) return;

    var guid = data.selectedPortalGuid;
    if(!guid) return;

    if(self.data[guid]) {
        delete self.data[guid];
        self.saveData();
        self.redrawAllMarkers();
        // Feedback
        if(window.chat) window.chat.addNickname('Star Marker: Deleted ' + guid);
    }
};

// --- Function 00200 Export Data
self.exportData = function() {
    // Requirement (8): Optimized array format, filename format
    var exportArray = [];
    $.each(self.data, function(guid, d) {
        // d: [lat, lng, title, ts, owner]
        // export: [guid, lat, lng, title, ts, owner]
        exportArray.push([guid, d[0], d[1], d[2], d[3], d[4]]);
    });

    var json = JSON.stringify(exportArray);
    var blob = new Blob([json], {type: 'application/json'});
    var url = URL.createObjectURL(blob);

    var now = new Date();
    var yyyy = now.getFullYear();
    var mm = ('0' + (now.getMonth() + 1)).slice(-2);
    var dd = ('0' + now.getDate()).slice(-2);
    var hh = ('0' + now.getHours()).slice(-2);
    var min = ('0' + now.getMinutes()).slice(-2);
    var filename = 'StarMarker_' + yyyy + mm + dd + '_' + hh + min + '.json';

    // Create download link
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

// --- Function 00205 Import Data
self.importData = function(elem) {
    if(!elem.files || !elem.files[0]) return;

    var file = elem.files[0];
    var reader = new FileReader();

    reader.onload = function(e) {
        try {
            var imported = JSON.parse(e.target.result);
            if(!Array.isArray(imported)) {
                throw new Error('Invalid JSON format (not an array)');
            }

            var count = 0;
            var updated = 0;

            imported.forEach(function(item) {
                // item: [guid, lat, lng, title, ts, owner]
                if(item.length < 6) return;

                var guid = item[0];
                var newData = [item[1], item[2], item[3], item[4], item[5]];

                if(self.data[guid]) {
                    // Update if newer?
                    if(item[4] > self.data[guid][3]) {
                        self.data[guid] = newData;
                        updated++;
                    }
                } else {
                    self.data[guid] = newData;
                    count++;
                }
            });

            self.saveData();
            self.redrawAllMarkers();
            alert('Import Complete: Added ' + count + ', Updated ' + updated + '.');

        } catch(err) {
            console.error(err);
            alert('Import Failed: ' + err.message);
        }
    };

    reader.readAsText(file);
    elem.value = ''; // Reset
};

// --- Function 00210 Setup Function
var setup = function () {
    self.init();
    self.addCSS();
    self.loadSettings();
    self.loadData();

    if(self.settings.clearOnReload) {
        self.data = {};
        self.saveData();
    }

    self.autoPruneLogs();
    self.updateToolbox();

    self.setupLayers();

    // Hooks
    window.addHook('portalAdded', self.handlePortalAdded);
    window.addHook('portalSelected', self.handlePortalSelected);

    console.log('Star Marker: Initialized');
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
