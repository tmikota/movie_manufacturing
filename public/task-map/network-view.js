// static/js/alchemy-network.js
// Data/asset resolution and editing are indirected through window.ALC_NET_CFG so
// a SINGLE copy of this file serves both the live app and the exported public
// bundle (same pattern as task-view.js's ALC_CFG). The defaults reproduce the
// live app; the export shell overrides them with baked JSON + read-only mode.
const NET_CFG = Object.assign({
    cssHref: '/pipeline_viewer/static/css/style.css',
    dataUrl: '/api/v1/visualizer/graph-data',
    // Read-only: pan/zoom/filter/hover only — no node dragging, no wiring, no
    // saving. The public embed has no API to save to.
    readOnly: false,
    // Whether a software x task pipeline can be opened (the export limits this to
    // the pipelines that are live on the public task map).
    canOpen: (sw, task) => true,
    openPipeline: (sw, task) => window.open(`/cookbook/task-map/${sw}/${task}`, '_blank'),
    fitOnLoad: false,
}, (typeof window !== 'undefined' && window.ALC_NET_CFG) || {});

// Load the tool stylesheet (guard against double-inject on re-import).
const STYLE_HREF = NET_CFG.cssHref;
if (typeof document !== 'undefined' &&
    !document.querySelector(`link[href="${STYLE_HREF}"]`)) {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = STYLE_HREF;
  document.head.appendChild(link);
}

function computeDepthFromLinks(nodes, links) {
    const depth = {};
    const adj = {};
    const indegree = {};

    nodes.forEach(n => {
        depth[n.id] = 0;
        indegree[n.id] = 0;
        adj[n.id] = [];
    });

    links.forEach(l => {
        const source = typeof l.source === 'object' ? l.source.id : l.source;
        const target = typeof l.target === 'object' ? l.target.id : l.target;
        if (adj[source]) {
            adj[source].push(target);
            indegree[target]++;
        }
    });

    const queue = Object.keys(indegree).filter(id => indegree[id] === 0);
    while (queue.length) {
        const u = queue.shift();
        (adj[u] || []).forEach(v => {
            depth[v] = Math.max(depth[v], depth[u] + 1);
            indegree[v]--;
            if (indegree[v] === 0) queue.push(v);
        });
    }
    return depth;
}

// {software_id: icon_url} from the graph-data payload (svg preferred, png
// fallback, resolved server-side). Falls back to the png convention path if a
// software isn't in the map.
let ICON_MAP = {};
function iconUrl(sw) {
    return (ICON_MAP && ICON_MAP[sw]) || `/static/icons/software/${sw}.png`;
}
// {software_id: display name} for the icon hover labels.
let LABEL_MAP = {};
function softwareLabel(sw) {
    return (LABEL_MAP && LABEL_MAP[sw]) || sw;
}

// --- Graph state --------------------------------------------------------------
// Live handle to the rendered graph so edits (node placement) can update in
// place without re-running the whole layout.
let GRAPH = null;
let ZOOM = null;         // the d3.zoom behavior (kept so "Fit" can drive it)
let CONNECT_FROM = null; // source node while dragging a new connection from a dot
let CONNECT_SIDE = null; // which source side (dot) that drag started from
let TEMP_LINK = null;    // the dashed preview line drawn during that drag

// forceLink() rewrites link.source/target from id strings to node objects once
// the sim initializes; these read either shape.
const srcId = (l) => (typeof l.source === "object" ? l.source.id : l.source);
const tgtId = (l) => (typeof l.target === "object" ? l.target.id : l.target);

const NODE_HALF_W = 90;   // rect spans x:-90..90 — wires attach at the side edges
const MIN_NODE_H = 84;    // node height — room for the label + icon row
const LANE_GAP = 90;      // clear vertical gap between stacked nodes in a column
const BAND_GAP = Math.round(LANE_GAP * 1.5); // wider gap separating shots from assets
const GRID = 20;          // snap grid — node centres snap to multiples of this
const snap = (v) => Math.round(v / GRID) * GRID;

// Every column is split into two bands: shot/sequence tasks on top (0), asset
// tasks on the bottom (1). Categories not in the asset set ride up top. Edit this
// set to reclassify which task categories count as "assets".
const ASSET_CATEGORIES = new Set(["assets"]);
function categoryBand(category) {
  return ASSET_CATEGORIES.has(String(category || "").toLowerCase()) ? 1 : 0;
}

const CORNER_R = 12; // rounded-corner radius on the orthogonal connectors

function _dist(a, b) { return Math.hypot(b.x - a.x, b.y - a.y); }
function _toward(from, to, r) {
  const dx = to.x - from.x, dy = to.y - from.y, len = Math.hypot(dx, dy) || 1;
  return { x: from.x + (dx / len) * r, y: from.y + (dy / len) * r };
}

// Build an SVG path through orthogonal waypoints with rounded corners: each turn
// becomes a small quadratic arc, radius clamped so short segments don't kink.
function roundedOrthPath(pts, r) {
  if (!pts || pts.length < 2) return null;
  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const p0 = pts[i - 1], p1 = pts[i], p2 = pts[i + 1];
    const rr = Math.min(r, _dist(p0, p1) / 2, _dist(p1, p2) / 2);
    const a = _toward(p1, p0, rr), b = _toward(p1, p2, rr);
    d += ` L${a.x},${a.y} Q${p1.x},${p1.y} ${b.x},${b.y}`;
  }
  const last = pts[pts.length - 1];
  d += ` L${last.x},${last.y}`;
  return d;
}

const STUB = 18; // how far a connector runs straight out of a side before turning

// Geometry of a node's four connection sides.
function sidePoint(n, side) {
  const hh = (n._h || MIN_NODE_H) / 2;
  switch (side) {
    case "top": return { x: n.x, y: n.y - hh };
    case "bottom": return { x: n.x, y: n.y + hh };
    case "left": return { x: n.x - NODE_HALF_W, y: n.y };
    default: return { x: n.x + NODE_HALF_W, y: n.y }; // right
  }
}
function sideDir(side) {
  switch (side) {
    case "top": return { x: 0, y: -1 };
    case "bottom": return { x: 0, y: 1 };
    case "left": return { x: -1, y: 0 };
    default: return { x: 1, y: 0 }; // right
  }
}
// The side of node `a` that faces node `b` — used for un-pinned (auto) ends.
function autoSide(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? "right" : "left";
  return dy >= 0 ? "bottom" : "top";
}
// Which side's dot (if any) the point (x,y) is sitting on — for drop precision.
function dotSideAt(n, x, y) {
  for (const side of ["top", "right", "bottom", "left"]) {
    const p = sidePoint(n, side);
    if (Math.hypot(p.x - x, p.y - y) <= 16) return side;
  }
  return null;
}

// Orthogonal connector between two ports (edge point + outward direction). Stubs
// straight out of each side before turning, then a single mid-elbow, so the wire
// always leaves/enters perpendicular to the chosen side (arrowhead points in).
function orthPorts(eP, eD, aP, aD, r) {
  const s1 = { x: eP.x + eD.x * STUB, y: eP.y + eD.y * STUB };
  const a1 = { x: aP.x + aD.x * STUB, y: aP.y + aD.y * STUB };
  const exitH = eD.x !== 0, entryH = aD.x !== 0;
  let mid;
  if (exitH && entryH) {
    const midX = (s1.x + a1.x) / 2;
    mid = [{ x: midX, y: s1.y }, { x: midX, y: a1.y }];
  } else if (!exitH && !entryH) {
    const midY = (s1.y + a1.y) / 2;
    mid = [{ x: s1.x, y: midY }, { x: a1.x, y: midY }];
  } else if (exitH) { // horizontal exit, vertical entry
    mid = [{ x: a1.x, y: s1.y }];
  } else {            // vertical exit, horizontal entry
    mid = [{ x: s1.x, y: a1.y }];
  }
  return roundedOrthPath([eP, s1, ...mid, a1, aP], r);
}

// A wire honors any pinned side (from_side / to_side); an un-pinned end auto-faces
// the other node, so it stays dynamic as the nodes move.
function linkPath(l) {
  const s = l.source, t = l.target;
  if (!s || !t || typeof s.x !== "number" || typeof t.x !== "number") return null;
  const fromSide = l.from_side || autoSide(s, t);
  const toSide = l.to_side || autoSide(t, s);
  return orthPorts(
    sidePoint(s, fromSide), sideDir(fromSide),
    sidePoint(t, toSide), sideDir(toSide), CORNER_R
  );
}

function pipelineToast(message, isError = true) {
    const host = document.getElementById("visualization");
    if (!host) return;
    const el = document.createElement("div");
    el.textContent = message;
    el.style.cssText = `
        position:absolute; left:50%; bottom:24px; transform:translateX(-50%);
        z-index:50; padding:8px 16px; border-radius:8px; font-size:12px;
        font-weight:600; color:#fff; pointer-events:none; white-space:nowrap;
        background:${isError ? "#c0433f" : "#3f9d5e"};
        box-shadow:0 4px 12px rgba(0,0,0,0.4);`;
    host.appendChild(el);
    setTimeout(() => el.remove(), 2600);
}

// --- Wire hover label ---------------------------------------------------------
// A small floating chip that follows the cursor while hovering a wire, naming
// the connection (source → target) so you can trace where a line comes from.
let LINK_TIP = null;

function linkLabel(ref) {
    if (ref && typeof ref === "object") return ref.label || ref.id;
    const n = GRAPH && GRAPH.nodes.find((x) => x.id === ref);
    return (n && (n.label || n.id)) || ref || "?";
}

function ensureLinkTip() {
    if (LINK_TIP && LINK_TIP.isConnected) return LINK_TIP;
    const host = document.getElementById("pipeline-visualizer-container");
    if (!host) return null;
    if (getComputedStyle(host).position === "static") host.style.position = "relative";
    const el = document.createElement("div");
    el.className = "link-tip";
    host.appendChild(el);
    LINK_TIP = el;
    return el;
}

function showTip(event, html) {
    const el = ensureLinkTip();
    if (!el) return;
    el.innerHTML = html;
    el.style.opacity = "1";
    moveLinkTip(event);
}

function showLinkTip(event, d) {
    showTip(event,
        `<b>${linkLabel(d.source)}</b>` +
        `<span style="opacity:.55;margin:0 5px">→</span>` +
        `${linkLabel(d.target)}`);
}

// Software icon hover: name the software, and say so when a click opens it.
function showIconTip(event, sw, openable) {
    showTip(event, openable
        ? `<b>${softwareLabel(sw)}</b><span style="opacity:.55;margin-left:6px">· open pipeline</span>`
        : `<b>${softwareLabel(sw)}</b>`);
}

function moveLinkTip(event) {
    if (!LINK_TIP) return;
    const host = document.getElementById("pipeline-visualizer-container");
    if (!host) return;
    const r = host.getBoundingClientRect();
    LINK_TIP.style.left = `${event.clientX - r.left}px`;
    LINK_TIP.style.top = `${event.clientY - r.top}px`;
}

function hideLinkTip() {
    if (LINK_TIP) LINK_TIP.style.opacity = "0";
}


export async function initAlchemyGraph() {
    const container = document.getElementById("pipeline-visualizer-container");
    if (!container) return;

    const response = await fetch(NET_CFG.dataUrl);
    const graphData = await response.json();
    ICON_MAP = graphData.icons || {};
    LABEL_MAP = graphData.labels || {};

    // Deterministic state object
    const state = {
        nodes: graphData.nodes,
        links: graphData.links,
        depthMap: computeDepthFromLinks(graphData.nodes, graphData.links),
        config: {
            laneColors: ["#141414", "#1a1a1a"], // Matches index.html bg
            nodeWidth: 180,
            nodeHeight: 60
        }
    };

    const handlers = {
        showTooltip: (event, d) => { /* logic */ },
        hideTooltip: () => { /* logic */ },
        findValidTaskUrl: async (d) => `/tasks/${d.id}`,
        findValidTaskUrlForSoftware: async (d, sw) => `/task-map/${sw}/${d.id}`
    };

    renderNetworkView(state, handlers);
}

export function renderNetworkView(state, handlers) {
    const { nodes, links, depthMap, config } = state;
    const visualization = d3.select("#visualization");
    visualization.selectAll("*").remove();

    const container = document.getElementById("pipeline-visualizer-container");
    const viewH = container.clientHeight || 800;

    // Horizontal spacing between dependency depths for the INITIAL auto-scatter.
    // There are no phase columns anymore — this is just how far apart un-placed
    // nodes start; you drag them wherever you like from there.
    const laneWidth = 380;
    const maxDepth = d3.max(Object.values(depthMap)) || 0;
    const totalWidth = (maxDepth + 1) * laneWidth;

    // Size nodes, then scatter them into depth columns (stacked, non-overlapping)
    // as the initial arrangement. Returns the canvas height.
    computeHeights(nodes, links);
    const height = layoutColumns(nodes, links, depthMap, viewH, laneWidth, true);

    // Manual placements win over the computed columns: any node the user has
    // dragged is snapped to its saved spot and PINNED (fx/fy) so the force sim
    // leaves it alone. Un-placed nodes keep their auto-layout slot.
    applySavedPositions(nodes);

    const svg = visualization.append("svg")
        .attr("width", totalWidth) // The SVG is now wider than the container
        .attr("height", height)
        .style("overflow", "visible"); // Allows for side-scrolling within the parent div

    // Filled arrowhead at the target end so the wire reads directionally, its tip
    // landing on the node edge (refX = tip) like a Lucid connector.
    svg.append("defs").append("marker")
        .attr("id", "arrow")
        .attr("viewBox", "0 -5 10 10")
        .attr("refX", 10)
        .attr("refY", 0)
        .attr("markerWidth", 8)
        .attr("markerHeight", 8)
        .attr("orient", "auto")
      .append("path")
        .attr("d", "M0,-5L10,0L0,5")
        .attr("fill", "#4a5568");

    // A faint snap grid, drawn as a tiling pattern so it pans/zooms with the graph
    // and visually communicates where nodes snap to.
    svg.select("defs").append("pattern")
        .attr("id", "snap-grid")
        .attr("width", GRID).attr("height", GRID)
        .attr("patternUnits", "userSpaceOnUse")
      .append("path")
        .attr("d", `M${GRID},0 L0,0 L0,${GRID}`)
        .attr("fill", "none")
        .attr("stroke", "#181818")
        .attr("stroke-width", 1);

    const svgGroup = svg.append("g");

    // Grid rect at the very bottom of the z-stack. Oversized so it still fills the
    // view when the graph is panned around.
    svgGroup.append("rect")
        .attr("class", "grid-bg")
        .attr("x", -4000).attr("y", -4000)
        .attr("width", totalWidth + 8000).attr("height", height + 8000)
        .attr("fill", "url(#snap-grid)")
        .style("pointer-events", "none");

    // Standard Zoom/Pan remains for tablet/laptop users. Kept in ZOOM so the
    // "Fit" button can animate the transform to frame all nodes.
    ZOOM = d3.zoom().on("zoom", (event) => {
        svgGroup.attr("transform", event.transform);
    });
    svg.call(ZOOM);

    createForceSimulation(svgGroup, nodes, links, depthMap, laneWidth, height, handlers, svg);

    // Frame the whole graph once the seeded layout has painted.
    if (NET_CFG.fitOnLoad) requestAnimationFrame(() => fitToScreen(0));
}

function createForceSimulation(
  svg,
  nodes,
  links,
  depthMap,
  laneWidth,
  height,
  handlers,
  svgEl
) {
  // Explicit layers keep links under nodes and give the sync/edit code stable
  // parents to (re)bind against.
  const linksLayer = svg.append("g").attr("class", "links-layer");
  const nodesLayer = svg.append("g").attr("class", "nodes-layer");

  // Initial auto-scatter: forceX spreads nodes by dependency depth, forceY holds
  // each at its assigned non-overlapping slot, collide is a backstop. The link
  // force is kept only to resolve source/target to node objects (strength 0 so it
  // can't pull nodes off their slots). Dragged (pinned) nodes ignore all of this.
  const simulation = d3.forceSimulation(nodes)
    .force("link", d3.forceLink(links).id(d => d.id).strength(0))
    .force("x", d3.forceX(d =>
      (depthMap[d.id] || 0) * laneWidth + laneWidth / 2
    ).strength(1))
    .force("y", d3.forceY(d => d._laneY ?? height / 2).strength(0.5))
    .force("collide", d3.forceCollide().radius(d => ((d._h || MIN_NODE_H) / 2) + LANE_GAP / 2).strength(0.85))
    .on("tick", ticked);

  // Publish live handles so the connect/disconnect handlers can edit in place.
  GRAPH = {
    nodes, links, depthMap, laneWidth, height,
    svgGroup: svg, svgEl, linksLayer, nodesLayer,
    simulation, handlers,
    linkSel: null, nodeSel: null,
  };

  const nodeGroup = nodesLayer.selectAll(".node")
    .data(nodes)
    .enter()
    .append("g")
    .attr("class", "node")
    .classed("read-only", NET_CFG.readOnly);

  if (!NET_CFG.readOnly) nodeGroup.call(
      d3.drag()
        .on("start", (event, d) => {
          if (!event.active) simulation.alphaTarget(0.3).restart();
          d.fx = d.x;
          d.fy = d.y;
          d._dragOrigin = { x: d.x, y: d.y };
          d._moved = false;
        })
        .on("drag", (event, d) => {
          // Snap the centre to the grid live, so nodes line up cleanly and the
          // orthogonal wires between aligned nodes become straight, tidy runs.
          d.fx = snap(event.x);
          d.fy = snap(event.y);
          if (Math.hypot(event.x - d._dragOrigin.x, event.y - d._dragOrigin.y) > 4)
            d._moved = true;
        })
        .on("end", (event, d) => {
          if (!event.active) simulation.alphaTarget(0);
          if (d._moved) {
            // A real drag: snap the final drop to the grid and pin/remember it,
            // so the chart keeps the tidy layout you build by hand. Snap here (not
            // just via the tick) so the saved value is exact even if the sim is idle.
            const sx = snap(event.x), sy = snap(event.y);
            d.x = d.fx = sx;
            d.y = d.fy = sy;
            d.pos = { x: sx, y: sy };
            GRAPH.nodeSel.filter((n) => n === d).attr("transform", `translate(${sx},${sy})`);
            if (GRAPH.linkSel) GRAPH.linkSel.attr("d", linkPath);
            savePosition(d.id, sx, sy);
          } else if (!d.pos) {
            // Just a click on an un-placed node (opens its task) — don't strand
            // it out of the auto-layout; release it back to the sim.
            d.fx = null;
            d.fy = null;
          }
          // else: a click on an already-placed node — keep it pinned.
        })
    );

  // Node background
  nodeGroup.append("rect")
      .attr("class", "network-node-rect") // Add this line
    .attr("width", 180)
    .attr("height", 84)
    .attr("x", -90)
    .attr("y", -42)
    .attr("rx", 10)
    .attr("ry", 10)
    .attr("fill", "#f9f9f9")
    .attr("stroke", "#444")
    .attr("stroke-width", 2);

  createNodeContent(nodeGroup, handlers);
  // The four blue connection dots (hover to reveal) — editing only.
  if (!NET_CFG.readOnly) addConnectHandles(nodeGroup);

  nodeGroup
    .on("mouseover", handlers.showTooltip)
    .on("mouseout", handlers.hideTooltip)
    .on("click", (event, d) => {
      const sw = d.software || [];
      if (sw.length === 1 && NET_CFG.canOpen(sw[0], d.id)) {
        NET_CFG.openPipeline(sw[0], d.id);
      }
    });

  GRAPH.nodeSel = nodeGroup;
  syncLinks(); // build the wire lines from GRAPH.links

  // Paint the seeded positions once up front so nodes/wires appear immediately,
  // without waiting for the first simulation tick (and so a fully-pinned,
  // at-rest graph still renders in place).
  nodeGroup.attr("transform", (d) => `translate(${d.x},${d.y})`);
  if (GRAPH.linkSel) GRAPH.linkSel.attr("d", linkPath);

  function ticked() {
    if (GRAPH.linkSel) GRAPH.linkSel.attr("d", linkPath);
    GRAPH.nodeSel.attr("transform", d => `translate(${d.x},${d.y})`);
  }
}

// (Re)bind the wire <path> elements to GRAPH.links so the DOM and the force's
// link list stay in step. One plain curve per link — no ports, no slots.
function syncLinks() {
  computeNodeHeights();
  const key = (d) => `${srcId(d)}::${tgtId(d)}`;

  let sel = GRAPH.linksLayer.selectAll("path.link").data(GRAPH.links, key);
  sel.exit().remove();

  const enter = sel.enter()
    .append("path")
    .attr("class", "link")
    .attr("fill", "none")
    .attr("stroke", "#4a5568")
    .attr("stroke-width", 1.75)
    .attr("marker-end", "url(#arrow)")
    // Hover highlights the wire and names it; click removes it (with a confirm).
    .on("mouseover", function (event, d) {
      d3.select(this).attr("stroke", "#e0534f").attr("stroke-width", 3);
      showLinkTip(event, d);
    })
    .on("mousemove", moveLinkTip)
    .on("mouseout", function () {
      d3.select(this).attr("stroke", "#4a5568").attr("stroke-width", 1.75);
      hideLinkTip();
    })
    .on("click", (event, d) => {
      event.stopPropagation();
      if (!NET_CFG.readOnly) deleteConnection(d);
    });

  GRAPH.linkSel = enter.merge(sel);
  GRAPH.simulation.force("link").links(GRAPH.links);
  // Draw immediately so a freshly-added wire appears without waiting for a tick.
  GRAPH.linkSel.attr("d", linkPath);

  if (GRAPH.nodeSel) applyNodeSize(GRAPH.nodeSel);
}

// Nodes are a uniform height now (no ports to stack). Kept as a function so the
// canvas-sizing and collision code can call it the same way.
function computeHeights(nodes, links) {
  nodes.forEach((n) => { n._h = MIN_NODE_H; });
}

function computeNodeHeights() {
  computeHeights(GRAPH.nodes, GRAPH.links);
}

// Initial auto-scatter: place nodes in columns by dependency depth, ordered
// within each column to reduce edge crossings (barycenter), stacked without
// overlap. Just a starting arrangement — there are no wire lanes to reserve, so
// nodes stack tightly. Sets n._laneY (sim target) and returns the canvas height;
// `seed` also snaps n.x/n.y on first render.
function layoutColumns(nodes, links, depthMap, viewH, laneWidth, seed) {
  const cols = {};
  const col = (d) => (cols[d] ||= []);
  // Band each node: 0 = shots (top), 1 = assets (bottom).
  nodes.forEach((n) => { n._band = categoryBand(n.category); col(depthMap[n.id] || 0).push(n); });

  // Plain adjacency between real endpoints — feeds the crossing-reduction pass.
  const adj = new Map();
  const join = (a, b) => {
    if (!adj.has(a)) adj.set(a, []);
    if (!adj.has(b)) adj.set(b, []);
    adj.get(a).push(b);
    adj.get(b).push(a);
  };
  const byId = new Map(nodes.map((n) => [n.id, n]));
  links.forEach((l) => {
    const s = byId.get(srcId(l));
    const t = byId.get(tgtId(l));
    if (s && t) join(s, t);
  });

  const keys = Object.keys(cols).map(Number).sort((a, b) => a - b);
  const pos = new Map();
  const reindex = () => keys.forEach((k) => cols[k].forEach((it, i) => pos.set(it, i)));
  // Stable initial order: band (shots over assets), then id.
  keys.forEach((k) => cols[k].sort((a, b) =>
    (a._band - b._band) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  ));
  reindex();

  // Barycenter ordering — band stays the PRIMARY key so shots never mix into the
  // asset band; barycenter only reorders within each band to cut crossings.
  for (let iter = 0; iter < 6; iter++) {
    keys.forEach((k) => {
      cols[k].forEach((it) => {
        const ns = adj.get(it) || [];
        it._bary = ns.length
          ? ns.reduce((s, x) => s + (pos.get(x) ?? 0), 0) / ns.length
          : (pos.get(it) ?? 0);
      });
      cols[k].sort((a, b) =>
        (a._band - b._band) || (a._bary - b._bary) || (pos.get(a) - pos.get(b)));
    });
    reindex();
  }

  // Relative stack per column, then measure so we can size the canvas. A wider
  // BAND_GAP is inserted once, where the column crosses from the shots band into
  // the assets band, giving the two groups clear visual separation.
  const region = (it) => (it._band < 0.5 ? 0 : 1);
  const extent = {};
  keys.forEach((k) => {
    let y = 0, prev = null, prevHalf = 0;
    cols[k].forEach((it) => {
      const half = it._h / 2;
      if (!prev) { y = half; }
      else {
        const gap = region(prev) !== region(it) ? BAND_GAP : LANE_GAP;
        y += prevHalf + gap + half;
      }
      it._relY = y;
      prev = it; prevHalf = half;
    });
    extent[k] = (prev ? y + prevHalf : 0);
  });

  const tallest = keys.reduce((m, k) => Math.max(m, extent[k]), 0);
  const height = Math.max(viewH, tallest + 2 * LANE_GAP);
  const mid = height / 2;

  // Center each column and commit positions.
  keys.forEach((k) => {
    const laneX = k * laneWidth + laneWidth / 2;
    const top = mid - extent[k] / 2;
    cols[k].forEach((it) => {
      it._laneY = top + it._relY;
      if (seed) { it.x = laneX; it.y = top + it._relY; }
    });
  });

  return height;
}

// Push computed heights onto the DOM: resize the rect, float the alchemy badge
// to the new top edge, and set the collide radius to reserve LANE_GAP between
// stacked nodes (radius = halfHeight + halfGap, so edge-to-edge gap == LANE_GAP).
function applyNodeSize(nodeSel) {
  nodeSel.select("rect.network-node-rect")
    .attr("height", (d) => d._h)
    .attr("y", (d) => -d._h / 2);
  nodeSel.select("image.alchemy-badge")
    .attr("y", (d) => -d._h / 2 - 14);
  GRAPH.simulation.force("collide")
    .radius((d) => ((d._h || MIN_NODE_H) / 2) + LANE_GAP / 2);
}

// --- Manual placement (pin & remember) ----------------------------------------

// Snap every node that has a saved position to it and PIN it (fx/fy), so the
// force sim can't drag it back into a column. Un-placed nodes keep the slot
// layoutColumns gave them and still flow into the auto layout.
function applySavedPositions(nodes) {
  nodes.forEach((n) => {
    const p = n.pos;
    if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) {
      n.x = n.fx = p.x;
      n.y = n.fy = p.y;
    }
  });
}

// Persist one node's dropped position. Fire-and-forget — a failed save just
// means that node re-auto-lays out next reload; we surface it, not block on it.
async function savePosition(id, x, y) {
  try {
    const res = await fetch("/api/v1/visualizer/positions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, x, y }),
    });
    if (!res.ok) pipelineToast("Couldn't save that position.");
  } catch (err) {
    console.error(err);
    pipelineToast("Couldn't save that position.");
  }
}

// --- Connect (Lucid-style dots) -----------------------------------------------

// Four connection dots at the cardinal edge midpoints of a node. Revealed on
// hover (CSS) but always grabbable; drag from one onto another node to wire a
// dependency. The dot you grab pins the wire's SOURCE side.
function addConnectHandles(nodeGroup) {
  nodeGroup.each(function (d) {
    const g = d3.select(this);
    const hh = (d._h || MIN_NODE_H) / 2;
    const spots = [
      { x: 0, y: -hh, side: "top" }, { x: NODE_HALF_W, y: 0, side: "right" },
      { x: 0, y: hh, side: "bottom" }, { x: -NODE_HALF_W, y: 0, side: "left" },
    ];
    spots.forEach((sp) => {
      const dot = g.append("g")
        .attr("class", "connect-dot")
        .attr("transform", `translate(${sp.x},${sp.y})`)
        .call(
          d3.drag()
            // svgGroup space matches node x/y regardless of zoom, so the preview
            // line and the target hit-test line up.
            .container(() => GRAPH.svgGroup.node())
            // Track the raw pointer. Without this, d3-drag's default subject is the
            // bound datum (the node), which offsets every event.x/y by the dot's
            // distance from the node centre — throwing off the drop hit-test.
            .subject((event) => ({ x: event.x, y: event.y }))
            .on("start", (event) => connectDragStart(event, d, sp.side))
            .on("drag", (event) => connectDragMove(event, d))
            .on("end", (event) => connectDragEnd(event, d))
        )
        // A plain click on a dot shouldn't fall through to the node (open task).
        .on("click", (event) => event.stopPropagation());
      dot.append("circle").attr("class", "dot-hit").attr("r", 10).attr("fill", "transparent");
      dot.append("circle").attr("class", "dot-visible").attr("r", 5);
    });
  });
}

// The node whose box (plus a small margin) contains (x,y) — so a drop anywhere on
// a node counts, not just near its centre.
function nodeAt(x, y, exceptId) {
  const m = 14;
  for (const n of GRAPH.nodes) {
    if (n.id === exceptId) continue;
    const hw = NODE_HALF_W + m, hh = (n._h || MIN_NODE_H) / 2 + m;
    if (x >= n.x - hw && x <= n.x + hw && y >= n.y - hh && y <= n.y + hh) return n;
  }
  return null;
}

function connectDragStart(event, d, side) {
  if (event.sourceEvent) event.sourceEvent.stopPropagation(); // don't move the node
  CONNECT_FROM = d;
  CONNECT_SIDE = side;
  TEMP_LINK = GRAPH.svgGroup.append("path")
    .attr("class", "temp-link")
    .attr("fill", "none")
    .attr("stroke", "#4a90d9").attr("stroke-width", 2)
    .attr("stroke-dasharray", "5,4")
    .attr("marker-end", "url(#arrow)")
    .style("pointer-events", "none");
  drawTempLink(event, d);
}

function drawTempLink(event, d) {
  if (!TEMP_LINK) return;
  // Leaves the grabbed source dot with the real routing. Over a target node it
  // snaps to that node's dot (or facing side); otherwise it runs out to the cursor.
  const eP = sidePoint(d, CONNECT_SIDE), eD = sideDir(CONNECT_SIDE);
  const cand = nodeAt(event.x, event.y, d.id);
  let pathD;
  if (cand) {
    const tSide = dotSideAt(cand, event.x, event.y) || autoSide(cand, d);
    pathD = orthPorts(eP, eD, sidePoint(cand, tSide), sideDir(tSide), CORNER_R);
  } else {
    const s1 = { x: eP.x + eD.x * STUB, y: eP.y + eD.y * STUB };
    const corner = eD.x !== 0 ? { x: event.x, y: s1.y } : { x: s1.x, y: event.y };
    pathD = roundedOrthPath([eP, s1, corner, { x: event.x, y: event.y }], CORNER_R);
  }
  TEMP_LINK.attr("d", pathD);
  GRAPH.nodeSel.classed("connect-target", (n) => !!cand && n.id === cand.id);
}

function connectDragMove(event, d) { drawTempLink(event, d); }

function connectDragEnd(event, d) {
  const from = CONNECT_FROM, fromSide = CONNECT_SIDE;
  if (TEMP_LINK) { TEMP_LINK.remove(); TEMP_LINK = null; }
  GRAPH.nodeSel.classed("connect-target", false);
  CONNECT_FROM = null;
  CONNECT_SIDE = null;
  if (!from) return;
  const cand = nodeAt(event.x, event.y, from.id);
  if (cand) {
    // Dropped on a specific dot → pin that target side; on the body → auto (null).
    const toSide = dotSideAt(cand, event.x, event.y);
    createConnection(from.id, cand.id, fromSide, toSide);
    return;
  }
  // Only nudge if they actually dragged off into empty space — a plain click on a
  // dot (released over its own node) is a no-op, not a missed connection.
  const overSource = nodeAt(event.x, event.y, null)?.id === from.id;
  if (!overSource) pipelineToast("Drop on a node to connect.", false);
}

// Persist a dependency (source -> target) and its pinned sides. The backend vetoes
// cycles; re-dropping between already-connected nodes just re-pins the sides.
async function createConnection(source, target, fromSide, toSide) {
  const existing = GRAPH.links.find((l) => srcId(l) === source && tgtId(l) === target);
  try {
    const res = await fetch("/api/v1/visualizer/links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source, target, from_side: fromSide, to_side: toSide }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      pipelineToast(data.error || "Could not connect those tasks.");
      return;
    }
    if (existing) {
      existing.from_side = fromSide || null;
      existing.to_side = toSide || null;
      syncLinks();
      pipelineToast(`Re-pinned ${source} → ${target}`, false);
    } else {
      GRAPH.links.push({ source, target, from_side: fromSide || null, to_side: toSide || null });
      syncLinks();
      pipelineToast(`Connected ${source} → ${target}`, false);
    }
  } catch (err) {
    console.error(err);
    pipelineToast("Could not connect those tasks.");
  }
}

// Remove a dependency (click a wire). Confirmed so a stray click can't nuke it.
async function deleteConnection(link) {
  const s = srcId(link), t = tgtId(link);
  if (!confirm(`Remove connection ${linkLabel(s)} → ${linkLabel(t)}?`)) return;
  try {
    const res = await fetch("/api/v1/visualizer/links", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: s, target: t }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      pipelineToast(data.error || "Could not remove that connection.");
      return;
    }
    GRAPH.links = GRAPH.links.filter((l) => !(srcId(l) === s && tgtId(l) === t));
    syncLinks();
    pipelineToast(`Removed ${s} → ${t}`, false);
  } catch (err) {
    console.error(err);
    pipelineToast("Could not remove that connection.");
  }
}

function createNodeContent(nodeGroup, handlers) {
  nodeGroup.each(function (d) {
    const g = d3.select(this);
    const iconSize = 24;
    const spacing = 8;

    // 1. Assign classes for CSS-driven styling
    g.classed("node-active", d.has_cookbook)
     .classed("node-potential", !d.has_cookbook);

    // Band tint: a faint cool wash for shot/sequence tasks, a faint warm wash for
    // asset tasks, so the two column groups read apart at a glance. Set as an inline
    // style (not attr) so it wins over the stylesheet's .node-active fill.
    if (d.has_cookbook) {
      g.select("rect.network-node-rect")
       .style("fill", categoryBand(d.category) === 1 ? "#f6efe6" : "#eef3f9");
    }

    // Apply a specific class to the rectangle for targeting
    g.select("rect").attr("class", "network-node-rect");

    // 2. Conditional Alchemy Badge (top-right corner; y set by applyNodeSize).
    if (d.has_cookbook) {
      g.append("image")
        .attr("class", "alchemy-badge")
        .attr("xlink:href", iconUrl("alchemy"))
        .attr("x", 65).attr("y", -56)
        .attr("width", 32).attr("height", 32)
        .style("filter", "drop-shadow(0 0 4px rgba(149, 214, 164, 0.6))");
    }

    const icons = (d.software || []).slice(0, 3);
    const labelText = d.label || d.id;

    // 3. UNIFIED LAYOUT: label always on top, icons always centered below.
    //    Same font size for every node regardless of icon count.
    g.append("text")
      .attr("y", -8)
      .attr("text-anchor", "middle")
      .attr("class", "node-label font-bold")
      .text(labelText);

    if (icons.length) {
      const rowWidth = icons.length * (iconSize + spacing) - spacing;
      let startX = -rowWidth / 2;

      icons.forEach((sw, i) => {
        const openable = d.has_cookbook && NET_CFG.canOpen(sw, d.id);
        g.append("image")
          .attr("xlink:href", iconUrl(sw))
          .attr("x", startX + i * (iconSize + spacing))
          .attr("y", 8)
          .attr("width", iconSize).attr("height", iconSize)
          .classed("sw-icon", true)
          .classed("openable", openable)
          .on("mouseover", (e) => showIconTip(e, sw, openable))
          .on("mousemove", moveLinkTip)
          .on("mouseout", hideLinkTip)
          .on("click", (e) => {
             e.stopPropagation();
             if (openable) handlers.onSoftwareClick(e, d, sw);
          });
      });
    }
  });
}

export async function loadAndRenderPipeline() {
    const res = await fetch(NET_CFG.dataUrl);
    const data = await res.json();
    ICON_MAP = data.icons || {};
    LABEL_MAP = data.labels || {};

    // Calculate depth locally within the module
    const depthMap = computeDepthFromLinks(data.nodes, data.links);

    const state = {
        nodes: data.nodes,
        links: data.links,
        depthMap: depthMap,
        config: {
            laneColors: ["#141414", "#1a1a1a"]
        }
    };

    const handlers = {
        showTooltip: (e) => {},
        hideTooltip: () => {},
        // Matches the router: /cookbook/task-map/{software}/{task_id}
        onSoftwareClick: (e, d, sw) => {
            if (!d.has_cookbook) return;
            NET_CFG.openPipeline(sw, d.id);
        },
        onNodeClick: (e, d) => {
            window.location.href = `/tasks/${d.id}`;
        },
        // Ensuring background handlers also use the deterministic router path
        findValidTaskUrl: async (d) => `/tasks/${d.id}`,
        findValidTaskUrlForSoftware: async (d, sw) => `/cookbook/task-map/${sw}/${d.id}`
    };

    renderNetworkView(state, handlers);
}

// --- View controls (wired to the header buttons) ------------------------------

// Forget every manual placement and re-draw with the auto column layout. This
// is the "just get me something" reset — a clean slate to start arranging from.
export async function resetLayout() {
  if (!confirm("Clear all manual node positions and auto-arrange the pipeline?")) return;
  try {
    const res = await fetch("/api/v1/visualizer/positions", { method: "DELETE" });
    if (!res.ok) throw new Error("bad status");
  } catch (err) {
    console.error(err);
    pipelineToast("Could not reset the layout.");
    return;
  }
  await loadAndRenderPipeline();
  pipelineToast("Layout reset — auto-arranged.", false);
}

// Zoom/pan so the whole graph fits the viewport — handy once you've grouped
// things compactly and want them all on one screen.
export function fitToScreen(duration = 400) {
  if (!GRAPH || !ZOOM) return;
  const host = document.getElementById("visualization");
  if (!host) return;
  // Measure the nodes, not the whole group: it also holds the oversized snap-grid
  // background, which would make the "fit" zoom far out.
  const bbox = GRAPH.nodesLayer.node().getBBox();
  if (!bbox.width || !bbox.height) return;
  const fullW = host.clientWidth, fullH = host.clientHeight;
  const pad = 40;
  const scale = Math.min(
    3,
    0.95 / Math.max((bbox.width + pad) / fullW, (bbox.height + pad) / fullH)
  );
  const cx = bbox.x + bbox.width / 2, cy = bbox.y + bbox.height / 2;
  const t = d3.zoomIdentity
    .translate(fullW / 2 - scale * cx, fullH / 2 - scale * cy)
    .scale(scale);
  if (duration) GRAPH.svgEl.transition().duration(duration).call(ZOOM.transform, t);
  else GRAPH.svgEl.call(ZOOM.transform, t);
}

// static/js/alchemy-network.js

// static/js/network-view.js

export function filterGraph(category) {
    const duration = 300;
    // Normalize the incoming filter string
    const catLower = String(category).toLowerCase().trim();

    console.log(`Alchemy Filter Active: "${catLower}"`);

    // 1. Update Buttons
    d3.selectAll(".filter-btn")
        .classed("bg-alcGreen text-black font-bold border-none", function() {
            const btnText = this.innerText.toLowerCase().trim();
            return btnText === catLower || (catLower === 'all' && btnText === 'all');
        })
        .classed("border-[#333] text-[#888]", function() {
            const btnText = this.innerText.toLowerCase().trim();
            return !(btnText === catLower || (catLower === 'all' && btnText === 'all'));
        });

    // 2. Filter Nodes
    d3.selectAll(".node")
        .transition().duration(duration)
        .style("opacity", d => {
            if (catLower === 'all') return 1;

            // Debugging: If nodes are going dark, let's see what they actually have
            const nodeCat = String(d.category || "none").toLowerCase().trim();

            if (nodeCat === catLower) return 1;
            return 0.1;
        });

    // 3. Filter Links
    d3.selectAll(".link")
        .transition().duration(duration)
        .style("opacity", d => {
            if (catLower === 'all') return 0.6;

            // Handle D3 hydrated objects (source/target become node objects)
            const srcCat = String(d.source.category || "").toLowerCase().trim();
            const tgtCat = String(d.target.category || "").toLowerCase().trim();

            return (srcCat === catLower || tgtCat === catLower) ? 0.6 : 0.02;
        });
}
