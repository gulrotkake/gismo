const express = require("express");
const fs = require("fs");
const app = express();

const path = `${__dirname}/${process.argv[2]}`;
const OSRM_SERVER = "http://localhost:8192";

app.use(express.json({ limit: "1mb" }));
app.use("/", express.static("static"));
app.use("/data", express.static(path));
app.get("/data", (req, res, next) => {
    fs.readdir(path, (err, files) => {
        if (err) {
            next(err);
            return;
        }
        res.end(JSON.stringify(files));
    });
});

app.post("/routes", async (req, res) => {
    const result = await Promise.all(
        req.body.map((coords) => {
            const cstring = coords
                .map((latlng) => latlng.slice(0, 2).join(","))
                .join(";");
            const url = `${OSRM_SERVER}/match/v1/foot/${cstring}?tidy=true&geometries=geojson&overview=full`;
            return fetch(url).then((res) => res.json());
        }),
    );
    res.end(JSON.stringify(result));
});

app.listen(3000, () => {
    console.log("Listening on port 3000");
});
