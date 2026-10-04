
// Asset/data resolution is indirected through window.ALC_CFG so a SINGLE copy of
// this file serves both the live app (absolute paths + live recipes API) and the
// exported static bundle (relative paths + baked JSON). The defaults below
// reproduce the live-app behavior exactly, so the app's HTML shell needs no
// changes — only the export shell injects a window.ALC_CFG to override them.
const ALC_CFG = Object.assign({
    cssHref: '/pipeline_viewer/static/css/style.css',
    dataUrl: (sw, task) => `/api/v1/recipes/${sw}/${task}`,
    softwareIcon: (sw) => `/static/icons/software/${sw}.png`,
    phaseIcon: (name) => `/static/icons/phases/${name}_button.png`,
}, window.ALC_CFG || {});

const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = ALC_CFG.cssHref;
document.head.appendChild(link);

window.averageHourlyRate = 75.00; // Average cost per artist hour

// Pricing (dollar figures) is hidden by default: showing hours makes the same
// point without inviting rate debates. Flip to true (e.g. set window.SHOW_PRICING
// in the page shell) to surface the derived dollar savings again.
window.SHOW_PRICING = window.SHOW_PRICING ?? false;

// Render "<hours> &middot; $<dollars>" or just "<hours>" depending on the flag.
function fmtSavings(hours, { green = false } = {}) {
    const cls = green ? ' class="alc-green-text"' : "";
    const dur = green ? `<span${cls}>${fmtDuration(hours)}</span>` : fmtDuration(hours);
    if (!window.SHOW_PRICING) return dur;
    const dollars = `$${Math.round(hours * window.averageHourlyRate).toLocaleString()}`;
    return `${dur} &middot; ${green ? `<span${cls}>${dollars}</span>` : dollars}`;
}


const tooltipEl = document.createElement('div');
tooltipEl.className = 'factory-tooltip';
document.body.appendChild(tooltipEl);

document.addEventListener('mouseover', (e) => {
    const trigger = e.target.closest('.html-tooltip-trigger');
    if (trigger) {
        tooltipEl.innerHTML = trigger.getAttribute('data-tooltip-content');
        tooltipEl.classList.add('visible');

        const rect = trigger.getBoundingClientRect();
        tooltipEl.style.left = `${rect.left + (rect.width / 2)}px`;
        tooltipEl.style.top = `${rect.top - 10}px`;
    }
});

document.addEventListener('mouseout', (e) => {
    if (e.target.closest('.html-tooltip-trigger')) {
        tooltipEl.classList.remove('visible');
    }
});





export async function initTaskMap() {
    // These constants are injected into the window by the HTML shell
    const software = window.SOFTWARE;
    const taskId = window.TASK_ID;

    console.log(`Alchemy Task View: Loading ${taskId} for ${software}`);

    try {
        // Fetch the filtered manifest (live API, or baked JSON in the static bundle)
        const response = await fetch(ALC_CFG.dataUrl(software, taskId));
        console.log(`response: ${response}`);
        if (!response.ok) throw new Error("Failed to load recipes");

        const data = await response.json();
        console.log(`data: ${data}`);
        const phases = data.phases

        console.log(`phases: ${phases}`);
        renderTaskPhases(phases);
    } catch (err) {
        console.error("Alchemy Task View Error:", err);
        document.getElementById("task-root").innerHTML =
            `<div class="p-8 text-red-500">Error loading task map: ${err.message}</div>`;
    }
}

// Selector-driven entrypoint for the exported static bundle. It reads the curated
// allowlist from window.ALC_PIPELINES (shape: { software: { label, tasks: [{id,
// label}] } }), builds the software + pipeline <select>s, and on every change sets
// the window globals initTaskMap()/renderTaskPhases() read, then delegates to the
// SAME render path as the live app. Inert unless ALC_PIPELINES is present, so
// importing this module in the app changes nothing.
export async function initTaskMapBrowser() {
    const pipelines = window.ALC_PIPELINES || {};
    const softwareKeys = Object.keys(pipelines);
    if (!softwareKeys.length) {
        document.getElementById("task-root").innerHTML =
            `<div class="p-8 text-red-500">No pipelines configured.</div>`;
        return;
    }

    // Department is the PRIMARY axis: people browse by "what pipeline/department"
    // (Model, Lookdev, ...) before "in which DCC". Invert the software->tasks map
    // into department-major: deptId -> { label, softwares: [{id, label}] }.
    // Departments keep the order they're first seen across the software list, and
    // the Software select is filtered to those that actually have the chosen
    // department (Maya, e.g., only carries Model + Rig).
    const deptOrder = [];
    const depts = {};
    for (const sw of softwareKeys) {
        const swLabel = pipelines[sw].label || sw;
        for (const t of (pipelines[sw].tasks || [])) {
            if (!depts[t.id]) { depts[t.id] = { label: t.label || t.id, softwares: [] }; deptOrder.push(t.id); }
            depts[t.id].softwares.push({ id: sw, label: swLabel });
        }
    }

    // Build the control bar (Department first, then Software) above the render root.
    const bar = document.createElement("div");
    bar.className = "task-browser-bar";
    bar.innerHTML = `
        <label class="task-browser-field">Department
            <select id="tb-dept"></select>
        </label>
        <label class="task-browser-field">Software
            <select id="tb-software"></select>
        </label>`;
    const root = document.getElementById("task-root");
    root.parentNode.insertBefore(bar, root);

    const deptSel = bar.querySelector("#tb-dept");
    const swSel = bar.querySelector("#tb-software");

    deptSel.innerHTML = deptOrder
        .map(d => `<option value="${d}">${depts[d].label}</option>`)
        .join("");

    function populateSoftware(deptId) {
        const list = (depts[deptId] && depts[deptId].softwares) || [];
        swSel.innerHTML = list
            .map(s => `<option value="${s.id}">${s.label}</option>`)
            .join("");
    }

    async function render() {
        const task = deptSel.value;
        const sw = swSel.value;
        const entry = pipelines[sw] || {};
        const taskEntry = (entry.tasks || []).find(t => t.id === task) || {};
        window.SOFTWARE = sw;
        window.SOFTWARE_LABEL = entry.label || sw;
        window.TASK_ID = task;
        window.TASK_LABEL = taskEntry.label || task;
        await initTaskMap();
    }

    deptSel.addEventListener("change", () => { populateSoftware(deptSel.value); render(); });
    swSel.addEventListener("change", render);

    populateSoftware(deptSel.value);
    await render();
}

// static/js/task-view.js

// Humanize a duration in artist-hours into something legible in a tooltip:
// minutes under an hour, hours under a workday, days (8h) beyond that.
function fmtDuration(h) {
    if (!h) return "0";
    if (h < 1) return `${Math.round(h * 60)} min`;
    if (h < 8) return `${h.toFixed(1).replace(/\.0$/, "")} hr`;
    return `${(h / 8).toFixed(1).replace(/\.0$/, "")} days`;
}

// A step is creative (artist-driven, not automated) if it lives in the art
// phase or is explicitly typed 'art' — it carries no time estimate.
function isCreativeStep(phaseName, step) {
    return phaseName === "art" || step.step_type === "art";
}

function renderTaskPhases(phases) {
    const root = document.getElementById("task-root");
    const software = window.SOFTWARE;
    const taskId = window.TASK_ID;
    const taskLabel = window.TASK_LABEL;
    root.innerHTML = "";

    // The pipeline phases shown as columns. Header stats are computed over
    // exactly these, so the numbers always match what's on screen (the manifest
    // also carries non-pipeline entries — shelves/tasks/ingest/etc. — that
    // aren't rendered here and shouldn't inflate the counts).
    const phaseOrder = ["start", "build", "art", "render", "review", "publish"];

    // 1. Counts + the total artist time saved per run.
    let technicalCount = 0;
    let creativeCount = 0;
    let totalSavedHours = 0;
    let clicks = 0;  // one "click" = one automatable (non-art) phase the artist runs

    phaseOrder.forEach(phaseName => {
        const recipes = phases[phaseName] || [];
        let phaseSteps = 0;
        recipes.forEach(recipe => {
            (recipe.steps || []).forEach(step => {
                phaseSteps += 1;
                if (isCreativeStep(phaseName, step)) {
                    creativeCount += 1;
                } else {
                    technicalCount += 1;
                    totalSavedHours += (step.expected_hours || 0);
                }
            });
        });
        if (phaseSteps > 0 && phaseName !== "art") clicks += 1;
    });

    // 2. Render the high-level Pie Chart header
    renderAnalyticsHeader(root, software, taskLabel, creativeCount, technicalCount, clicks, totalSavedHours);

    // 2b. Custom shelf/menu tool rows (artist-UI recipes for this task)
    renderToolShelves(root, phases, taskId);

    // 3. Render the original Factory Floor / Manifest Grid
    const container = document.createElement("div");
    container.className = "alchemy-grid";

    phaseOrder.forEach(phaseName => {
        const recipes = phases[phaseName] || [];
        const phaseCol = createPhaseColumn(phaseName, recipes);
        container.appendChild(phaseCol);
    });

    root.appendChild(container);
}


// Render the task's custom artist-UI recipes (shelves/menus/etc.) as labeled
// horizontal button rows above the phase pipeline — "Custom MDL Shelf: [btn][btn]".
function renderToolShelves(root, phases, taskId) {
    const T = taskId.toUpperCase();
    const bands = [
        { key: "shelves", label: `Custom ${T} Shelf` },
        { key: "menus", label: `Custom ${T} Menu` },
        { key: "context-menus", label: `${T} Context Menu` },
        { key: "tools", label: `${T} Tools` },
    ];

    bands.forEach(({ key, label }) => {
        const steps = (phases[key] || []).flatMap(r => r.steps || []);
        if (!steps.length) return;

        const buttons = steps.map(step => {
            const icon = step.icon_url
                ? `<img src="${step.icon_url}" class="tool-shelf-icon" alt="">`
                : `<i class="fa-solid fa-screwdriver-wrench tool-shelf-fallback"></i>`;
            const goal = (step.goal || "").replace(/'/g, "&#39;").slice(0, 200);
            return `<button class="tool-shelf-btn" title="${goal}">${icon}<span>${step.label || step.name}</span></button>`;
        }).join("");

        const band = document.createElement("div");
        band.className = "tool-shelf";
        band.innerHTML = `<span class="tool-shelf-label">${label}:</span><div class="tool-shelf-row">${buttons}</div>`;
        root.appendChild(band);
    });
}

function createPhaseColumn(name, recipes) {
    const col = document.createElement("div");
    col.className = `phase phase-${name}`;

    let phaseHours = 0;

    recipes.forEach(recipe => {
        (recipe.steps || []).forEach(step => {
            if (!isCreativeStep(name, step)) phaseHours += (step.expected_hours || 0);
        });
    });

    const header = document.createElement("div");
    header.className = "phase-header";

    // We use a custom attribute that will be parsed as HTML
    const phaseTooltip = `Saved per run: ${fmtSavings(phaseHours, { green: true })}`;

    header.innerHTML = `
        <div class="phase html-tooltip-trigger" data-tooltip-content='${phaseTooltip}'>
            <img src="${ALC_CFG.phaseIcon(name)}" class="phase-icon">
            <span class="phase-title">${name.toUpperCase()}</span>
        </div>
    `;
    col.appendChild(header);

    const body = document.createElement("div");
    body.className = "phase-body";
    if (name === 'art') body.classList.add("unlocked");

    const stepNodes = [];
    recipes.forEach(recipe => {
        (recipe.steps || []).forEach(step => {
            const creative = isCreativeStep(name, step);
            const btn = document.createElement("div");
            btn.className = creative ? "node creative html-tooltip-trigger" : "node html-tooltip-trigger";

            // The tooltip teaches the "why": what the manual baseline costs and
            // the human scenarios behind the min/max. Creative work is flagged
            // as not-automated rather than given a (meaningless) zero estimate.
            let stepTooltip;
            if (creative) {
                stepTooltip = `<div style="max-width:240px;text-align:left;white-space:normal;line-height:1.4;">`
                    + `<b style="color:#ff66c4;">Creative work</b><br>`
                    + `Artist-driven — Alchemy doesn't automate this, so it carries no time estimate.</div>`;
            } else {
                const exp = step.expected_hours || 0;
                const minH = step.min_hours || 0;
                const maxH = step.max_hours || 0;
                const minS = step.min_scenario || "";
                const maxS = step.max_scenario || "";
                stepTooltip = `<div style="max-width:300px;text-align:left;white-space:normal;line-height:1.45;">`
                    + `<div class="alc-green-text" style="font-weight:700;margin-bottom:2px;">Saves ~${fmtSavings(exp)}/run</div>`
                    + `<div style="color:#888;margin-bottom:6px;">By hand normally: ${fmtDuration(minH)} – ${fmtDuration(maxH)}</div>`
                    + (minS ? `<div style="margin-bottom:4px;"><b style="color:#bbb;">Best case:</b> ${minS}</div>` : "")
                    + (maxS ? `<div><b style="color:#bbb;">Worst case:</b> ${maxS}</div>` : "")
                    + `</div>`;
            }
            btn.setAttribute('data-tooltip-content', stepTooltip);

            btn.innerHTML = `<span class="step-label">${step.label}</span>`;
            body.appendChild(btn);
            stepNodes.push(btn);
        });
    });

    col.onmouseenter = () => body.classList.add("unlocked");

    // Click the phase button: play a press animation on the button, then ripple a
    // highlight down through the steps one after another (same look as hovering a
    // step). This is the first-pass "feel" pass — no execution wired in yet.
    const phaseBtn = header.querySelector(".phase");
    if (phaseBtn) {
        phaseBtn.style.cursor = "pointer";
        phaseBtn.addEventListener("click", () => {
            body.classList.add("unlocked"); // make sure steps are visible to ripple

            // Button-press animation: re-trigger by removing/re-adding the class.
            phaseBtn.classList.remove("pressed");
            void phaseBtn.offsetWidth; // reflow so the animation restarts
            phaseBtn.classList.add("pressed");

            rippleSteps(stepNodes);
        });
    }

    col.appendChild(body);
    return col;
}

// Highlight each step in order, one after another, then fade it back out — the
// same visual as hovering a step (.node.ripple-hl mirrors .node:hover). The
// stagger makes it read as a wave flowing down the phase.
function rippleSteps(nodes) {
    const STAGGER = 70;  // ms between each step lighting up
    const HOLD = 320;    // ms a step stays lit before fading
    nodes.forEach((node, i) => {
        setTimeout(() => {
            node.classList.add("ripple-hl");
            setTimeout(() => node.classList.remove("ripple-hl"), HOLD);
        }, i * STAGGER);
    });
}

function runRecipeStep(step) {
    console.log(`Alchemy Execution: Triggering ${step.module}`);
    // This will eventually call your FastAPI execution endpoint
}

function renderAnalyticsHeader(parent, software, taskId, artCount, choreCount, clickCount, totalSavedHours = 0) {
    const hero = document.createElement("div");
    hero.className = "pipeline-header-container";

    hero.innerHTML = `
        <div class="header-main-group">
            <div class="branding-group">
                <img src="${ALC_CFG.softwareIcon(software)}" class="software-badge">
                <div class="branding-text">
                    <h1 class="pipeline-title">${taskId.toUpperCase()} PIPELINE</h1>
                    <div class="savings-callout">
                        <div class="savings-label">Automating chores saves</div>
                        <div class="savings-value">~${fmtSavings(totalSavedHours)} <span class="savings-unit">per run</span></div>
                    </div>
                </div>
            </div>

            <div class="analytics-group">
                <div class="metric-item">
                    <div class="visual-box small-chart">
                        <canvas id="realityChart"></canvas>
                    </div>
                    <div class="data-box">
                        <div class="val metric-headline"><span class="pink-text">Art</span> <span class="grey-text">+</span> <span class="white-text">${choreCount} Chores</span></div>
                        <div class="label grey-text">Done by hand</div>
                    </div>
                </div>

                <div class="metric-item">
                    <div class="visual-box">
                        <canvas id="alchemyChart"></canvas>
                    </div>
                    <div class="data-box">
                        <div class="val metric-headline"><span class="pink-text">Art</span> <span class="grey-text">+</span> <span class="alc-green-text">${clickCount} Clicks</span></div>
                        <div class="label grey-text small-tag flex-label">
                            <i class="fa-solid fa-circle-check alc-green-text"></i>
                            <span>Automated with Alchemy</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    parent.prepend(hero);

    setTimeout(() => {
        const realityCanvas = document.getElementById('realityChart');
        // Tear down any chart left over from a previous render of this canvas.
        Chart.getChart(realityCanvas)?.destroy();

        let alchemyTriggered = false;
        new Chart(realityCanvas.getContext('2d'), {
            type: 'doughnut',
            data: {
                datasets: [{
                    data: [artCount, choreCount],
                    backgroundColor: ['#ff00a6', '#333'],
                    borderColor: ['#ff00a6', '#444'],
                    borderWidth: 1
                }]
            },
            options: {
                cutout: '85%',
                plugins: { legend: { display: false } },
                maintainAspectRatio: false,
                animation: {
                    duration: 1500,
                    easing: 'easeOutQuart',
                    // TRIGGER SECOND CHART ON COMPLETION (once — onComplete
                    // also fires on resize, which would double-create the chart)
                    onComplete: () => {
                        if (alchemyTriggered) return;
                        alchemyTriggered = true;
                        renderAlchemyChart(clickCount);
                    }
                }
            }
        });
    }, 50);
}

function renderAlchemyChart(clickCount) {
    const alchemyCanvas = document.getElementById('alchemyChart');

    // Brief pause after the first one finishes for dramatic effect
    setTimeout(() => {
        // Tear down any prior chart so the canvas can be reused.
        Chart.getChart(alchemyCanvas)?.destroy();
        new Chart(alchemyCanvas.getContext('2d'), {
            type: 'doughnut',
            data: {
                datasets: [{
                    data: [1],
                    backgroundColor: ['#ff00a6'],
                    borderColor: ['#ff00a6'],
                    borderWidth: 1
                }]
            },
            options: {
                cutout: '85%',
                plugins: { legend: { display: false } },
                maintainAspectRatio: false,
                animation: {
                    duration: 1200,
                    easing: 'easeOutBack' // Give the second one a slightly different feel
                }
            }
        });
    }, 300);
}