# AGENTS.md - Immutable Rules for "PortalStar"

## 1. Metadata & Identity (STRICT)
- **Filename:** `IITC plugin- PortalStar-0.1.7.user.js`
- **Metadata Header:**
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

## 2. Architecture Constraints
- **Target Environment:** Android (IITC Mobile) & PC Desktop.
- **Data Format:** "Array of Arrays" JSON only. CSV is strictly prohibited.
  - Schema: `[version, [timestamp, guid, lat, lng, [mods], [resos], owner, title]]`
- **Performance:** Use `pointer-events: none` for markers in CSS to prevent blocking portal taps (except in Delete Mode).
- **Z-Index:** Markers must use a high Z-Index (e.g., 650-710) in a custom Leaflet Pane.

## 3. UI/UX Rules
- **Language:** **Japanese** (Native level).
- **Visuals:** Follow `PortalSlayer` design patterns (Dialog style, Color pickers).
- **Layers:** Stars and Rings must be independently togglable via standard IITC LayerChooser.

## 4. Development Rules
- **Labeling:** All major function blocks MUST be labeled with `// --- Function XXXXX` (Start at 00000, increment by 10).
- **Testing Requirements:**
  - (19) Confirm Stars appear on tap/match.
  - (20) Confirm Data Export works.
  - (21) Confirm Data Import works.
  - (22) Export filename must be `StarMarker_YYYYMMDD_HHMM.json`.
