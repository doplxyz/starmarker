The contents of AGENTS.md should only be used as a reference and should not be rewritten in any way.

## 0. Design Philosophy: What does this script aim to do?

[1] It is an external plugin that runs on IITC for the location-based game Ingress.  
[2] It was developed to investigate where users who do not output logs are active.  
[3] For detection, the operational burden was reduced so that while casually viewing IITC in daily use, one can simply notice that the target user has visited a location.  
[4] When a portal is tapped, extract the date, GUID, portal name, and the list of users included in Resonators and MODs, and store them in local storage as logs.  
If the name of a monitored user is found, attach a star and a ring.  
[5] Even when attaching a star and ring to a portal, it must not interfere with user taps. The rendering layer for the star and ring must exist behind the tap target.  
[6] Allow management of multiple monitored users. The priority order is USER1, USER2, USER3, USER4, USER5, and overlapping display of stars and rings must not occur.  
[7] Make it possible to clear both stars and rings on reload, with effectiveness controlled by an ON/OFF checkbox.  
[8] When exporting/importing, organize duplicate data, controlled by an ON/OFF checkbox. Place this near the JSON export and JSON import buttons.  
In the acquired data list, retain the date, GUID, portal name, and user name. However, even if the GUID is the same, if there is no change in the user name, discard the older data.  
[9] Provide an optional execution button for organizing duplicate data.  
[10] A button is required to display the acquired data.  
[11] A button is required to delete all currently acquired data.  
[12] Do not make edits that deviate from the design philosophy unless new instructions are given by the user.  
[13] The default retention period is 1. The maximum value is 30 days.  
[14] The default star size should be small.

## 1. Metadata & Identity (STRICT)
The following lines should never be changed. However, anything between these lines is okay to change. For example, version information.
// @author         DOPPELGENGER,GEMINI3PRO,JULES
// @id             iitc-plugin-star-marker
// @name           IITC plugin: Star Marker
// @category       d.org.addon
// @namespace      https://example.com/
// @include        https://intel.ingress.com/*
// @include        https://intel-x.ingress.com/*
// @grant          none

## 2. Update process
Unless major functional improvements are required, modifications will be kept to a minimum. Applying patches to each function will be given top priority.

## 3. Pull Behavior
Please generate a file for each version, such as StarMarker.1.0.1.user.js. This is for user version management purposes.
As the main work stream, overwrite the StarMarker.user.js file so that the coding differences can be seen.
In other words, each pull will generate two files with the same content.

## .4 Always code your scripts for Android, never use code that can only be used on PC.
