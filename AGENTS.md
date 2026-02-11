The contents of AGENTS.md should only be used as a reference and should not be rewritten in any way.

## 1. Metadata & Identity (STRICT)
The following lines should never be changed. However, anything between these lines is okay to change. For example, version information.
// @author         DOPPELGENGER,GEMINI3PRO,JULES
// @id             iitc-plugin-portal-star
// @name           IITC plugin: PortalStar
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
