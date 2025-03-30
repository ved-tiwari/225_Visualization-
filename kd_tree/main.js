// === GLOBAL VARIABLES & CANVAS SETUP ===
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const margin = 40; // margin for canvas drawing (space for axis labels)
let points = [];
let kdTree = null;
let steps = [];       // Array of step objects (each is an "addPoint" or "drawSplit" action)
let currentStep = 0;  // Index of the current step in the steps array
let stepCounter = 0;  // To assign step indices to nodes

let minX, maxX, minY, maxY, scaleX, scaleY;

// Global variable to persist current zoom/pan transform
let currentTransform = d3.zoomIdentity;

// example
// 3 2
// 5 8
// 6 1
// 4 4
// 9 0
// 1 1
// 2 2
// 8 7

// Transform a data coordinate [x, y] into canvas coordinates.
function transformPoint(p) {
    return {
        x: margin + (p[0] - minX) * scaleX,
        // Invert the y-axis so that lower y is at the bottom.
        y: canvas.height - margin - (p[1] - minY) * scaleY
    };
}

// === KD-TREE NODE & BUILDING ===
function Node(point, left, right, axis) {
    this.point = point; // [x, y]
    this.left = left;
    this.right = right;
    this.axis = axis;   // 0 for x-split, 1 for y-split
    this.addStepIndex = -1;   // when the point is added (and labeled)
    this.splitStepIndex = -1; // when its splitting line is drawn
    this.label = "";
}

function comparePoints(a, b, axis) {
    // Compare based on the splitting axis first
    if (a[axis] < b[axis]) return -1;
    if (a[axis] > b[axis]) return 1;
    // Tie-break: compare the other coordinate lexicographically
    const otherAxis = (axis + 1) % 2;
    if (a[otherAxis] < b[otherAxis]) return -1;
    if (a[otherAxis] > b[otherAxis]) return 1;
    return 0; // They are exactly equal (unlikely in typical data)
}

function buildKDTree(pointsArr, depth = 0) {
    // Base case: no points => no tree
    if (pointsArr.length === 0) return null;

    const axis = depth % 2;  // 0 for x-axis, 1 for y-axis

    // Sort the array on the current axis, using tie-break for duplicates
    pointsArr.sort((a, b) => comparePoints(a, b, axis));

    // Choose the "lower median" index
    // Example: if length = 8, medianIndex = floor((8 - 1) / 2) = 3
    const medianIndex = Math.floor((pointsArr.length - 1) / 2);
    const medianPoint = pointsArr[medianIndex];

    // Build subtrees from the left and right subarrays
    const leftSub = pointsArr.slice(0, medianIndex);
    const rightSub = pointsArr.slice(medianIndex + 1);

    const left = buildKDTree(leftSub, depth + 1);
    const right = buildKDTree(rightSub, depth + 1);

    // Return the constructed node
    return new Node(medianPoint, left, right, axis);
}

// === STEP COLLECTION (for step-by-step reveal) ===
function collectSteps(node, xRange, yRange) {
    let localSteps = [];
    if (!node) return localSteps;
    node.addStepIndex = stepCounter;
    localSteps.push({
        type: "addPoint",
        node: node,
        xRange: xRange.slice(),
        yRange: yRange.slice()
    });
    stepCounter++;
    node.splitStepIndex = stepCounter;
    localSteps.push({
        type: "drawSplit",
        node: node,
        xRange: xRange.slice(),
        yRange: yRange.slice()
    });
    stepCounter++;
    if (node.axis === 0) {
        let leftSteps = collectSteps(node.left, [xRange[0], node.point[0]], yRange);
        let rightSteps = collectSteps(node.right, [node.point[0], xRange[1]], yRange);
        localSteps = localSteps.concat(leftSteps, rightSteps);
    } else {
        let leftSteps = collectSteps(node.left, xRange, [yRange[0], node.point[1]]);
        let rightSteps = collectSteps(node.right, xRange, [node.point[1], yRange[1]]);
        localSteps = localSteps.concat(leftSteps, rightSteps);
    }
    return localSteps;
}

// === CANVAS DRAWING FUNCTIONS (2D PARTITION VIEW) ===
function clearCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function drawAxes() {
    ctx.strokeStyle = "#aaa";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(margin, canvas.height - margin);
    ctx.lineTo(canvas.width - margin, canvas.height - margin);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(margin, canvas.height - margin);
    ctx.lineTo(margin, margin);
    ctx.stroke();
    ctx.fillStyle = "black";
    ctx.font = "14px Arial";
    ctx.fillText("X-axis", canvas.width - margin - 40, canvas.height - margin + 25);
    ctx.fillText("Y-axis", margin - 30, margin + 5);
}

function drawAddPointStep(step, highlight) {
    const pt = step.node.point;
    const tp = transformPoint(pt);
    ctx.save();
    ctx.beginPath();
    ctx.fillStyle = highlight ? "orange" : "black";
    ctx.arc(tp.x, tp.y, 4, 0, 2 * Math.PI);
    ctx.fill();
    ctx.font = "12px Arial";
    ctx.fillStyle = "blue";
    const labelText = step.node.label + " (" + pt[0] + ", " + pt[1] + ")";
    ctx.fillText(labelText, tp.x + 5, tp.y - 5);
    ctx.restore();
}

function drawDrawSplitStep(step, highlight) {
    ctx.save();
    ctx.setLineDash([5, 5]);
    ctx.lineWidth = highlight ? 3 : 1.5;
    if (step.node.axis === 0) {
        const x = step.node.point[0];
        const p1 = transformPoint([x, step.yRange[0]]);
        const p2 = transformPoint([x, step.yRange[1]]);
        ctx.strokeStyle = "red";
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
    } else {
        const y = step.node.point[1];
        const p1 = transformPoint([step.xRange[0], y]);
        const p2 = transformPoint([step.xRange[1], y]);
        ctx.strokeStyle = "blue";
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
    }
    ctx.restore();
    ctx.save();
    ctx.setLineDash([2, 2]);
    ctx.strokeStyle = step.node.axis === 0 ? "rgba(255,0,0,0.5)" : "rgba(0,0,255,0.5)";
    let topLeft = transformPoint([step.xRange[0], step.yRange[1]]);
    let width = (step.xRange[1] - step.xRange[0]) * scaleX;
    let height = (step.yRange[1] - step.yRange[0]) * scaleY;
    ctx.strokeRect(topLeft.x, topLeft.y, width, height);
    ctx.restore();
}

function updateCanvas() {
    clearCanvas();
    drawAxes();
    for (let i = 0; i < currentStep; i++) {
        let step = steps[i];
        if (step.type === "addPoint") {
            drawAddPointStep(step, false);
        } else if (step.type === "drawSplit") {
            drawDrawSplitStep(step, false);
        }
    }
    if (currentStep < steps.length) {
        let step = steps[currentStep];
        if (step.type === "addPoint") {
            drawAddPointStep(step, true);
        } else if (step.type === "drawSplit") {
            drawDrawSplitStep(step, true);
        }
    }
}

function updateStepButtons() {
    document.getElementById("prevStep").disabled = currentStep === 0;
    document.getElementById("nextStep").disabled = currentStep >= steps.length;
}

// === D3 TREE VISUALIZATION (PAN & ZOOM ENABLED) ===
function updateTreeVisualization() {
    if (!kdTree) return;

    const rootData = d3.hierarchy(kdTree, d => {
        let children = [];
        if (d.left) children.push(d.left);
        if (d.right) children.push(d.right);
        return children.length ? children : null;
    });

    const treeLayout = d3.tree().size([600, 600]);
    const treeData = treeLayout(rootData);

    const svg = d3.select("#treeSVG");
    currentTransform = d3.zoomTransform(svg.node());
    svg.selectAll("*").remove();

    const g = svg.append("g")
                 .attr("id", "treeGroup")
                 .attr("transform", currentTransform);

    g.selectAll(".link")
        .data(treeData.links())
        .enter()
        .append("line")
        .attr("class", "link")
        .attr("x1", d => d.source.x)
        .attr("y1", d => d.source.y)
        .attr("x2", d => d.target.x)
        .attr("y2", d => d.target.y)
        .attr("stroke", "black");

    const node = g.selectAll(".node")
                  .data(treeData.descendants())
                  .enter()
                  .append("g")
                  .attr("class", "node")
                  .attr("transform", d => "translate(" + d.x + "," + d.y + ")");

    node.append("circle")
        .attr("r", 20)
        .attr("fill", d => d.data.addStepIndex < currentStep ? "orange" : "#fff")
        .attr("stroke", "black");

    node.append("text")
        .attr("dy", 5)
        .attr("text-anchor", "middle")
        .attr("font-size", "12px")
        .text(d => d.data.label + " (" + d.data.point[0] + ", " + d.data.point[1] + ")");

    svg.call(d3.zoom().on("zoom", (event) => {
        currentTransform = event.transform;
        g.attr("transform", currentTransform);
    }));
}

// === EVENT HANDLERS ===
document.getElementById("pointForm").addEventListener("submit", function (e) {
    e.preventDefault();
    points = [];
    kdTree = null;
    steps = [];
    currentStep = 0;
    stepCounter = 0;

    const input = document.getElementById("points").value.trim();
    if (!input) {
        alert("Please enter some points.");
        return;
    }
    const lines = input.split("\n");
    lines.forEach(line => {
        const parts = line.trim().split(/\s+/);
        if (parts.length === 2) {
            const x = parseFloat(parts[0]);
            const y = parseFloat(parts[1]);
            if (!isNaN(x) && !isNaN(y)) {
                points.push([x, y]);
            }
        }
    });
    if (points.length === 0) {
        alert("No valid points found. Please check your input.");
        return;
    }

    minX = Math.min(...points.map(p => p[0]));
    maxX = Math.max(...points.map(p => p[0]));
    minY = Math.min(...points.map(p => p[1]));
    maxY = Math.max(...points.map(p => p[1]));
    let xRange = maxX - minX;
    let yRange = maxY - minY;
    minX -= 0.1 * xRange;
    maxX += 0.1 * xRange;
    minY -= 0.1 * yRange;
    maxY += 0.1 * yRange;

    scaleX = (canvas.width - 2 * margin) / (maxX - minX);
    scaleY = (canvas.height - 2 * margin) / (maxY - minY);

    kdTree = buildKDTree(points);
    let labelCounter = 0;
    function assignLabels(node) {
        if (!node) return;
        labelCounter++;
        node.label = "P" + labelCounter;
        assignLabels(node.left);
        assignLabels(node.right);
    }
    assignLabels(kdTree);

    steps = collectSteps(kdTree, [minX, maxX], [minY, maxY]);
    updateCanvas();
    updateStepButtons();
    updateTreeVisualization();
});

document.getElementById("nextStep").addEventListener("click", function () {
    if (currentStep < steps.length) {
        currentStep++;
        updateCanvas();
        updateStepButtons();
        updateTreeVisualization();
    }
});

document.getElementById("prevStep").addEventListener("click", function () {
    if (currentStep > 0) {
        currentStep--;
        updateCanvas();
        updateStepButtons();
        updateTreeVisualization();
    }
});