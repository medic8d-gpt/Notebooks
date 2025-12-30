// Ops Wall Manager Sim (MVP)
// No deps. Serve with any static web server (python -m http.server).

const $ = (sel, root = document) => root.querySelector(sel);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const fmtInt = (n) => (Number.isFinite(n) ? Math.round(n).toLocaleString() : "—");
const fmtPct = (x) => `${Math.round(x * 100)}%`;
const pad2 = (n) => String(n).padStart(2, "0");

const FACILITY_NAME = "Nimbus Fulfillment — FC-17";
const PROCESS_ORDER = ["Receive", "Stow", "Pick", "Pack", "Sort", "Ship"];

// --- Seeded RNG ---
function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gaussian01(rng) {
  // Box-Muller
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}
function binomialApprox(n, p, rng) {
  if (n <= 0) return 0;
  p = clamp(p, 0, 1);
  const mean = n * p;
  const varr = n * p * (1 - p);
  const z = gaussian01(rng);
  const x = Math.round(mean + Math.sqrt(Math.max(0, varr)) * z);
  return clamp(x, 0, n);
}
function randInt(rng, loInclusive, hiInclusive) {
  const r = rng();
  return loInclusive + Math.floor(r * (hiInclusive - loInclusive + 1));
}
function pickWeighted(rng, items) {
  // items: [{w, v}]
  const total = items.reduce((s, it) => s + it.w, 0);
  let t = rng() * total;
  for (const it of items) {
    t -= it.w;
    if (t <= 0) return it.v;
  }
  return items[items.length - 1].v;
}

// --- Queue model (batches preserve due-times) ---
class Batch {
  constructor(units, dueTick, createdTick, tag = "STD") {
    this.units = units;
    this.dueTick = dueTick;
    this.createdTick = createdTick;
    this.tag = tag;
  }
}
class WorkQueue {
  constructor(name) {
    this.name = name;
    /** @type {Batch[]} */
    this.batches = [];
  }
  totalUnits() {
    return this.batches.reduce((s, b) => s + b.units, 0);
  }
  dueUnitsAtOrBefore(tick) {
    let s = 0;
    for (const b of this.batches) if (b.dueTick <= tick) s += b.units;
    return s;
  }
  highDwellUnits(nowTick, dwellTicks) {
    let s = 0;
    for (const b of this.batches) if (nowTick - b.createdTick >= dwellTicks) s += b.units;
    return s;
  }
  sortForSLA() {
    // stable-ish: dueTick then createdTick
    this.batches.sort((a, b) => (a.dueTick - b.dueTick) || (a.createdTick - b.createdTick));
  }
  pushBatch(batch) {
    if (batch.units <= 0) return;
    const last = this.batches[this.batches.length - 1];
    // merge if same due + tag (keep queue small)
    if (last && last.dueTick === batch.dueTick && last.tag === batch.tag) {
      last.units += batch.units;
      return;
    }
    this.batches.push(batch);
  }
  takeUnits(maxUnits, mode /* "SLA" | "FIFO" */) {
    if (maxUnits <= 0 || this.batches.length === 0) return [];
    if (mode === "SLA") this.sortForSLA();

    let remaining = maxUnits;
    const moved = [];
    while (remaining > 0 && this.batches.length > 0) {
      const b = this.batches[0];
      if (b.units <= remaining) {
        moved.push(b);
        this.batches.shift();
        remaining -= b.units;
      } else {
        const part = new Batch(remaining, b.dueTick, b.createdTick, b.tag);
        b.units -= remaining;
        moved.push(part);
        remaining = 0;
      }
    }
    return moved;
  }
}

// --- Processes ---
const PROCESS_DEFS = {
  Receive: { baseRate: 0.95, baseError: 0.010, baseFailProb: 0.008 },
  Stow:    { baseRate: 0.85, baseError: 0.012, baseFailProb: 0.007 },
  Pick:    { baseRate: 1.05, baseError: 0.015, baseFailProb: 0.010 },
  Pack:    { baseRate: 0.95, baseError: 0.018, baseFailProb: 0.010 },
  Sort:    { baseRate: 1.20, baseError: 0.020, baseFailProb: 0.012 },
  Ship:    { baseRate: 1.35, baseError: 0.010, baseFailProb: 0.006 },
};

// --- Scenario definitions (12) ---
const SCENARIOS = [
  {
    id: "baseline",
    name: "Normal Day (Baseline)",
    desc: "Balanced plan with minor noise. Good for learning the wall.",
    shiftMinutes: 30,
    plannedHeadcount: 80,
    startAssign: { Receive: 10, Stow: 10, Pick: 20, Pack: 18, Sort: 12, Ship: 10, SWAT: 0 },
    demandPerMin: 72,
    demandVar: 0.12,
    dueProfile: [{ w: 0.60, v: 24 }, { w: 0.30, v: 18 }, { w: 0.10, v: 12 }],
    otCapMinutes: 450, // 80 people * 30m => 2400 base; cap ~18.75% of base
    scheduled: [
      { type: "MICRO_JAMS", start: 6, duration: 10, warned: true, warnAt: 0, params: { addErr: 0.010 } },
    ],
  },
  {
    id: "late_linehaul",
    name: "Late Linehaul",
    desc: "Inbound arrival comes late, then floods you at peak.",
    shiftMinutes: 30,
    plannedHeadcount: 82,
    startAssign: { Receive: 8, Stow: 10, Pick: 22, Pack: 18, Sort: 14, Ship: 10, SWAT: 0 },
    demandPerMin: 70,
    demandVar: 0.10,
    dueProfile: [{ w: 0.55, v: 22 }, { w: 0.35, v: 16 }, { w: 0.10, v: 10 }],
    otCapMinutes: 480,
    scheduled: [
      { type: "DEMAND_SHAPE", start: 0, duration: 30, warned: true, warnAt: 0, params: { shape: "late" } },
      { type: "TRUCK_LATE", start: 0, duration: 8, warned: true, warnAt: 0, params: { demandMult: 0.35 } },
      { type: "DEMAND_SPIKE", start: 8, duration: 10, warned: true, warnAt: 4, params: { mult: 1.55 } },
    ],
  },
  {
    id: "sorter_down",
    name: "Sorter Down (20 minutes)",
    desc: "Sort capacity goes to zero. You need triage + SWAT.",
    shiftMinutes: 30,
    plannedHeadcount: 84,
    startAssign: { Receive: 10, Stow: 10, Pick: 21, Pack: 18, Sort: 15, Ship: 10, SWAT: 0 },
    demandPerMin: 74,
    demandVar: 0.10,
    dueProfile: [{ w: 0.60, v: 22 }, { w: 0.30, v: 16 }, { w: 0.10, v: 10 }],
    otCapMinutes: 520,
    scheduled: [
      { type: "PROCESS_DOWN", start: 10, duration: 10, warned: true, warnAt: 5, params: { process: "Sort" } },
      { type: "NO_READS", start: 6, duration: 8, warned: false, warnAt: 0, params: { addErr: 0.020 } },
    ],
  },
  {
    id: "pick_imbalance",
    name: "Pick Shortage (Inventory Imbalance)",
    desc: "Pick slows down; backlog shifts upstream and SLA risk spikes.",
    shiftMinutes: 30,
    plannedHeadcount: 80,
    startAssign: { Receive: 10, Stow: 10, Pick: 18, Pack: 20, Sort: 12, Ship: 10, SWAT: 0 },
    demandPerMin: 70,
    demandVar: 0.12,
    dueProfile: [{ w: 0.55, v: 22 }, { w: 0.35, v: 16 }, { w: 0.10, v: 10 }],
    otCapMinutes: 450,
    scheduled: [
      { type: "PROCESS_SLOW", start: 0, duration: 30, warned: true, warnAt: 0, params: { process: "Pick", mult: 0.78 } },
      { type: "BULKY_MIX", start: 12, duration: 10, warned: true, warnAt: 8, params: { mult: 0.88, addErr: 0.012 } },
    ],
  },
  {
    id: "new_hires",
    name: "New Hire Wave",
    desc: "You get extra heads, but they run slower and create errors until stabilized.",
    shiftMinutes: 30,
    plannedHeadcount: 78,
    startAssign: { Receive: 9, Stow: 9, Pick: 18, Pack: 18, Sort: 14, Ship: 10, SWAT: 0 },
    demandPerMin: 68,
    demandVar: 0.12,
    dueProfile: [{ w: 0.60, v: 22 }, { w: 0.30, v: 16 }, { w: 0.10, v: 10 }],
    otCapMinutes: 430,
    scheduled: [
      { type: "NEW_HIRES", start: 2, duration: 12, warned: true, warnAt: 0, params: { addHC: 16, slowMult: 0.86, addErr: 0.018 } },
    ],
  },
  {
    id: "peak_surge",
    name: "Peak Surge",
    desc: "Demand spikes hard. If you over-push, quality and safety spiral.",
    shiftMinutes: 30,
    plannedHeadcount: 86,
    startAssign: { Receive: 10, Stow: 10, Pick: 22, Pack: 20, Sort: 14, Ship: 10, SWAT: 0 },
    demandPerMin: 78,
    demandVar: 0.14,
    dueProfile: [{ w: 0.55, v: 20 }, { w: 0.35, v: 14 }, { w: 0.10, v: 9 }],
    otCapMinutes: 560,
    scheduled: [
      { type: "DEMAND_SPIKE", start: 6, duration: 16, warned: true, warnAt: 2, params: { mult: 1.65 } },
      { type: "CARRIER_DELAY", start: 18, duration: 8, warned: true, warnAt: 14, params: { shipMult: 0.85 } },
    ],
  },
  {
    id: "quality_spiral",
    name: "Quality Spiral (Rework Loop)",
    desc: "A labeling issue increases errors; exceptions steal capacity if not managed.",
    shiftMinutes: 30,
    plannedHeadcount: 82,
    startAssign: { Receive: 10, Stow: 10, Pick: 20, Pack: 18, Sort: 14, Ship: 10, SWAT: 0 },
    demandPerMin: 72,
    demandVar: 0.10,
    dueProfile: [{ w: 0.60, v: 22 }, { w: 0.30, v: 16 }, { w: 0.10, v: 10 }],
    otCapMinutes: 500,
    scheduled: [
      { type: "QUALITY_ISSUE", start: 5, duration: 18, warned: true, warnAt: 2, params: { addErr: 0.030 } },
      { type: "MICRO_JAMS", start: 10, duration: 10, warned: false, warnAt: 0, params: { addErr: 0.010 } },
    ],
  },
  {
    id: "safety_chain",
    name: "Safety Chain Risk",
    desc: "High fatigue baseline + audit pressure. Manage pace or take hard penalties.",
    shiftMinutes: 30,
    plannedHeadcount: 80,
    startAssign: { Receive: 10, Stow: 10, Pick: 20, Pack: 18, Sort: 12, Ship: 10, SWAT: 0 },
    demandPerMin: 70,
    demandVar: 0.10,
    dueProfile: [{ w: 0.60, v: 22 }, { w: 0.30, v: 16 }, { w: 0.10, v: 10 }],
    otCapMinutes: 450,
    scheduled: [
      { type: "FATIGUE_BASELINE", start: 0, duration: 30, warned: true, warnAt: 0, params: { fatigue: 0.45 } },
      { type: "SAFETY_AUDIT", start: 12, duration: 10, warned: true, warnAt: 8, params: { strict: 1 } },
    ],
  },
  {
    id: "cutoff_pullin",
    name: "Cutoff Pull-in",
    desc: "Carrier pulls cutoff earlier; you must protect urgent CPT buckets.",
    shiftMinutes: 30,
    plannedHeadcount: 82,
    startAssign: { Receive: 10, Stow: 10, Pick: 20, Pack: 18, Sort: 14, Ship: 10, SWAT: 0 },
    demandPerMin: 72,
    demandVar: 0.10,
    dueProfile: [{ w: 0.55, v: 18 }, { w: 0.35, v: 12 }, { w: 0.10, v: 8 }],
    otCapMinutes: 480,
    scheduled: [
      { type: "CUTOFF_PULLIN", start: 8, duration: 22, warned: true, warnAt: 4, params: { pullIn: 4 } },
      { type: "NO_READS", start: 14, duration: 8, warned: true, warnAt: 10, params: { addErr: 0.015 } },
    ],
  },
  {
    id: "absenteeism",
    name: "Absenteeism",
    desc: "Unexpected absences cut your staffing. Stabilize flow with less labor.",
    shiftMinutes: 30,
    plannedHeadcount: 84,
    startAssign: { Receive: 10, Stow: 10, Pick: 22, Pack: 18, Sort: 14, Ship: 10, SWAT: 0 },
    demandPerMin: 74,
    demandVar: 0.10,
    dueProfile: [{ w: 0.60, v: 22 }, { w: 0.30, v: 16 }, { w: 0.10, v: 10 }],
    otCapMinutes: 520,
    scheduled: [
      { type: "ABSENTEEISM", start: 0, duration: 14, warned: true, warnAt: 0, params: { missing: 16 } },
      { type: "DEMAND_SPIKE", start: 12, duration: 10, warned: true, warnAt: 8, params: { mult: 1.25 } },
    ],
  },
  {
    id: "system_glitch",
    name: "System Glitch Day",
    desc: "No-reads and scanning glitches raise rework and slow Sort/Ship.",
    shiftMinutes: 30,
    plannedHeadcount: 80,
    startAssign: { Receive: 10, Stow: 10, Pick: 20, Pack: 18, Sort: 12, Ship: 10, SWAT: 0 },
    demandPerMin: 70,
    demandVar: 0.12,
    dueProfile: [{ w: 0.60, v: 22 }, { w: 0.30, v: 16 }, { w: 0.10, v: 10 }],
    otCapMinutes: 450,
    scheduled: [
      { type: "NO_READS", start: 4, duration: 18, warned: true, warnAt: 0, params: { addErr: 0.030, slowSortMult: 0.88 } },
      { type: "MICRO_JAMS", start: 10, duration: 10, warned: false, warnAt: 0, params: { addErr: 0.010 } },
    ],
  },
  {
    id: "double_trouble",
    name: "Double Trouble",
    desc: "Demand surge overlaps with a Sort outage. Triage is mandatory.",
    shiftMinutes: 30,
    plannedHeadcount: 88,
    startAssign: { Receive: 10, Stow: 10, Pick: 24, Pack: 20, Sort: 14, Ship: 10, SWAT: 0 },
    demandPerMin: 80,
    demandVar: 0.14,
    dueProfile: [{ w: 0.55, v: 20 }, { w: 0.35, v: 14 }, { w: 0.10, v: 9 }],
    otCapMinutes: 580,
    scheduled: [
      { type: "DEMAND_SPIKE", start: 5, duration: 16, warned: true, warnAt: 1, params: { mult: 1.55 } },
      { type: "PROCESS_DOWN", start: 12, duration: 8, warned: true, warnAt: 8, params: { process: "Sort" } },
      { type: "CARRIER_DELAY", start: 18, duration: 10, warned: false, warnAt: 0, params: { shipMult: 0.85 } },
    ],
  },
];

// --- Event modifiers ---
function computeModifiers(state) {
  const mods = {
    demandMult: 1,
    duePullIn: 0,
    addErrAll: 0,
    addErrByProc: Object.fromEntries(PROCESS_ORDER.map((p) => [p, 0])),
    slowByProc: Object.fromEntries(PROCESS_ORDER.map((p) => [p, 1])),
    downByProc: Object.fromEntries(PROCESS_ORDER.map((p) => [p, false])),
    shipMult: 1,
    incidentRiskAdd: 0,
    newHireSlowMult: 1,
  };

  for (const ev of state.activeEvents) {
    switch (ev.type) {
      case "DEMAND_SPIKE":
        mods.demandMult *= ev.params.mult;
        break;
      case "TRUCK_LATE":
        mods.demandMult *= ev.params.demandMult;
        break;
      case "DEMAND_SHAPE":
        // handled in demand generator
        break;
      case "PROCESS_DOWN":
        mods.downByProc[ev.params.process] = true;
        break;
      case "PROCESS_SLOW":
        mods.slowByProc[ev.params.process] *= ev.params.mult;
        break;
      case "BULKY_MIX":
        mods.slowByProc.Pick *= ev.params.mult;
        mods.slowByProc.Pack *= ev.params.mult;
        mods.addErrAll += ev.params.addErr ?? 0;
        break;
      case "NO_READS":
        mods.addErrByProc.Sort += ev.params.addErr ?? 0;
        mods.addErrByProc.Ship += ev.params.addErr ?? 0;
        if (ev.params.slowSortMult) mods.slowByProc.Sort *= ev.params.slowSortMult;
        break;
      case "QUALITY_ISSUE":
        mods.addErrAll += ev.params.addErr ?? 0;
        break;
      case "MICRO_JAMS":
        mods.addErrAll += ev.params.addErr ?? 0;
        mods.incidentRiskAdd += 0.0004;
        break;
      case "CARRIER_DELAY":
        mods.shipMult *= ev.params.shipMult;
        break;
      case "CUTOFF_PULLIN":
        mods.duePullIn = Math.max(mods.duePullIn, ev.params.pullIn || 0);
        break;
      case "NEW_HIRES":
        mods.newHireSlowMult = Math.min(mods.newHireSlowMult, ev.params.slowMult || 1);
        mods.addErrAll += ev.params.addErr ?? 0;
        break;
      case "SAFETY_AUDIT":
        mods.incidentRiskAdd += 0.0012;
        break;
      default:
        break;
    }
  }

  return mods;
}

// --- Game state ---
let state = null;
let interval = null;

function freshState(scenario, seed) {
  const rng = mulberry32(seed);

  const queues = [];
  for (let i = 0; i < PROCESS_ORDER.length; i++) queues.push(new WorkQueue(`Q${i}`));
  const exceptions = new WorkQueue("Exceptions");

  const processes = {};
  for (const p of PROCESS_ORDER) {
    processes[p] = {
      name: p,
      extraLine: false,
      downTicks: 0,
      lastThroughput: 0,
      lastErrors: 0,
      ...PROCESS_DEFS[p],
    };
  }

  const startAssign = { ...scenario.startAssign };
  const swat = startAssign.SWAT ?? 0;
  delete startAssign.SWAT;

  const assignedTotal = Object.values(startAssign).reduce((s, n) => s + n, 0) + swat;
  const pool = Math.max(0, scenario.plannedHeadcount - assignedTotal);

  const s = {
    scenario,
    seed,
    rng,
    status: "stopped", // running|paused|ended
    speed: 1,
    tick: 0,
    shiftMinutes: scenario.shiftMinutes,
    plannedHeadcount: scenario.plannedHeadcount,
    assignments: startAssign,
    pool,
    swat,
    transit: [], // {to, from, count, arriveTick}
    priorityMode: "SLA", // SLA|Efficiency
    breakPlan: { baseStart: 15, duration: 5, delay: 0, usedDelay: false, breakFrac: 0.18 },
    maintenance: { escalated: false, laborTax: 2 },
    complianceRisk: 0.0,
    morale: 70,
    fatigue: 0.22,
    safety: { incidents: 0, standDownTicks: 0 },
    queues,
    exceptions,
    processes,
    activeEvents: [],
    futureEvents: scenario.scheduled.map((e, idx) => ({ id: `${scenario.id}:${idx}`, ...e })),
    alerts: [],
    log: [],
    history: {
      queueTotals: Object.fromEntries(PROCESS_ORDER.map((p) => [p, []])),
      shipped: [],
      late: [],
      exceptions: [],
    },
    metrics: {
      demandForecast: 0,
      demandActual: 0,
      demandUnits: 0,
      shippedOnTime: 0,
      shippedLate: 0,
      errors: 0,
      reworked: 0,
      laborMinutes: 0,
      otMinutes: 0,
      maintMinutes: 0,
    },
  };

  // Scenario-specific baseline tweaks via scheduled events
  for (const e of scenario.scheduled) {
    if (e.type === "FATIGUE_BASELINE") {
      s.fatigue = clamp(e.params.fatigue ?? s.fatigue, 0, 1);
    }
  }

  return s;
}

// --- Demand model ---
function demandForTick(state, mods) {
  const sc = state.scenario;
  let base = sc.demandPerMin;
  // Scheduled shape overlay
  const shapeEv = state.activeEvents.find((e) => e.type === "DEMAND_SHAPE");
  if (shapeEv?.params?.shape === "late") {
    const t = state.tick;
    // low early, high mid, normal late
    const factor = t < 8 ? 0.6 : (t < 18 ? 1.35 : 1.0);
    base *= factor;
  }

  // forecast is scenario base before random + event mult
  state.metrics.demandForecast += sc.demandPerMin;

  const noise = 1 + gaussian01(state.rng) * sc.demandVar;
  const demand = Math.max(0, Math.round(base * noise * mods.demandMult));
  return demand;
}

function makeDueTick(state, mods) {
  const sc = state.scenario;
  const offset = pickWeighted(state.rng, sc.dueProfile.map((x) => ({ w: x.w, v: x.v })));
  const pullIn = mods.duePullIn || 0;
  const raw = state.tick + Math.max(1, offset - pullIn);
  return Math.min(state.shiftMinutes, raw);
}

// --- Labor / staffing ---
function totalAssigned(state) {
  return Object.values(state.assignments).reduce((s, n) => s + n, 0) + state.swat;
}
function totalHeadcountActive(state) {
  return state.pool + totalAssigned(state) + state.transit.reduce((s, t) => s + t.count, 0);
}
function isBreakActive(state) {
  const start = state.breakPlan.baseStart + state.breakPlan.delay;
  return state.tick >= start && state.tick < start + state.breakPlan.duration;
}
function effectiveStaff(state, procName) {
  let staff = state.assignments[procName] || 0;
  if (isBreakActive(state)) {
    staff = staff * (1 - state.breakPlan.breakFrac);
  }
  // Stand-down slows pace rather than pulling everyone off, handled as throughput multiplier.
  return staff;
}
function transitCount(state) {
  return state.transit.reduce((s, t) => s + t.count, 0);
}

function applyTransitArrivals(state) {
  const arrived = [];
  for (const t of state.transit) {
    if (t.arriveTick <= state.tick) arrived.push(t);
  }
  if (arrived.length === 0) return;

  state.transit = state.transit.filter((t) => t.arriveTick > state.tick);

  for (const t of arrived) {
    if (t.to === "POOL") {
      state.pool += t.count;
    } else if (t.to === "SWAT") {
      state.swat += t.count;
    } else {
      state.assignments[t.to] = (state.assignments[t.to] || 0) + t.count;
    }
  }
}

function scheduleMove(state, from, to, count, travelTicks) {
  if (count <= 0) return;
  state.transit.push({ from, to, count, arriveTick: state.tick + travelTicks });
}

function moveFromProcTo(state, fromProc, to, count) {
  if (count <= 0) return 0;
  if (fromProc === "POOL") {
    const can = Math.min(count, state.pool);
    if (can <= 0) return 0;
    state.pool -= can;
    scheduleMove(state, "POOL", to, can, 2);
    return can;
  }
  if (fromProc === "SWAT") {
    const can = Math.min(count, state.swat);
    if (can <= 0) return 0;
    state.swat -= can;
    scheduleMove(state, "SWAT", to, can, 2);
    return can;
  }
  const have = state.assignments[fromProc] || 0;
  const can = Math.min(count, have);
  if (can <= 0) return 0;
  state.assignments[fromProc] = have - can;
  scheduleMove(state, fromProc, to, can, 2);
  return can;
}

// --- Events activation ---


function prettyEvent(e) {
  switch (e.type) {
    case "DEMAND_SPIKE": return `Demand spike ×${e.params.mult}`;
    case "TRUCK_LATE": return "Late truck (low arrivals)";
    case "DEMAND_SHAPE": return `Demand shape: ${e.params.shape}`;
    case "PROCESS_DOWN": return `${e.params.process} down`;
    case "PROCESS_SLOW": return `${e.params.process} slowed`;
    case "BULKY_MIX": return "Bulky item mix";
    case "NO_READS": return "No-reads / scan exceptions";
    case "QUALITY_ISSUE": return "Quality issue";
    case "MICRO_JAMS": return "Micro-jams";
    case "CARRIER_DELAY": return "Carrier delay";
    case "CUTOFF_PULLIN": return "Cutoff pull-in";
    case "NEW_HIRES": return "New hires";
    case "ABSENTEEISM": return "Absenteeism";
    case "SAFETY_AUDIT": return "Safety audit";
    default: return e.type;
  }
}

// --- Process sim ---
function moraleMult(state) {
  // 70 => ~1.0, range [0.88..1.12]
  return clamp(0.88 + (state.morale / 100) * 0.35, 0.75, 1.20);
}
function fatigueMult(state) {
  return clamp(1 - 0.35 * state.fatigue, 0.65, 1.05);
}

function tickFailures(state, mods) {
  for (const p of PROCESS_ORDER) {
    const proc = state.processes[p];
    if (proc.downTicks > 0) {
      proc.downTicks -= 1;
      continue;
    }
    if (mods.downByProc[p]) continue; // forced down via event (handled as throughput=0)
    const baseProb = proc.baseFailProb;
    const extra = proc.extraLine ? 0.004 : 0;
    const maint = state.maintenance.escalated ? 0.55 : 1.0;
    const prob = clamp((baseProb + extra) * maint, 0, 0.12);
    if (state.rng() < prob) {
      proc.downTicks = randInt(state.rng, 2, 6);
      addAlert(state, `${p}: equipment micro-failure (${proc.downTicks}m)`);
      logEvent(state, `FAIL: ${p} down ${proc.downTicks}m`);
    }
  }
}

function processStep(state, procName, inputQueue, outputQueue, mods, options = {}) {
  const proc = state.processes[procName];

  // throughput multipliers
  const priorityThroughput = state.priorityMode === "Efficiency" ? 1.06 : 0.98;
  const priorityMode = state.priorityMode === "Efficiency" ? "FIFO" : "SLA";

  let mult = 1;
  mult *= priorityThroughput;
  mult *= moraleMult(state);
  mult *= fatigueMult(state);
  mult *= mods.slowByProc[procName] || 1;
  mult *= mods.newHireSlowMult || 1;
  mult *= proc.extraLine ? 1.14 : 1.0;

  if (state.safety.standDownTicks > 0) mult *= 0.72;
  if (mods.shipMult && procName === "Ship") mult *= mods.shipMult;

  const isDown = proc.downTicks > 0 || mods.downByProc[procName] === true;
  if (isDown) {
    proc.lastThroughput = 0;
    proc.lastErrors = 0;
    return { processed: 0, errors: 0, good: 0, capacity: 0, isDown: true, mode: priorityMode };
  }

  const staff = effectiveStaff(state, procName);
  const capacity = Math.max(0, staff * proc.baseRate * mult);

  const want = Math.floor(capacity);
  if (want <= 0) {
    proc.lastThroughput = 0;
    proc.lastErrors = 0;
    return { processed: 0, errors: 0, good: 0, capacity, isDown: false, mode: priorityMode };
  }

  const moved = inputQueue.takeUnits(want, priorityMode);
  let processed = 0;
  let good = 0;
  let errors = 0;

  const priorityErrAdd = state.priorityMode === "Efficiency" ? 0.008 : 0.0;
  const errAdd = (mods.addErrAll || 0) + (mods.addErrByProc[procName] || 0) + priorityErrAdd;
  for (const b of moved) {
    processed += b.units;
    const errRate = clamp(proc.baseError + errAdd + 0.03 * state.fatigue, 0, 0.28);
    const e = binomialApprox(b.units, errRate, state.rng);
    const g = b.units - e;
    errors += e;
    good += g;

    if (options.finalSink) {
      // ship: score against due
      if (g > 0) {
        if (state.tick <= b.dueTick) state.metrics.shippedOnTime += g;
        else state.metrics.shippedLate += g;
      }
      if (e > 0) {
        // shipping errors also create exceptions
        state.exceptions.pushBatch(new Batch(e, b.dueTick, b.createdTick, "EXC"));
      }
    } else {
      if (g > 0) outputQueue.pushBatch(new Batch(g, b.dueTick, b.createdTick, b.tag));
      if (e > 0) state.exceptions.pushBatch(new Batch(e, b.dueTick, b.createdTick, "EXC"));
    }
  }

  proc.lastThroughput = good;
  proc.lastErrors = errors;
  state.metrics.errors += errors;

  return { processed, errors, good, capacity, isDown: false, mode: priorityMode };
}

function swatStep(state) {
  if (state.swat <= 0) return { cleared: 0 };
  // SWAT: clears exceptions back into Sort input (queue index 4 => before Sort is queue[4]? Actually pipeline:
  // q0->Receive->q1->Stow->q2->Pick->q3->Pack->q4->Sort->q5->Ship (sink)
  // so Sort input is q4.
  const qSortIn = state.queues[4];
  const staff = state.swat * (isBreakActive(state) ? (1 - state.breakPlan.breakFrac) : 1);
  const rate = 1.10; // units/min/worker
  const cap = Math.floor(staff * rate * moraleMult(state) * fatigueMult(state));
  const moved = state.exceptions.takeUnits(cap, "SLA");
  let cleared = 0;
  for (const b of moved) {
    cleared += b.units;
    qSortIn.pushBatch(new Batch(b.units, b.dueTick, b.createdTick, b.tag));
  }
  state.metrics.reworked += cleared;
  return { cleared };
}

// --- KPIs / Risk ---
function backlogInbound(state) {
  // upstream backlog (q0 + q1)
  return state.queues[0].totalUnits() + state.queues[1].totalUnits();
}
function backlogOutbound(state) {
  // mid+downstream (q2..q5) = Pick input through Ship input
  return state.queues[2].totalUnits() + state.queues[3].totalUnits() + state.queues[4].totalUnits() + state.queues[5].totalUnits();
}
function computeSlaRisk(state) {
  // heuristic: due-soon units vs projected ship capacity next 6 minutes
  const dueSoonTick = state.tick + 6;
  let dueSoon = 0;
  for (const q of state.queues) dueSoon += q.dueUnitsAtOrBefore(dueSoonTick);
  dueSoon += state.exceptions.dueUnitsAtOrBefore(dueSoonTick);

  const ship = state.processes.Ship;
  const mods = computeModifiers(state);
  const staff = effectiveStaff(state, "Ship");
  const mult = moraleMult(state) * fatigueMult(state) * (state.priorityMode === "Efficiency" ? 1.06 : 0.98) * (ship.extraLine ? 1.14 : 1.0) * (state.safety.standDownTicks > 0 ? 0.72 : 1.0) * mods.shipMult;
  const perMin = staff * ship.baseRate * mult;
  const projected = Math.max(1, Math.floor(perMin * 6));

  const ratio = dueSoon / projected;
  if (ratio <= 0.9) return { label: "GREEN", cls: "good" };
  if (ratio <= 1.15) return { label: "YELLOW", cls: "warn" };
  return { label: "RED", cls: "bad" };
}

// --- Alerts / Logs ---
function addAlert(state, msg) {
  state.alerts.unshift(`[t+${pad2(state.tick)}] ${msg}`);
  state.alerts = state.alerts.slice(0, 18);
}
function logEvent(state, msg) {
  state.log.unshift(`[t+${pad2(state.tick)}] ${msg}`);
  state.log = state.log.slice(0, 60);
}

// --- Tick ---


function activateEvents(state) {
  const startNow = state.futureEvents.filter((e) => e.start === state.tick);
  if (startNow.length) {
    for (const e of startNow) {
      state.activeEvents.push({ ...e, remaining: e.duration });
      logEvent(state, `EVENT: ${prettyEvent(e)} (start)`);
    }
    state.futureEvents = state.futureEvents.filter((e) => e.start !== state.tick);
  }

  // decrement + expire
  const still = [];
  const expired = [];
  for (const e of state.activeEvents) {
    e.remaining -= 1;
    if (e.remaining > 0) still.push(e);
    else expired.push(e);
  }
  state.activeEvents = still;

  // handle expired side-effects
  if (!state._expiredEvents) state._expiredEvents = [];
  for (const e of expired) {
    state._expiredEvents.push(e);
    logEvent(state, `EVENT: ${prettyEvent(e)} (end)`);
  }

  // apply restoration for certain expired types
  for (const e of expired) {
    if (e.type === "ABSENTEEISM") {
      const restore = e._restore || 0;
      if (restore > 0) {
        state.pool += restore;
        addAlert(state, `Absences resolved: +${restore} HC returned`);
      }
    }
  }
}

// Re-define step now that activateEvents changed
function step(state) {
  if (state.status !== "running") return;

  if (state.tick >= state.shiftMinutes) {
    endShift(state);
    return;
  }

  applyTransitArrivals(state);
  activateEvents(state);

  const mods = computeModifiers(state);

  // apply start-of-window staffing changes
  for (const ev of state.activeEvents) {
    if (ev._applied) continue;
    if (ev.type === "ABSENTEEISM" && state.tick === ev.start) {
      const missing = ev.params.missing || 0;
      let left = missing;
      if (state.pool > 0) {
        const take = Math.min(state.pool, left);
        state.pool -= take;
        left -= take;
      }
      const procsByHave = PROCESS_ORDER.map((p) => ({ p, n: state.assignments[p] || 0 }))
        .sort((a, b) => b.n - a.n);
      for (const it of procsByHave) {
        if (left <= 0) break;
        const take = Math.min(it.n, left);
        state.assignments[it.p] -= take;
        left -= take;
      }
      ev._restore = missing - left;
      addAlert(state, `Absences: -${ev._restore} HC for ${ev.duration}m`);
    }
    if (ev.type === "NEW_HIRES" && state.tick === ev.start) {
      const addHC = ev.params.addHC || 0;
      state.pool += addHC;
      addAlert(state, `New hires arrived: +${addHC} HC (low productivity)`);
    }
    ev._applied = true;
  }

  // tick random failures (unless forced down)
  tickFailures(state, mods);

  // demand arrivals into q0 (Receive input)
  const demandUnits = demandForTick(state, mods);
  state.metrics.demandActual += demandUnits;
  state.metrics.demandUnits += demandUnits;

  if (demandUnits > 0) {
    // split into 2-4 batches to preserve deadline variety
    let left = demandUnits;
    const parts = clamp(randInt(state.rng, 2, 4), 1, 6);
    for (let i = 0; i < parts; i++) {
      const take = i === parts - 1 ? left : Math.max(1, Math.floor(left * (0.35 + state.rng() * 0.20)));
      left -= take;
      const due = makeDueTick(state, mods);
      state.queues[0].pushBatch(new Batch(take, due, state.tick, "STD"));
      if (left <= 0) break;
    }
  }

  // process pipeline: Receive->Stow->Pick->Pack->Sort->Ship
  const q = state.queues;
  processStep(state, "Receive", q[0], q[1], mods);
  processStep(state, "Stow",    q[1], q[2], mods);
  processStep(state, "Pick",    q[2], q[3], mods);
  processStep(state, "Pack",    q[3], q[4], mods);
  processStep(state, "Sort",    q[4], q[5], mods);
  processStep(state, "Ship",    q[5], null, mods, { finalSink: true });

  // SWAT clears exceptions after main flow
  swatStep(state);

  // update fatigue & morale
  const workFrac = isBreakActive(state) ? 0.78 : 1.0;
  const otStaff = Math.max(0, totalHeadcountActive(state) - state.plannedHeadcount);
  const otLoad = otStaff / Math.max(1, state.plannedHeadcount);
  const delayPenalty = state.breakPlan.delay > 0 ? 0.006 : 0;

  if (state.safety.standDownTicks > 0) {
    state.fatigue = clamp(state.fatigue - 0.020, 0, 1);
    state.safety.standDownTicks -= 1;
  } else {
    state.fatigue = clamp(state.fatigue + (0.012 * workFrac) + 0.010 * otLoad + delayPenalty, 0, 1);
    if (isBreakActive(state)) state.fatigue = clamp(state.fatigue - 0.010, 0, 1);
  }

  const sla = computeSlaRisk(state);
  const exc = state.exceptions.totalUnits();
  const outBacklog = backlogOutbound(state);

  // morale drift + response
  let dm = 0;
  if (sla.label === "RED") dm -= 1.2;
  if (sla.label === "YELLOW") dm -= 0.4;
  if (exc > 120) dm -= 0.6;
  if (outBacklog < 120) dm += 0.3;
  if (otStaff > 0) dm -= 0.25 * otStaff / 5;
  if (state.maintenance.escalated) dm -= 0.1;
  if (state.safety.incidents > 0) dm -= 0.5;

  state.morale = clamp(state.morale + dm, 35, 92);

  // safety incident chance
  const extraLineCount = PROCESS_ORDER.reduce((s, p) => s + (state.processes[p].extraLine ? 1 : 0), 0);
  const baseRisk = 0.0015;
  const risk =
    baseRisk *
      (1 + 2.7 * state.fatigue) *
      (state.priorityMode === "Efficiency" ? 1.18 : 1.0) *
      (1 + 0.05 * extraLineCount) *
      (isBreakActive(state) ? 1.05 : 1.0) +
    mods.incidentRiskAdd;

  if (state.safety.standDownTicks <= 0 && state.rng() < clamp(risk, 0, 0.08)) {
    state.safety.incidents += 1;
    state.safety.standDownTicks = 3;
    state.morale = clamp(state.morale - 6, 30, 95);
    addAlert(state, "Safety incident: pace reset + stand-down");
    logEvent(state, "INCIDENT: safety (auto stand-down 3m)");
    // hard guardrail pressure
    state.complianceRisk = clamp(state.complianceRisk + 0.18, 0, 1);
  }

  // compliance risk (OT + break delay)
  const otMinThisTick = Math.max(0, otStaff) * 1; // per-minute tick
  state.metrics.otMinutes += otMinThisTick;
  const baseLaborMin = totalHeadcountActive(state) * 1;
  state.metrics.laborMinutes += baseLaborMin;
  if (state.maintenance.escalated) state.metrics.maintMinutes += state.maintenance.laborTax;

  if (otMinThisTick > 0) state.complianceRisk = clamp(state.complianceRisk + 0.0025 * (otStaff / 10), 0, 1);
  if (state.breakPlan.delay > 0) state.complianceRisk = clamp(state.complianceRisk + 0.004, 0, 1);

  // Safety audit increases compliance pressure (already increases incidentRiskAdd); also penalize if high fatigue
  if (state.activeEvents.some((e) => e.type === "SAFETY_AUDIT") && state.fatigue > 0.65) {
    state.complianceRisk = clamp(state.complianceRisk + 0.010, 0, 1);
  }

  // record history
  for (let i = 0; i < PROCESS_ORDER.length; i++) {
    const p = PROCESS_ORDER[i];
    const qIn = state.queues[i].totalUnits();
    state.history.queueTotals[p].push(qIn);
  }
  state.history.shipped.push(state.metrics.shippedOnTime + state.metrics.shippedLate);
  state.history.late.push(state.metrics.shippedLate);
  state.history.exceptions.push(state.exceptions.totalUnits());

  // auto alerts for bottlenecks
  for (const p of PROCESS_ORDER) {
    const qi = state.queues[PROCESS_ORDER.indexOf(p)].totalUnits();
    if (qi > 220) addAlert(state, `${p}: queue high (${fmtInt(qi)})`);
  }

  // advance time
  state.tick += 1;
  render(state);

  if (state.tick >= state.shiftMinutes) {
    endShift(state);
  }
}

// --- Scoring ---
function computeEndBacklogDue(state) {
  const endTick = state.shiftMinutes;
  let due = 0;
  for (const q of state.queues) due += q.dueUnitsAtOrBefore(endTick);
  due += state.exceptions.dueUnitsAtOrBefore(endTick);
  return due;
}

function computeScore(state) {
  const demand = Math.max(1, state.metrics.demandUnits);
  const onTime = state.metrics.shippedOnTime;
  const shippedLate = state.metrics.shippedLate;
  const backlogDue = computeEndBacklogDue(state);

  const onTimeRate = onTime / demand;
  const lateRate = (shippedLate + backlogDue) / demand;

  const service = clamp(100 * onTimeRate - 70 * lateRate, 0, 100);

  const baseBudget = state.plannedHeadcount * state.shiftMinutes;
  const labor = state.metrics.laborMinutes;
  const ot = state.metrics.otMinutes;
  const maint = state.metrics.maintMinutes;

  const totalCost = (labor - ot) * 1.0 + ot * 1.6 + maint * 1.4;
  const costOver = (totalCost - baseBudget) / Math.max(1, baseBudget);
  const costScore = clamp(100 - costOver * 120, 0, 100);

  const errors = state.metrics.errors;
  const processed = Math.max(1, state.metrics.shippedOnTime + state.metrics.shippedLate + state.metrics.reworked);
  const errRate = errors / processed;
  const excWip = state.exceptions.totalUnits();
  const quality = clamp(100 - errRate * 420 - (excWip / demand) * 40, 0, 100);

  const incidents = state.safety.incidents;
  const safety = clamp(100 - incidents * 35 - state.fatigue * 55 - state.complianceRisk * 45, 0, 100);

  const people = clamp(100 - Math.abs(state.morale - 70) * 1.2 - state.fatigue * 20, 0, 100);

  let total =
    service * 0.35 +
    costScore * 0.25 +
    quality * 0.15 +
    safety * 0.15 +
    people * 0.10;

  // hard guardrails / penalties
  if (incidents >= 2) total -= 25;
  if (state.metrics.otMinutes > state.scenario.otCapMinutes) total -= 18;
  if (state.complianceRisk > 0.85) total -= 15;

  total = clamp(total, 0, 100);

  const rank =
    total >= 90 ? "S" :
    total >= 80 ? "A" :
    total >= 70 ? "B" :
    total >= 60 ? "C" :
    total >= 50 ? "D" :
    "FAIL";

  return { total, rank, service, cost: costScore, quality, safety, people, backlogDue };
}

// --- Explain (end recap text) ---
function explainShift(state, score) {
  const lines = [];
  const demand = state.metrics.demandUnits;
  const shipped = state.metrics.shippedOnTime + state.metrics.shippedLate;
  const backlogDue = score.backlogDue;
  const topBottleneck = (() => {
    let best = { p: "—", avg: -1 };
    for (const p of PROCESS_ORDER) {
      const arr = state.history.queueTotals[p];
      const avg = arr.reduce((s, x) => s + x, 0) / Math.max(1, arr.length);
      if (avg > best.avg) best = { p, avg };
    }
    return best;
  })();

  lines.push(`Shift summary (seed ${state.seed}):`);
  lines.push(`- Demand: ${fmtInt(demand)} units`);
  lines.push(`- Shipped: ${fmtInt(shipped)} units (${fmtInt(state.metrics.shippedOnTime)} on-time, ${fmtInt(state.metrics.shippedLate)} late)`);
  lines.push(`- End backlog due: ${fmtInt(backlogDue)} units`);
  lines.push(`- Safety incidents: ${fmtInt(state.safety.incidents)} (fatigue ${fmtPct(state.fatigue)})`);
  lines.push(`- Errors generated: ${fmtInt(state.metrics.errors)} (reworked ${fmtInt(state.metrics.reworked)})`);
  lines.push("");
  lines.push(`Most persistent bottleneck: ${topBottleneck.p} (avg input queue ${fmtInt(topBottleneck.avg)})`);

  const tradeoffs = [];
  if (state.metrics.otMinutes > 0) tradeoffs.push(`Used OT (${fmtInt(state.metrics.otMinutes)} minutes) to protect throughput at higher cost + compliance risk.`);
  if (state.breakPlan.delay > 0) tradeoffs.push(`Delayed breaks by ${state.breakPlan.delay}m; fatigue rose and increased incident/compliance pressure.`);
  if (state.priorityMode === "Efficiency") tradeoffs.push(`Ran Efficiency priority; throughput improved but urgent buckets risked lateness.`);
  if (state.safety.standDownTicks > 0) tradeoffs.push(`Issued safety stand-down; reduced risk but sacrificed short-term throughput.`);
  if (state.maintenance.escalated) tradeoffs.push(`Escalated maintenance; reduced failures but increased indirect cost.`);

  if (tradeoffs.length) {
    lines.push("");
    lines.push("Tradeoffs you accepted:");
    for (const t of tradeoffs.slice(0, 5)) lines.push(`- ${t}`);
  }

  // pull 6 most recent actions/events
  const highlights = state.log.slice(0, 10).reverse();
  if (highlights.length) {
    lines.push("");
    lines.push("Timeline highlights:");
    for (const h of highlights.slice(-8)) lines.push(`- ${h}`);
  }

  return lines.join("\n");
}

// --- End shift ---
function endShift(state) {
  if (state.status === "ended") return;
  state.status = "ended";
  stopLoop();

  const score = computeScore(state);
  render(state);
  showOverlay(state, score);
}

// --- UI building ---
function buildUI() {
  $("#kpiFacility").textContent = FACILITY_NAME;

  // scenario select
  const sel = $("#scenarioSelect");
  sel.innerHTML = "";
  for (let i = 0; i < SCENARIOS.length; i++) {
    const sc = SCENARIOS[i];
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = `${sc.name}`;
    sel.appendChild(opt);
  }

  // process cards
  const cards = $("#processCards");
  cards.innerHTML = "";
  for (const p of PROCESS_ORDER) {
    const el = document.createElement("div");
    el.className = "card";
    el.id = `card-${p}`;
    el.innerHTML = `
      <div class="cardHeader">
        <span class="name">${p}</span>
        <div class="smallBtns">
          <button class="tiny" data-action="toggleLine" data-proc="${p}" title="Open/close extra line">${p === "Ship" ? "Lane+" : "Line+"}</button>
          <span class="badge" id="badge-${p}">—</span>
        </div>
      </div>
      <div class="row"><span>Input queue</span><b id="wip-${p}">—</b></div>
      <div class="row"><span>Good out (last min)</span><b id="rate-${p}">—</b></div>
      <div class="row"><span>Staffing</span><b id="staff-${p}">—</b></div>
      <div class="row"><span>Errors (last min)</span><b id="err-${p}">—</b></div>
      <div class="bar"><div class="barFill" id="bar-${p}"></div></div>
    `;
    cards.appendChild(el);
  }

  // flow map
  const map = $("#flowMap");
  map.innerHTML = "";
  for (let i = 0; i < PROCESS_ORDER.length; i++) {
    const p = PROCESS_ORDER[i];
    const node = document.createElement("div");
    node.className = "flowNode";
    node.innerHTML = `
      <div class="title">${p}</div>
      <div class="q">Q: <span id="mapQ-${p}">—</span></div>
      <div class="q">Mode: <span id="mapMode-${p}">—</span></div>
      <div class="miniBar"><div id="mapBar-${p}"></div></div>
      ${i < PROCESS_ORDER.length - 1 ? `<div class="arrow">➜</div>` : ""}
    `;
    map.appendChild(node);
  }

  // labor rows
  const rows = $("#laborRows");
  rows.innerHTML = "";
  const allRoles = [...PROCESS_ORDER, "SWAT"];
  for (const role of allRoles) {
    const row = document.createElement("div");
    row.className = "row";
    row.style.alignItems = "center";
    row.innerHTML = `
      <span>${role}</span>
      <span style="display:flex; gap:6px; align-items:center;">
        <button class="tiny" data-action="dec" data-role="${role}">−</button>
        <b id="asgn-${role}" style="min-width:44px; text-align:right;">—</b>
        <button class="tiny" data-action="inc" data-role="${role}">+</button>
      </span>
    `;
    rows.appendChild(row);
  }

  // buttons
  $("#btnStart").addEventListener("click", () => start());
  $("#btnPause").addEventListener("click", () => togglePause());
  $("#btnRestart").addEventListener("click", () => restart());
  $("#btnNewSeed").addEventListener("click", () => reseed());

  $("#btnCloseOverlay").addEventListener("click", () => hideOverlay());
  $("#btnOverlayRestart").addEventListener("click", () => restart());
  $("#scenarioSelect").addEventListener("change", () => {
    if (state && (state.status === "running" || state.status === "paused")) return;
    // rebuild preview state only
    reseed(true);
  });

  document.addEventListener("click", (ev) => {
    const t = ev.target.closest("[data-action]");
    if (!t) return;
    const action = t.dataset.action;

    if (!state) return;

    if (action === "inc" || action === "dec") {
      const role = t.dataset.role;
      const delta = action === "inc" ? 1 : -1;
      adjustAssignment(role, delta);
      return;
    }
    if (action === "speed") {
      const sp = Number(t.dataset.speed);
      setSpeed(sp);
      return;
    }
    if (action === "priority") {
      togglePriority();
      return;
    }
    if (action === "toggleLine") {
      const p = t.dataset.proc;
      toggleLine(p);
      return;
    }
    if (action === "ot") {
      const d = Number(t.dataset.delta) || 10;
      callOT(d);
      return;
    }
    if (action === "vto") {
      const d = Number(t.dataset.delta) || 10;
      callVTO(d);
      return;
    }
    if (action === "delaybreak") {
      delayBreak();
      return;
    }
    if (action === "maintenance") {
      toggleMaintenance();
      return;
    }
    if (action === "standdown") {
      safetyStandDown();
      return;
    }
  });
}

// --- Actions ---
function adjustAssignment(role, delta) {
  if (state.status !== "running" && state.status !== "paused") return;

  if (delta > 0) {
    // add 1 from pool
    const moved = moveFromProcTo(state, "POOL", role === "SWAT" ? "SWAT" : role, 1);
    if (moved) {
      logEvent(state, `ACTION: move +${moved} to ${role} (arrives in 2m)`);
    }
  } else {
    // remove 1 to pool
    const from = role === "SWAT" ? "SWAT" : role;
    const moved = moveFromProcTo(state, from, "POOL", 1);
    if (moved) logEvent(state, `ACTION: move -${moved} from ${role} (pool in 2m)`);
  }
  render(state);
}

function togglePriority() {
  if (state.status !== "running" && state.status !== "paused") return;
  state.priorityMode = state.priorityMode === "SLA" ? "Efficiency" : "SLA";
  logEvent(state, `ACTION: priority = ${state.priorityMode}`);
  render(state);
}

function setSpeed(sp) {
  if (!state) return;
  state.speed = clamp(sp, 1, 4);
  if (state.status === "running") {
    stopLoop();
    startLoop();
  }
  render(state);
}

function toggleLine(proc) {
  if (state.status !== "running" && state.status !== "paused") return;
  if (!PROCESS_ORDER.includes(proc)) return;
  state.processes[proc].extraLine = !state.processes[proc].extraLine;
  logEvent(state, `ACTION: ${proc} extra line = ${state.processes[proc].extraLine ? "ON" : "OFF"}`);
  render(state);
}

function callOT(n) {
  if (state.status !== "running" && state.status !== "paused") return;
  // OT arrives after 3 minutes
  scheduleMove(state, "OT_CALL", "POOL", n, 3);
  addAlert(state, `Called OT: +${n} arriving in 3m`);
  logEvent(state, `ACTION: call OT +${n} (ETA 3m)`);
  state.complianceRisk = clamp(state.complianceRisk + 0.03, 0, 1);
  render(state);
}

function callVTO(n) {
  if (state.status !== "running" && state.status !== "paused") return;

  let left = n;
  const takePool = Math.min(left, state.pool);
  state.pool -= takePool;
  left -= takePool;

  // pull from largest staffed areas if needed
  const byHave = PROCESS_ORDER.map((p) => ({ p, n: state.assignments[p] || 0 }))
    .sort((a, b) => b.n - a.n);

  for (const it of byHave) {
    if (left <= 0) break;
    const take = Math.min(it.n, left);
    state.assignments[it.p] -= take;
    left -= take;
  }

  const actual = n - left;
  if (actual > 0) {
    addAlert(state, `VTO approved: -${actual} HC`);
    logEvent(state, `ACTION: VTO -${actual}`);
    // morale bumps slightly only if not in red
    const sla = computeSlaRisk(state);
    state.morale = clamp(state.morale + (sla.label === "GREEN" ? 2 : -1), 30, 95);
  }
  render(state);
}

function delayBreak() {
  if (state.status !== "running" && state.status !== "paused") return;
  if (state.breakPlan.usedDelay) {
    addAlert(state, "Break delay already used");
    return;
  }
  state.breakPlan.delay += 5;
  state.breakPlan.usedDelay = true;
  state.complianceRisk = clamp(state.complianceRisk + 0.08, 0, 1);
  logEvent(state, "ACTION: delayed break +5m (one-time)");
  addAlert(state, "Break delayed by 5m");
  render(state);
}

function toggleMaintenance() {
  if (state.status !== "running" && state.status !== "paused") return;
  state.maintenance.escalated = !state.maintenance.escalated;
  logEvent(state, `ACTION: maintenance escalation = ${state.maintenance.escalated ? "ON" : "OFF"}`);
  addAlert(state, `Maintenance escalation ${state.maintenance.escalated ? "ON" : "OFF"}`);
  // apply a labor tax immediately (they are busy)
  if (state.maintenance.escalated) {
    // pull tax from pool first; otherwise from largest process
    let tax = state.maintenance.laborTax;
    const takePool = Math.min(tax, state.pool);
    state.pool -= takePool;
    tax -= takePool;
    if (tax > 0) {
      const byHave = PROCESS_ORDER.map((p) => ({ p, n: state.assignments[p] || 0 })).sort((a, b) => b.n - a.n);
      for (const it of byHave) {
        if (tax <= 0) break;
        const take = Math.min(it.n, tax);
        state.assignments[it.p] -= take;
        tax -= take;
      }
    }
  } else {
    // release tax back to pool gradually (simulate they come back)
    scheduleMove(state, "MAINT", "POOL", state.maintenance.laborTax, 2);
  }
  render(state);
}

function safetyStandDown() {
  if (state.status !== "running" && state.status !== "paused") return;
  state.safety.standDownTicks = Math.max(state.safety.standDownTicks, 5);
  state.morale = clamp(state.morale + 2, 30, 95);
  logEvent(state, "ACTION: safety stand-down (5m)");
  addAlert(state, "Safety stand-down issued (5m)");
  render(state);
}

// --- Loop control ---
function startLoop() {
  const msPerTick = Math.round(1000 / state.speed);
  interval = setInterval(() => step(state), msPerTick);
}
function stopLoop() {
  if (interval) clearInterval(interval);
  interval = null;
}

function start() {
  const idx = Number($("#scenarioSelect").value || "0");
  const sc = SCENARIOS[idx] || SCENARIOS[0];
  const seed = (state?.seed ?? Date.now()) >>> 0;
  state = freshState(sc, seed);
  state.status = "running";

  $("#btnStart").disabled = true;
  $("#btnPause").disabled = false;
  $("#btnRestart").disabled = false;

  logEvent(state, `START: ${sc.name}`);
  render(state);
  stopLoop();
  startLoop();
}

function togglePause() {
  if (!state) return;
  if (state.status === "running") {
    state.status = "paused";
    stopLoop();
    $("#btnPause").textContent = "Resume";
    logEvent(state, "PAUSE");
  } else if (state.status === "paused") {
    state.status = "running";
    $("#btnPause").textContent = "Pause";
    logEvent(state, "RESUME");
    stopLoop();
    startLoop();
  }
  render(state);
}

function restart() {
  hideOverlay();
  stopLoop();
  $("#btnPause").textContent = "Pause";
  $("#btnStart").disabled = false;
  $("#btnPause").disabled = true;
  $("#btnRestart").disabled = true;

  reseed(true);
}

function reseed(keepScenarioOnly = false) {
  const idx = Number($("#scenarioSelect").value || "0");
  const sc = SCENARIOS[idx] || SCENARIOS[0];
  const seed = (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0;

  state = freshState(sc, seed);
  if (!keepScenarioOnly) {
    // keep UI in reset
    state.status = "stopped";
  }
  render(state);
}

// --- Render ---
function render(state) {
  if (!state) return;

  const sc = state.scenario;
  $("#badgeMode").textContent = `Priority: ${state.priorityMode}`;
  $("#priorityLabel").textContent = state.priorityMode;

  const time = `${pad2(state.tick)}/${pad2(state.shiftMinutes)}m`;
  $("#kpiTime").textContent = `${time} ${state.status === "paused" ? "(paused)" : ""}`;

  $("#kpiDemand").textContent = `${fmtInt(state.metrics.demandForecast)} / ${fmtInt(state.metrics.demandActual)}`;
  $("#kpiHC").textContent = `${fmtInt(state.plannedHeadcount)} / ${fmtInt(totalHeadcountActive(state))} / ${fmtInt(state.pool)}`;

  const blIn = backlogInbound(state);
  const blOut = backlogOutbound(state);
  const exc = state.exceptions.totalUnits();
  $("#kpiBacklog").textContent = `${fmtInt(blIn)} / ${fmtInt(blOut)} / ${fmtInt(exc)}`;

  const sla = computeSlaRisk(state);
  $("#kpiSla").textContent = sla.label;
  $("#kpiSla").className = `value ${sla.cls ? "" : ""}`;

  const otUsed = state.metrics.otMinutes;
  $("#kpiOT").textContent = `${fmtInt(otUsed)} / ${fmtInt(sc.otCapMinutes)}`;

  // control snapshot
  const brStart = state.breakPlan.baseStart + state.breakPlan.delay;
  $("#ctlBreak").textContent = `Start ${brStart}m, dur ${state.breakPlan.duration}m${state.breakPlan.delay ? " (delayed)" : ""}`;
  $("#ctlMaint").textContent = state.maintenance.escalated ? "ON (lower fails, higher cost)" : "OFF";
  $("#ctlStanddown").textContent = `${fmtInt(state.safety.standDownTicks)}m`;
  $("#ctlCompliance").textContent = `${fmtPct(state.complianceRisk)}`;

  // roster
  $("#poolCount").textContent = fmtInt(state.pool);
  $("#transitCount").textContent = fmtInt(transitCount(state));
  $("#morale").textContent = `${fmtInt(state.morale)}/100`;
  $("#fatigue").textContent = fmtPct(state.fatigue);

  // assignments
  for (const p of PROCESS_ORDER) {
    $(`#asgn-${p}`).textContent = fmtInt(state.assignments[p] || 0);
  }
  $("#asgn-SWAT").textContent = fmtInt(state.swat);

  // process cards + map
  const mods = computeModifiers(state);
  for (let i = 0; i < PROCESS_ORDER.length; i++) {
    const p = PROCESS_ORDER[i];
    const proc = state.processes[p];
    const qIn = state.queues[i].totalUnits();

    const badge = $(`#badge-${p}`);
    const isDown = proc.downTicks > 0 || mods.downByProc[p];
    const label = isDown ? "DOWN" : (qIn > 200 ? "HOT" : "OK");
    const cls = isDown ? "bad" : (qIn > 200 ? "warn" : "good");
    badge.textContent = label;
    badge.className = `badge ${cls}`;

    $(`#wip-${p}`).textContent = fmtInt(qIn);
    $(`#rate-${p}`).textContent = fmtInt(proc.lastThroughput);
    $(`#staff-${p}`).textContent = fmtInt(state.assignments[p] || 0) + (proc.extraLine ? " (x-line)" : "");
    $(`#err-${p}`).textContent = fmtInt(proc.lastErrors);

    const pct = clamp(qIn / 320, 0, 1);
    $(`#bar-${p}`).style.width = `${Math.round(pct * 100)}%`;

    $(`#mapQ-${p}`).textContent = fmtInt(qIn);
    $(`#mapMode-${p}`).textContent = isDown ? "DOWN" : (state.priorityMode === "SLA" ? "SLA" : "FIFO");
    $(`#mapBar-${p}`).style.width = `${Math.round(pct * 100)}%`;
  }

  // exceptions panel
  const excHigh = state.exceptions.highDwellUnits(state.tick, 10);
  $("#excWip").textContent = fmtInt(exc);
  $("#excDwell").textContent = fmtInt(excHigh);
  $("#excSwat").textContent = fmtInt(state.swat);

  $("#excBar").style.width = `${Math.round(clamp(exc / 240, 0, 1) * 100)}%`;

  const excBadge = $("#badgeExceptions");
  excBadge.textContent = exc > 160 ? "HOT" : "OK";
  excBadge.className = `badge ${exc > 160 ? "warn" : "good"}`;

  // alerts
  $("#alertsBox").textContent = state.alerts.length ? state.alerts.join("\n") : "(none)";

  // timeline: active + warned upcoming
  renderTimeline(state);

  // log
  $("#logBox").textContent = state.log.length ? state.log.join("\n") : "(empty)";

  // badges
  $("#badgeAlerts").textContent = `${fmtInt(state.alerts.length)} items`;
  $("#badgeLog").textContent = `${fmtInt(state.log.length)} entries`;

  const inBreak = isBreakActive(state);
  const rosterBadge = $("#badgeRoster");
  rosterBadge.textContent = inBreak ? "BREAK ACTIVE" : "LIVE";
  rosterBadge.className = `badge ${inBreak ? "warn" : "good"}`;

  const assignBadge = $("#badgeAssign");
  const poolOk = state.pool >= 0;
  assignBadge.textContent = `Pool ${fmtInt(state.pool)} / Transit ${fmtInt(transitCount(state))}`;
  assignBadge.className = `badge ${poolOk ? "good" : "bad"}`;

  const tlBadge = $("#badgeTimeline");
  tlBadge.textContent = `${fmtInt(state.activeEvents.length)} active`;
  tlBadge.className = `badge ${state.activeEvents.length ? "warn" : "good"}`;

  // SLA badge styling
  const slaEl = $("#kpiSla");
  slaEl.style.color = sla.cls === "good" ? "var(--good)" : (sla.cls === "warn" ? "var(--warn)" : "var(--bad)");

  // mode badge
  $("#badgeMode").className = `badge ${state.priorityMode === "SLA" ? "good" : "warn"}`;

  // controls badge
  const ctlBadge = $("#badgeControls");
  ctlBadge.textContent = state.maintenance.escalated ? "MAINT ON" : "MAINT OFF";
  ctlBadge.className = `badge ${state.maintenance.escalated ? "warn" : "good"}`;

  // topbar controls enabling
  const runningOrPaused = state.status === "running" || state.status === "paused";
  $("#btnStart").disabled = runningOrPaused;
  $("#btnPause").disabled = !runningOrPaused;
  $("#btnRestart").disabled = !runningOrPaused;
}

function renderTimeline(state) {
  const box = $("#timelineBox");
  const pills = [];

  // active events
  for (const e of state.activeEvents) {
    const d = document.createElement("div");
    d.className = "pill";
    d.innerHTML = `<span class="dot"></span><span>${prettyEvent(e)}</span><span>(${fmtInt(e.remaining)}m)</span>`;
    pills.push(d);
  }

  // warned upcoming events
  const upcoming = state.futureEvents
    .filter((e) => e.warned && e.warnAt <= state.tick && e.start > state.tick)
    .sort((a, b) => a.start - b.start)
    .slice(0, 8);

  for (const e of upcoming) {
    const d = document.createElement("div");
    d.className = "pill";
    d.innerHTML = `<span class="dot"></span><span>Upcoming: ${prettyEvent(e)}</span><span>(t+${pad2(e.start)})</span>`;
    pills.push(d);
  }

  box.innerHTML = "";
  if (pills.length === 0) {
    box.textContent = "(no events)";
    return;
  }
  for (const p of pills) box.appendChild(p);
}

// --- Overlay ---
function showOverlay(state, score) {
  $("#overlay").classList.remove("hidden");

  $("#finalScore").textContent = `${Math.round(score.total)}/100`;
  $("#finalRank").textContent = score.rank;

  $("#scoreService").textContent = `${Math.round(score.service)}`;
  $("#scoreCost").textContent = `${Math.round(score.cost)}`;
  $("#scoreQuality").textContent = `${Math.round(score.quality)}`;
  $("#scoreSafety").textContent = `${Math.round(score.safety)}`;
  $("#scorePeople").textContent = `${Math.round(score.people)}`;

  const shipped = state.metrics.shippedOnTime + state.metrics.shippedLate;
  $("#outDemand").textContent = fmtInt(state.metrics.demandUnits);
  $("#outOnTime").textContent = `${fmtInt(state.metrics.shippedOnTime)} (${fmtPct(state.metrics.shippedOnTime / Math.max(1, state.metrics.demandUnits))})`;
  $("#outLate").textContent = `${fmtInt(state.metrics.shippedLate)} + ${fmtInt(score.backlogDue)} backlog`;
  $("#outOT").textContent = fmtInt(state.metrics.otMinutes);
  $("#outErr").textContent = `${fmtInt(state.metrics.errors)} / ${fmtInt(state.metrics.reworked)} reworked`;
  $("#outInc").textContent = fmtInt(state.safety.incidents);

  $("#explainBox").textContent = explainShift(state, score);
}

function hideOverlay() {
  $("#overlay").classList.add("hidden");
}

// --- Boot ---
function boot() {
  buildUI();
  reseed(true);
  render(state);
}
boot();
