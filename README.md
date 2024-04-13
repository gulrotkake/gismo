# gismo

Gismo is a work-in-progress interactive tool for correcting / matching my recorded GPS routes.

## Installation

1. Download tiles for region.
```
$ pmtiles extract https://build.protomaps.com/20231120.pmtiles static/area.pmtiles --bbox={bbox}
```
where `{bbox}` is `min_longitude,min_latitude,max_longitude,max_latitude`.

2. Set the base URL for your [OSRM_SERVER](https://project-osrm.org/) in `server.js`.
3. Start the server.
```
node server.js <path-to-directory-containing-gps-data>
```
4. Visit `http://localhost:3000`.

## Usage

### Keybindings

 - Ctrl-H Home position to selected feature.
 - Ctrl-M Merge two selected routes (in order of selection).
 - Ctrl-P Partition line string, click on line string to split after entering partition mode.
 - Ctrl-Z Undo.
 - Ctrl-S Save edit DAG to local storage.
 
### Editing
 
Select a feature in the map to move/delete features or nodes.
