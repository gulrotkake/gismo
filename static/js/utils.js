// Haversine distance http://www.movable-type.co.uk/scripts/latlong.html
const distance = (t1, t2) => {
    const [lng1, lat1] = t1;
    const [lng2, lat2] = t2;
    const radius = 6371e3;
    const phi1 = lat1 * Math.PI/180;
    const phi2 = lat2 * Math.PI/180;
    const deltaPhi = (lat2-lat1) * Math.PI/180;
    const deltaLambda = (lng2-lng1) * Math.PI/180;

    const a = Math.sin(deltaPhi/2) * Math.sin(deltaPhi/2) +
          Math.cos(phi1) * Math.cos(phi2) *
          Math.sin(deltaLambda/2) * Math.sin(deltaLambda/2);
    return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

export const nearestPointIndex = (input, points) => points.reduce((acc, point, idx) => distance(input, point) < distance(input, points[acc])? idx : acc, 0);

export const toGeoJSON = (name, data) => ({
    name: name,
    data: {
        type: 'FeatureCollection',
        features: data.map((e, idx) => ({
            "type": "Feature",
            'properties': {
                'color': `hsl(${250/data.length*idx}, 100%, 50%)`
            },
            "geometry": {
                "type": "LineString",
                "coordinates": e
            }
        }))
    }
});

export const osrm = async (map, source, points) => {
    const routes = await fetch('/routes', {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(points),
    }).then(res => res.json());
    map.getSource(source).setData(toGeoJSON('snap', routes.flatMap(route => route.matchings.map(match => match.geometry.coordinates))).data);
};

export const editDistance = (sourceCoordinates, targetCoordinates) => {
    // Convert each coordinate to a string to allow comparison
    const source = sourceCoordinates.map(e => JSON.stringify(e));
    const target = targetCoordinates.map(e => JSON.stringify(e));

    const m = source.length;
    const n = target.length;

    const dp = Array.from(Array(m + 1), () => Array(n + 1).fill(0));

    for (let i = 0; i <= m; i++) {
        dp[i][0] = i;
    }
    for (let j = 0; j <= n; j++) {
        dp[0][j] = j;
    }
    for (let i = 1; i <= m; ++i) {
        for (let j = 1; j <= n; ++j) {
            dp[i][j] = source[i - 1] === target[j - 1]? dp[i - 1][j - 1] : Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]) + 1;
        }
    }

    let i = m;
    let j = n;
    let ops = [];
    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && dp[i-1][j-1] <= dp[i][j] && dp[i-1][j-1] <= dp[i-1][j] && dp[i-1][j-1] <= dp[i][j-1]) {
            if (dp[i-1][j-1] === dp[i][j] - 1) {
                ops.push({name: 'replace', args: [JSON.parse(target[j-1]), i]});
            }
            i-=1;
            j-=1;
        } else if (i > 0 && (j == 0 || dp[i-1][j] <= dp[i][j])) {
            ops.push({name: 'delete', args: [i]});
            i-=1;
        } else {
            ops.push({name: 'insert', args: [JSON.parse(target[j-1]), i]});
            j-=1;
        }
    }
    ops.reverse();
    return ops;
}
