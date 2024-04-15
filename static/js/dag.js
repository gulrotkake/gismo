const applyEdits = (source, edits) => {
    let offset = 0;
    let result = [...source];
    for (let i = 0; i < edits.length; ++i) {
        const { name, args } = edits[i];
        switch (name) {
            case "delete":
                result.splice(args[0] - 1 - offset, 1);
                offset += 1;
                break;
            case "replace":
                result[args[1] - 1 - offset] = args[0];
                break;
            case "insert":
                result.splice(args[1] - offset, 0, args[0]);
                offset -= 1;
                break;
        }
    }
    return result;
};

const renderDag = (ctx, rootName, initialFeatures, ops, highlight) => {
    const line = (ctx, x1, y1, x2, y2) => {
        ctx.strokeStyle = "#fafafa";
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
    };

    const textBox = (ctx, text, cx, y, userProps) => {
        const props = {
            fontSize: 14,
            radius: 0,
            fillStyle: "hsl(200, 100%, 50%)",
            ...userProps,
        };
        ctx.font = `${props.fontSize}px sans-serif`;
        ctx.textBaseline = "top";
        const dim = ctx.measureText(text);
        const height = dim.fontBoundingBoxAscent + dim.fontBoundingBoxDescent;

        ctx.beginPath();
        ctx.strokeStyle = "#fafafa";
        ctx.fillStyle = props.fillStyle;
        ctx.roundRect(
            cx - dim.width / 2 - 8,
            y,
            dim.width + 16,
            height + 16,
            props.radius || 0,
        );
        ctx.fill();
        ctx.stroke();

        ctx.beginPath();
        ctx.fillStyle = "#fafafa";
        ctx.fillText(text, cx - dim.width / 2, y + 9);
        return [cx - dim.width / 2 - 8, y, dim.width + 16, height + 16];
    };

    const depth =
        2 +
        Math.max(
            ...ops.reduce(
                (nodes, op) => {
                    switch (op.name) {
                        case "edit":
                            nodes[op.args.idx] += 1;
                            break;
                        case "merge":
                            // Remove the merge node
                            const merged = [...op.args].sort();
                            const spliceDepth = merged.reduce(
                                (acc, nodeIdx, count) =>
                                    Math.max(
                                        nodes.splice(nodeIdx - count, 1)[0],
                                        acc,
                                    ),
                                0,
                            );
                            nodes.splice(merged[0], 0, spliceDepth + 1);
                            break;
                        case "split":
                            const node = nodes[op.args.idx];
                            nodes.splice(
                                op.args.idx + 1,
                                0,
                                nodes[op.args.idx],
                            );
                            nodes[op.args.idx] += 1;
                            break;
                    }
                    return nodes;
                },
                initialFeatures.map((_, idx) => 0),
            ),
        );

    const w = ctx.canvas.clientWidth;
    const h = ctx.canvas.clientHeight;
    const yStep = 20;
    const calcHeight = depth * (32 + yStep);
    if (calcHeight > h) {
        ctx.scale(1, h / calcHeight);
    }

    ctx.fillStyle = "#333";
    ctx.fillRect(0, 0, w, h);

    const sb = textBox(ctx, rootName, w / 2, 10, {
        radius: 8,
        fillStyle: "hsl(100, 40%, 50%)",
    });

    const yHeight = sb[3];
    const nodes = initialFeatures.map((_, idx, c) => ({
        x: (w / (c.length * 2)) * (idx * 2 + 1),
        y: sb[1] + yHeight + yStep,
    }));

    nodes.forEach((node, idx) => {
        textBox(ctx, idx, node.x, node.y, {
            radius: 8,
        });
        line(ctx, sb[0] + sb[2] / 2, sb[1] + sb[3], node.x, node.y);
    });

    ops.forEach((op) => {
        switch (op.name) {
            case "edit": {
                const node = nodes[op.args.idx];
                const newY = node.y + yHeight + yStep;
                textBox(ctx, "e", node.x, newY, {
                    radius: 8,
                });
                line(ctx, node.x, node.y + yHeight, node.x, newY);
                node.y = newY;
                break;
            }
            case "split": {
                const node = nodes[op.args.idx];
                nodes.splice(op.args.idx + 1, 0, {
                    x: node.x + 32,
                    y: node.y,
                    highlight: node.highlight,
                });

                const newY = node.y + yHeight + yStep;
                textBox(ctx, op.args.idx, node.x, newY, {
                    radius: 8,
                });
                textBox(ctx, op.args.idx + 1, nodes[op.args.idx + 1].x, newY, {
                    radius: 8,
                });
                line(ctx, node.x, node.y + yHeight, node.x, newY);
                line(
                    ctx,
                    node.x,
                    node.y + yHeight,
                    nodes[op.args.idx + 1].x,
                    newY,
                );
                nodes[op.args.idx + 1].y = newY;
                node.y = newY;
                break;
            }
            case "merge": {
                // Remove all nodes to merge
                const merged = [...op.args].sort();
                const spliced = merged.reduce((acc, nodeIdx, count) => {
                    acc.push(...nodes.splice(nodeIdx - count, 1));
                    return acc;
                }, []);

                // Place merged node under deepest tree
                const deepest = spliced.reduce(
                    (acc, node) => ({
                        ...(node.y > acc.y ? node : acc),
                        highlight: acc.highlight || node.highlight,
                    }),
                    spliced[0],
                );

                // Insert merge node
                nodes.splice(merged[0], 0, deepest);

                const node = nodes[merged[0]];
                const newY = node.y + yHeight + yStep;

                // Draw box for merge
                textBox(ctx, "m", node.x, newY, {
                    radius: 8,
                });

                // Draw line from each spliced node to merge node
                spliced.forEach((del) =>
                    line(ctx, del.x, del.y + yHeight, node.x, newY),
                );

                node.y = newY;
                break;
            }
        }
    });
};

export const Dag = (initialState, features) => {
    let ops = JSON.parse(initialState) || [];
    const listeners = [];
    const last = [];
    const copy = JSON.parse(JSON.stringify(features));

    const split = (features, idx, pointIdx) => {
        const splitFeature =
            features.features[idx].geometry.coordinates.splice(pointIdx);
        features.features.splice(idx + 1, 0, {
            type: "Feature",
            properties: {
                DistanceMeters: 0,
            },
            geometry: {
                type: "LineString",
                coordinates: splitFeature,
            },
        });
        return features;
    };

    const merge = (features, indices) => {
        let featuresInOrder = indices.map((idx) => features.features[idx]);

        // Remove features from existing set, sorted to account for array mutation
        [...indices]
            .sort()
            .forEach((idx, offset) =>
                features.features.splice(idx - offset, 1),
            );

        features.features.splice(
            indices[0],
            0,
            featuresInOrder.reduce(
                (acc, feature) => {
                    acc.properties = {
                        ...acc.properties,
                        ...feature.properties,
                        DistanceMeters:
                            acc.properties.DistanceMeters +
                            feature.properties.DistanceMeters,
                    };
                    acc.geometry = {
                        type: "LineString",
                        coordinates: [
                            ...acc.geometry.coordinates,
                            ...feature.geometry.coordinates,
                        ],
                    };
                    return acc;
                },
                {
                    type: "Feature",
                    properties: {
                        DistanceMeters: 0,
                    },
                    geometry: {
                        coordinates: [],
                    },
                },
            ),
        );
        return features;
    };

    const update = () => {
        let result = ops.reduce(
            (acc, op) => {
                const { name, args } = op;
                switch (name) {
                    case "merge":
                        return merge(acc, args);
                    case "split":
                        return split(acc, args.idx, args.pointIdx);
                    case "edit":
                        acc.features = acc.features.map((feature, idx) => {
                            if (idx == args.idx) {
                                feature.geometry.coordinates = applyEdits(
                                    feature.geometry.coordinates,
                                    args.edit,
                                );
                            }
                            return feature;
                        });
                        return acc;
                    default:
                        throw Error("No such op", name);
                }
            },
            JSON.parse(JSON.stringify(copy)),
        );
        last[0] = result;
        listeners.forEach((listener) => listener(result));
    };

    return {
        merge: (indices) => {
            ops.push({
                name: "merge",
                args: indices,
            });
            update();
        },
        undo: () => {
            ops.pop();
            update();
        },
        edit: (idx, edits) => {
            ops.push({
                name: "edit",
                args: {
                    idx: idx,
                    edit: edits,
                },
            });
            update();
        },
        split: (idx, pointIdx) => {
            ops.push({
                name: "split",
                args: {
                    idx,
                    pointIdx,
                },
            });
            update();
        },
        onUpdate: (listener) => {
            listeners.push(listener);
            return () => listeners.splice(listeners.indexOf(listener), 1);
        },
        save: () => ops,
        update: () => update(),
        last: () => last[0],
        render: (ctx, rootName, highlight) =>
            renderDag(ctx, rootName, copy.features, ops, highlight || []),
    };
};
