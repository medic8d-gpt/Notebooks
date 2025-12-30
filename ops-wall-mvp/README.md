# Ops Wall Manager Sim (MVP)

Run:
- `python3 -m http.server 8080`
- Open `http://127.0.0.1:8080/`

Controls:
- Start/Pause/Restart
- 1×/2×/4× speed
- Assignments: +/- per process (arrives after 2 minutes)
- Priority toggle: SLA-first vs Efficiency (FIFO)
- Call OT +10 (arrives after 3 minutes)
- VTO -10 (removes headcount immediately)
- Delay break +5m (one-time; increases compliance risk)
- Toggle maint (reduces failures; costs labor and money)
- Safety stand-down (reduces risk; slows throughput)

Model notes:
- 1 second real time = 1 minute sim at 1×.
- Pipeline: Receive -> Stow -> Pick -> Pack -> Sort -> Ship (sink)
- Errors generate exceptions; SWAT clears exceptions back into Sort input.
