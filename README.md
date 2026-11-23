# Aurora EV Plant — Digital Twin

An interactive 3D digital twin of an electric-vehicle factory, covering the whole
chain from raw-material procurement to customer delivery. It runs entirely in the
browser, with no build step.

## Run it

```
node server.js
```

Then open http://localhost:5173. Any static file server works; Three.js is vendored
in `vendor/`, so no internet connection is needed.

## What is modelled

| Stage | Detail |
|---|---|
| Procurement & inbound | 11 materials, suppliers with lead times and reliability, MRP re-order points, purchase orders, trucks, 7 docks, warehouse stock |
| Intralogistics | 10 AGVs, kanban replenishment of line-side stock, routing along the aisle network |
| Press shop | Decoiling/blanking and a 4-press tandem line feeding a panel buffer |
| Body shop | 5 robotic weld cells plus laser metrology (in-line inspection) |
| Paint shop | E-coat dip, ovens, sealing, primer / base / clear booths, inspection; colour-change purges |
| Battery & drive unit | Cell stacking → laser weld → pack assembly → HV test; stator winding → assembly → test |
| General assembly | Cockpit, glazing, battery/drive marriage, wheels, seats, fluid fill & software flash |
| End of line | Alignment/ADAS, dyno, water test, final audit |
| Yard & delivery | 60-slot yard, order book with promise dates, 6 car carriers serving 5 regions |

Every one of the 36 stations has its own equipment model: wear, a hidden fault mode,
four sensor channels whose readings shift with that fault, breakdowns, minor stops
and quality drift.

## Assembly detail: the bill of process

`src/process.js` defines, for all 36 stations, the ordered operations of one cycle:
the components that go in (part number, quantity), how they are joined (spot-weld
schedule, rivets, laser braze, adhesive, bolt size and torque) and the equipment
that does it. `src/scene/products.js` models each component as its own geometry —
front and rear castings, floor pan, body sides, dash, roof bows, roof panel,
fenders, four doors, hood, liftgate, harness, cockpit, glazing, subframes, drive
units, battery pack, wheels, fascias, seats, lamps; for the pack: cell modules,
busbars, tray, BMS, lid, bolts; for the drive unit: stator, rotor, housing,
gearset, cover, inverter.

In the 3D view each station stages its parts beside the line, the robot named in
the process picks each part and carries it to the product (inverse kinematics),
and process robots step along the actual joint locations. Select a station to see
the step list with the current step highlighted, and press **Watch this process**
to slow down and move in close. Select a vehicle to see its as-built record.
Part numbers, torques and weld schedules are representative values, not taken
from a specific manufacturer.

## The three "self" capabilities

- **Self-perception** (`src/brain.js`, `perceive`) — matches sensor deviations against
  fault signatures to diagnose equipment, estimates health and remaining useful life,
  tracks station states to find bottlenecks, projects material coverage against
  inbound ETAs, and runs SPC on defects traced back to their source station.
- **Self-decision** (`decide`) — predictive and opportunistic maintenance, process
  recalibration, expediting and safety-stock changes, AGV dispatch policy, line-rate
  control, colour-batch sequencing, due-date-aware carrier dispatch. Each decision
  records what was perceived, why it was decided and what was executed.
- **Self-execution** (`act`) — in *Autonomous* mode decisions are carried out
  immediately; in *Advisory* mode they wait for approval; in *Manual* mode the
  controller only observes.

## Simulate and predict

`src/twin.js` forks the live plant state and runs it forward faster than real time,
several replications at once, with or without the controller inside the fork:

- a rolling **end-of-shift forecast** with a range band;
- a **what-if lab** that compares three futures for any disruption scenario
  (no disruption / disruption without AI / disruption with AI response);
- nine injectable **scenarios** (robot failure, accelerated wear, supplier delay,
  process drift, demand surge, AGV outage, energy price spike, carrier strike,
  booth contamination).

Forks do not get to read hidden equipment truth: they start from the health the
perception layer currently *believes*, with failure thresholds redrawn.

## Where the data comes from

Out of the box all "live" data is produced by the built-in plant simulation
(`src/sim.js`) — no real factory is connected. To drive the twin from real
equipment, push messages through `window.twin.ingest(...)` or open the page with
`?feed=ws://host:port` and send JSON frames:

```json
{ "type": "sensor", "station": "BIW-30", "values": [17.2, 2.9, 61.0, 119] }
{ "type": "inventory", "material": "cells", "sets": 180 }
{ "type": "breakdown", "station": "PNT-50" }
```

Sensor values are the station's four channels in the order shown in the inspector.
A real deployment would put an OPC UA / MQTT / MES bridge behind that socket and
replace the station list and layout in `src/config.js` with the real plant's.

## Controls

Drag to orbit, right-drag to pan, scroll to zoom. Click a station, vehicle or AGV to
inspect it; double-click to fly there. The top bar sets simulation speed, controller
authority, camera view and floor overlay (state, health, utilisation, defects, power).

## Layout of the code

```
src/config.js      plant layout, stations, equipment models, materials, product mix
src/sim.js         the plant simulation (single cloneable state object)
src/brain.js       autonomous controller: perceive → decide → execute
src/twin.js        forecasting / what-if engine (time-sliced forks)
src/scenarios.js   disruption scenarios
src/view.js        live 3D view (entity sync, picking, camera, overlays)
src/process.js     bill of process: operations, components, joining specs per station
src/scene/*        3D models: building, station equipment, robots, product components
src/ui.js          control-room HUD;  src/charts.js  canvas charts
```
