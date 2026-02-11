## Note
This metadata is written in Japanese. Translate it into English and use it.

## Note
The content of AGENTS.md is for reference only and must not be rewritten in any way (except for translation as requested).

## 0. Design Philosophy: What is the purpose of this script?

[1] It is an external plugin running on IITC for the location-based game Ingress.
[2] It was developed to investigate where users who do not output logs are active.
[3] For detection, the operational load was reduced so that one can notice that the target user visited the place while casually browsing IITC during daily use.
[4] When a portal is tapped, the date, GUID, portal name, and list of users included in Resonators and MODs are extracted and saved as a log in local storage.
    If the name of the monitored user is found, a star and a ring are assigned.
[5] Even when assigning stars and rings to portals, the user's tap operation must not be obstructed. The drawing layer for stars and rings must exist behind the tap target.
[6] Enable management of multiple monitored users. The priority is USER1, USER2, USER3, USER4, USER5, and duplicate display of stars and rings must not occur.
[7] Both stars and rings can be cleared upon reload, and their enable/disable is controlled by an ON/OFF checkbox.
[8] Provide a function to organize duplicate data during export/import, and control its enable/disable with an ON/OFF checkbox. This should be placed near the JSON export and JSON import buttons.
    The acquired data list holds the date, GUID, portal name, and user name. However, if the user name has not changed even if the GUID is the same, the old data is discarded.
[9] Provide an arbitrary execution button for organizing duplicate data.
[10] A button is required to display the acquired data.
[11] A button is required to delete all currently acquired data.
[12] Unless there are new instructions from the user, edits that deviate from the design philosophy must not be made.
[13] The default retention period is 1 day. The maximum value is 30 days.
[14] The default star size should be small.

## 1. Metadata and Identification Information (Strict Adherence)
The following lines must never be changed. However, the content between these lines may be changed. For example, version information, etc.
// @author         DOPPELGENGER,GEMINI3PRO,JULES
// @id             iitc-plugin-star-marker
// @name           IITC plugin: Star Marker
// @category       d.org.addon
// @namespace      https://example.com/
// @include        https://intel.ingress.com/*
// @include        https://intel-x.ingress.com/*
// @grant          none

## 2. Update Process
Unless significant feature improvements are required, keep modifications to a minimum. Applying patches to each function is the top priority.

## 3. Behavior at Pull
For each version, generate a file like StarMarker.1.0.1.user.js. This is for user version management.
As the main work stream, overwrite the StarMarker.user.js file so that coding differences can be confirmed.
In other words, generate two files with the same content for each pull.

## 4. The script must always be coded for Android, and code usable only on PC must never be used.
