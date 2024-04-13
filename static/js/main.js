import { render } from 'preact';
import { useRef, useState, useEffect } from 'preact/hooks';
import { useSignal, useSignalEffect } from '@preact/signals';
import { html } from 'htm/preact';
import { Dag } from './dag.js';
import { nearestPointIndex, editDistance, toGeoJSON, osrm } from './utils.js';

const SplitMode = {
    onSetup: () => {},
    onClick: function(state, e) {
        if (e.featureTarget) {
            this.map.fire('draw.cut', {
                feature: e.featureTarget,
                lngLat: [e.lngLat.lng, e.lngLat.lat]
            });
            this.map.getCanvas().style.cursor = "inherit";
            this.changeMode('simple_select');
        }
    },
    toDisplayFeatures: (state, geojson, display) => display(geojson),
    onMouseMove: function(state, e) {
        const features = this.featuresAt(e);
        this.map.getCanvas().style.cursor = features.length ? "crosshair" : "inherit";
    },
    onKeyUp: function (state, e) {
        if (e.keyCode === 27) {
            this.map.getCanvas().style.cursor = "inherit";
            return this.changeMode('simple_select');
        }
    },
};

const Visualize = (props) => {
    const canvasRef = useRef(null);

    useSignalEffect(() => {
        if (!props.dag.value) {
            return () => {};
        }

        draw(props.source.value, props.dag.value, props.selectedFeatures.value);
        return props.dag.value.onUpdate(result => {
            draw(props.source.value, props.dag.value, props.selectedFeatures.value);
        });
    });

    const draw = (source, dag, highlights) => {
        const canvas = canvasRef.current;
        const [w, h] = [canvasRef.current.offsetWidth, canvasRef.current.offsetHeight];
        canvas.width = w * window.devicePixelRatio;
        canvas.height = h * window.devicePixelRatio;
        const ctx = canvas.getContext('2d');
        ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

        dag.render(ctx, source, highlights);
    };

    return html`<canvas class="h100 w100" ref=${canvasRef} />`
}

const Map = (props) => {
    const mapContainer = useRef(null);
    const map = useRef(null);
    const draw = useRef(null);
    const lastSource = useRef(null);

    useSignalEffect(() => {
        if (!props.dag.value) return;
        const dag = props.dag.value;
        return dag.onUpdate(result => {
            const all = draw.current.getAll().features;
            const selected = all.length === result.features.length && lastSource.current === props.source.value
                  ? draw.current.getSelectedIds().map(id => all.findIndex(feature => feature.id === id))
                  : [];
            draw.current.set(result);
            const updated = draw.current.getAll();
            draw.current.changeMode('simple_select', { featureIds: selected.map(idx => updated.features[idx].id) })
            lastSource.current = props.source.value;
            osrm(map.current, 'osrm-source', result.features.map(feature => feature.geometry.coordinates));
        });
    });

    useEffect(() => {
        if (map.current) return;

        let protocol = new pmtiles.Protocol();
        maplibregl.addProtocol("pmtiles", protocol.tile);
        let PMTILES_URL = "/area.pmtiles";
        const p = new pmtiles.PMTiles(PMTILES_URL);
        protocol.add(p);
        map.current = new maplibregl.Map({
            container: mapContainer.current,
            pitchWithRotate: false,
            center: [5.328875599999947, 60.39677380241355],
            zoom: 14,
            dragRotate: false,
            style: "/style.json",
        });

        map.current.once('load', () => {
            map.current.addSource('osrm-source', {
                type: 'geojson',
                data: toGeoJSON('osrm', [[]]).data
            });

            map.current.addLayer({
                id: `osrm-layer`,
                type: 'line',
                source: 'osrm-source',
                paint: {
                    'line-color': ['get', 'color'],
                    'line-dasharray': [4, 4],
                    'line-opacity' : 0.3,
                    'line-width': 4
                }
            });
        });

        draw.current = new MapboxDraw({
            displayControlsDefault: false,
            controls: {
                trash: true,
            },
            modes: {
                ...MapboxDraw.modes,
                split: SplitMode,
            }
        });

        // Hack to fix class difference between maplibre and mapbox
        document.querySelector('.maplibregl-canvas').classList.add('mapboxgl-canvas');

        map.current.on('draw.selectionchange', (e) => {
            const all = draw.current.getAll().features;
            const indices = e.features.map(selected => all.findIndex(feature => feature.id === selected.id));
            props.selectedFeatures.value = indices;
        });

        map.current.on('draw.update', (e) => {
            const index = draw.current.getAll().features.findIndex(feature => e.features[0].id === feature.id);
            const edits = editDistance(props.dag.value.last().features[index].geometry.coordinates, e.features[0].geometry.coordinates);
            props.dag.value.edit(index, edits);
        });

        map.current.on('draw.cut', (e) => {
            // Get nearest point on linestring
            const featureIndex = draw.current.getAll().features.findIndex(feature => e.feature.properties.id === feature.id);
            const pointIndex = nearestPointIndex(e.lngLat, draw.current.getAll().features[featureIndex].geometry.coordinates);
            props.dag.value.split(featureIndex, pointIndex);
        });

        map.current.addControl(draw.current, 'top-left');

        const keyboardListener = async (e) => {
            if (!props.source.value) return;
            if (!e.ctrlKey) return;

            switch (e.code) {
            case 'KeyH':
                const bounds = draw.current.getAll().features.flatMap(feature => feature.geometry.coordinates);
                map.current.fitBounds(bounds.reduce((acc, cur) => acc.extend(cur), new maplibregl.LngLatBounds(bounds.slice(0, 2))), { padding: 20, duration: 0 });
                break;
            case 'KeyM':
                const all = draw.current.getAll().features;
                props.selectedFeatures.value = [];
                props.dag.value.merge(draw.current.getSelectedIds().map(id => all.findIndex(feature => feature.id === id)));
                break;
            case 'KeyP':
                draw.current.changeMode('split');
                break;
            case 'KeyS':
                localStorage.setItem(props.source.value, JSON.stringify(props.dag.value.save()));
                break;
            case 'KeyZ':
                props.dag.value.undo();
                break;
            default:
                break;
            }
        };
        document.addEventListener('keyup', keyboardListener);
        return () => document.removeEventListener('keyup', keyboardListener);
    }, []);

    return html`<div class="vh100" style="width: 100%; box-sizing: border-box; border: 1vh solid black" ref=${mapContainer}/>`;
};

const Files = (props) => {
    const [files, setFiles] = useState([]);
    const [selectedFile, setSelectedFile] = useState(undefined);

    const select = (file) => {
        props.source.value = file;
        setSelectedFile(file);
    }

    useEffect(() => {
        fetch("/data").then(res => res.json()).then(json => setFiles(json.reverse()));
    }, []);

    return files.length>0
        ? html`<ul class="Files h100 scroll-y">
                ${files.map(file => file === selectedFile
                      ? html`<li class='selected' onClick=${() => props.source.value = file} key=${file}>${file}</li>`
                      : html`<li onClick=${() => select(file)} key=${file}>${file}</li>`)}
            </ul>`
        : html`<div id="panel">Fetching files...</div>`;
};

const Panel = (props) => {
    return html`
        <div class="Panel vh100 vw30 grid-4-rows">
            <h1>Files</h1>
            <${Files} source=${props.source} />
            <h1>Graph</h1>
            <${Visualize} selectedFeatures=${props.selectedFeatures} source=${props.source} dag=${props.dag} />
        </div>`;
};

const App = () => {
    const source = useSignal(undefined);
    const dag = useSignal(undefined);
    const selectedFeatures = useSignal([]);

    useSignalEffect(() => {
        if (source.value) {
            fetch(`/data/${source.value}`)
                .then(res => res.json())
                .then(collection => {
                    dag.value = Dag(localStorage.getItem(source.value), collection);
                    dag.value.update();
                });
        }
    });

    return html`
        <div class="flex-columns">
            <${Panel} selectedFeatures=${selectedFeatures} source=${source} dag=${dag}/>
            <${Map} selectedFeatures=${selectedFeatures} dag=${dag} source=${source}/>
        </div>`;
}

render(html`<${App} />`, document.body);
