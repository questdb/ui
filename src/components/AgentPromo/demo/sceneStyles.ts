import { css } from "styled-components"

// The scene's own look, at its own scale. Its colours are custom properties
// from palette.ts, set from the console's theme. Keyframes carry an apd-
// prefix, since styled-components emits them globally.
export const sceneStyles = css`
  --mono: "JetBrains Mono", "SF Mono", Menlo, monospace;
  color: var(--primary);
  -webkit-font-smoothing: antialiased;
  user-select: none;

  &.instant,
  &.instant * {
    transition: none !important;
    animation: none !important;
  }
  /* ---- Right: the console ---- */
  & {
    background: var(--canvas);
    padding: 22px;
    display: flex;
    min-height: 0;
  }
  .console {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: 1fr 290px;
    grid-template-rows: minmax(0, 1fr);
    border: 1px solid var(--frame);
    border-radius: 8px;
    overflow: hidden;
    background: var(--base);
    box-shadow: var(--frame-shadow);
  }
  .nb {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
  }
  .tabs {
    height: 38px;
    display: flex;
    align-items: flex-end;
    gap: 2px;
    padding: 0 8px;
    background: var(--inset);
    border-bottom: 1px solid var(--border-subtle);
  }
  .tab {
    height: 30px;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 10px;
    font-size: 12px;
    color: var(--secondary);
    max-width: 140px;
    white-space: nowrap;
    overflow: hidden;
    flex-shrink: 1;
    min-width: 0;
    border-radius: 6px 6px 0 0;
    transition:
      background 0.25s,
      color 0.25s,
      opacity 0.3s,
      transform 0.3s;
  }
  .tab svg {
    color: var(--muted);
  }
  .tab.active {
    background: var(--base);
    color: var(--primary);
  }
  .tab.hidden {
    opacity: 0;
    transform: translateY(6px);
  }
  .nb-tool {
    height: 36px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 14px;
    font-size: 12px;
    color: var(--secondary);
    border-bottom: 1px solid var(--border-subtle);
  }
  .nb-tool b {
    color: var(--primary);
    font-weight: 600;
  }
  .pane {
    flex: 1;
    position: relative;
    min-height: 0;
    background: var(--canvas);
  }
  .grid {
    position: absolute;
    inset: 0;
    padding: 12px;
    display: grid;
    gap: 10px;
    grid-template-columns: repeat(6, 1fr);
    grid-template-rows: 108px 1.25fr 1fr;
    transition: opacity 0.25s;
  }
  .grid.off {
    opacity: 0;
    pointer-events: none;
  }
  .cell {
    background: var(--inset);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 8px 10px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-height: 0;
    position: relative;
    opacity: 0;
    transform: translateY(6px) scale(0.98);
    transition:
      opacity 0.25s ease,
      transform 0.25s ease,
      box-shadow 0.6s ease;
  }
  .cell.in {
    opacity: 1;
    transform: none;
    box-shadow: 0 0 0 1px var(--accent-ring);
  }
  .cell.in.settled {
    box-shadow: 0 0 0 1px transparent;
  }
  .cell .name {
    font-size: 11.5px;
    font-weight: 600;
    color: var(--primary);
    display: flex;
    justify-content: space-between;
    gap: 8px;
    white-space: nowrap;
  }
  .cell .name .sub {
    font-weight: 400;
    color: var(--muted);
  }
  /* Stat tiles (visuals/StatTiles): adjoining tiles, value, caption or change, sparkline along the bottom */
  .cell.stats {
    padding: 0;
    display: grid;
    overflow: hidden;
  }
  .tile {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 10px 11px;
    min-width: 0;
    overflow: hidden;
    box-shadow:
      inset -1px 0 var(--border-subtle),
      inset 0 -1px var(--border-subtle);
  }
  .tile > span {
    position: relative;
    z-index: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .tl {
    font-size: 11px;
    color: var(--secondary);
  }
  .tv {
    font-size: 18px;
    font-weight: 600;
    line-height: 1.15;
    font-variant-numeric: tabular-nums;
  }
  .tc {
    font-size: 10.5px;
    color: var(--secondary);
  }
  .tch {
    font-size: 10.5px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .spark {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    width: 100%;
    height: 34%;
    opacity: 0.75;
  }
  /* ECharts draws series in from the left; marks and thresholds come in after */
  .sweep {
    transform-box: fill-box;
    transform-origin: left center;
    transform: scaleX(0);
    transition: transform 0.9s cubic-bezier(0.33, 0, 0.2, 1);
  }
  .in .sweep {
    transform: scaleX(1);
  }
  .mark {
    opacity: 0;
    transition: opacity 0.35s ease 0.8s;
  }
  .in .mark {
    opacity: 1;
  }
  .flash-up {
    animation: apd-flashUp 0.9s ease-out;
  }
  .flash-down {
    animation: apd-flashDown 0.9s ease-out;
  }
  @keyframes apd-flashUp {
    0%,
    25% {
      color: var(--up);
    }
  }
  @keyframes apd-flashDown {
    0%,
    25% {
      color: var(--down);
    }
  }
  /* Legends sit under the chart, as ECharts draws them */
  .lgd {
    display: flex;
    justify-content: center;
    gap: 10px;
    font-size: 9.5px;
    color: var(--secondary);
    white-space: nowrap;
  }
  .lgd i {
    display: inline-block;
    width: 10px;
    height: 6px;
    border-radius: 2px;
    margin-right: 4px;
    vertical-align: 0;
  }
  /* Uptime (visuals/UptimeBars) */
  .up-sum {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 10px;
    color: var(--muted);
    padding: 2px 0 4px;
  }
  .up-all {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 11.5px;
    font-weight: 600;
    color: var(--positive);
  }
  .up-all::before {
    content: "";
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--success);
    box-shadow: 0 0 0 3px var(--success-ring);
  }
  .up-lane {
    padding: 6px 0 3px;
  }
  .up-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 6px;
    font-size: 11.5px;
    font-weight: 600;
  }
  .up-head span:last-child {
    font-size: 10.5px;
    font-weight: 400;
    color: var(--positive);
  }
  .up-bars {
    display: grid;
    grid-template-columns: repeat(30, 1fr);
    column-gap: 2px;
    height: 16px;
  }
  .up-bars i {
    display: block;
    border-radius: 1px;
    background: var(--success);
  }
  .up-bars i.bad {
    background: var(--danger);
  }
  .up-head .pct {
    color: var(--muted) !important;
    margin-left: auto;
    margin-right: 8px;
  }
  /* Result grid (components/ResultGrid): name and type in the header, monospace cells, highlight rules */
  .rg {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    border: 1px solid var(--border-subtle);
    border-radius: 3px;
    font-family: var(--mono);
  }
  .rg table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }
  .rg th {
    background: var(--grid-header);
    text-align: left;
    padding: 3px 5px;
    font-weight: 600;
    font-size: 9px;
    overflow: hidden;
    color: var(--primary);
    border-right: 1px solid var(--border-subtle);
    white-space: nowrap;
  }
  .rg th small {
    display: block;
    font-weight: 400;
    font-size: 8px;
    color: var(--muted);
    margin-top: 1px;
  }
  .rg td {
    height: 15px;
    padding: 0 5px;
    font-size: 9px;
    overflow: hidden;
    background: var(--grid-row);
    border-right: 1px solid var(--border-subtle);
    border-bottom: 1px solid var(--border-subtle);
    white-space: nowrap;
    position: relative;
    font-variant-numeric: tabular-nums;
  }
  .rg td.ts {
    color: var(--success);
  }
  .rg td.num {
    text-align: right;
  }
  .rg tr {
    opacity: 0;
    transition: opacity 0.2s ease;
  }
  .rg td.txt {
    color: var(--primary);
  }
  .rg td .g {
    display: inline-block;
    width: 9px;
    margin-left: 3px;
    font-size: 7px;
    vertical-align: 1px;
  }
  .rg td .g.up {
    color: var(--positive);
  }
  .rg td .g.down {
    color: var(--negative);
  }
  .rg td.fl-up {
    animation: apd-cellUp 1s ease-out;
  }
  .rg td.fl-down {
    animation: apd-cellDown 1s ease-out;
  }
  .rg td.fl-up2 {
    animation: apd-cellUp2 1s ease-out;
  }
  .rg td.fl-down2 {
    animation: apd-cellDown2 1s ease-out;
  }
  @keyframes apd-cellUp {
    from {
      background-color: var(--positive-flash);
    }
    to {
      background-color: var(--grid-row);
    }
  }
  @keyframes apd-cellUp2 {
    from {
      background-color: var(--positive-flash);
    }
    99% {
      background-color: var(--grid-row);
    }
  }
  @keyframes apd-cellDown {
    from {
      background-color: var(--negative-flash);
    }
    to {
      background-color: var(--grid-row);
    }
  }
  @keyframes apd-cellDown2 {
    from {
      background-color: var(--negative-flash);
    }
    99% {
      background-color: var(--grid-row);
    }
  }
  .rg td .db.n {
    background: var(--bar-soft);
    transition:
      transform 0.5s ease 0.4s,
      width 0.4s ease;
  }
  /* A pointer exploring the event study: shared crosshair and ECharts tooltip */
  .cursor {
    position: absolute;
    width: 14px;
    height: 18px;
    pointer-events: none;
    z-index: 5;
    display: none;
    transform: translate(-2px, -2px);
  }
  .cursor svg {
    width: 100%;
    height: 100%;
    filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.6));
  }
  .tip {
    position: absolute;
    z-index: 4;
    display: none;
    padding: 5px 8px;
    background: var(--raised);
    border: 1px solid var(--border);
    border-radius: 5px;
    font-size: 9.5px;
    line-height: 1.5;
    color: var(--secondary);
    white-space: nowrap;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  }
  .tip b {
    color: var(--primary);
    font-weight: 600;
  }
  .tip i {
    display: inline-block;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    margin-right: 5px;
  }
  .badge {
    font-size: 9.5px;
    font-weight: 400;
    color: var(--secondary);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 0 5px;
    line-height: 15px;
  }
  .in .rg tr {
    opacity: 1;
  }
  .rg td .hl {
    position: absolute;
    inset: 0;
    opacity: 0;
    transition: opacity 0.3s ease 0.9s;
  }
  .in .rg td .hl {
    opacity: 1;
  }
  .rg td span {
    position: relative;
  }
  .rg td .db {
    position: absolute;
    left: 0;
    top: 3px;
    bottom: 3px;
    background: var(--up-soft);
    border-radius: 0 2px 2px 0;
    transform-origin: left;
    transform: scaleX(0);
    transition: transform 0.5s ease 0.4s;
  }
  .rg td .db.ask {
    background: var(--down-soft);
  }
  .in .rg td .db {
    transform: scaleX(1);
  }
  .up-foot {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 5px;
    font-size: 9.5px;
    color: var(--muted);
  }
  .up-foot hr {
    flex: 1;
    height: 0;
    margin: 0;
    border: 0;
    border-top: 1px solid var(--border);
  }
  .refresh {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 5px;
    height: 22px;
    padding: 0 8px;
    border: 1px solid var(--border);
    border-radius: 5px;
    font-size: 11px;
    color: var(--primary);
  }
  .refresh svg {
    width: 11px;
    height: 11px;
    color: var(--secondary);
  }
  .up {
    color: var(--success);
  }
  .down {
    color: var(--danger);
  }
  .chart {
    flex: 1;
    min-height: 0;
    position: relative;
  }
  .chart svg {
    width: 100%;
    height: 100%;
    display: block;
    overflow: visible;
  }
  .fade {
    opacity: 0;
    transition: opacity 0.5s ease 0.2s;
  }
  .in .fade {
    opacity: 1;
  }
  .ax {
    font-size: 9px;
    fill: var(--axis);
    font-variant-numeric: tabular-nums;
  }
  .md {
    background: transparent;
    border-color: transparent;
    padding: 2px 4px;
    gap: 5px;
  }
  .md h4 {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
  }
  .md p {
    margin: 0;
    font-size: 11.5px;
    line-height: 1.5;
    color: var(--secondary);
  }
  .md p b {
    color: var(--primary);
    font-weight: 600;
  }
  .bar {
    transform-box: fill-box;
    transform-origin: bottom;
    transform: scaleY(0);
    transition: transform 0.35s ease;
  }
  .in .bar {
    transform: scaleY(1);
  }
  .ai {
    border-left: 1px solid var(--border-subtle);
    display: flex;
    flex-direction: column;
    background: var(--raised);
    min-height: 0;
    overflow: hidden;
  }
  .ai-head {
    height: 40px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 6px 0 12px;
    border-bottom: 1px solid var(--neutral);
  }
  .ai-title {
    flex: 1;
    min-width: 0;
    font-size: 13px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .hbtn {
    width: 26px;
    height: 26px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--secondary);
    border-radius: 5px;
    flex-shrink: 0;
  }
  .hbtn svg {
    width: 14px;
    height: 14px;
  }
  .ai-body {
    flex: 1;
    padding: 12px;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    gap: 10px;
    overflow: hidden;
    min-height: 0;
  }
  .user {
    align-self: stretch;
    background: var(--user);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 8px 9px;
    font-size: 12px;
    line-height: 1.45;
    flex-shrink: 0;
  }
  .work {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex-shrink: 0;
  }
  .work-head {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 3px;
    font-size: 12px;
    font-weight: 500;
    color: var(--secondary);
  }
  .work-steps {
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding-left: 22px;
  }
  .step {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 2px 0;
    font-size: 11.5px;
    color: var(--secondary);
  }
  .ico {
    width: 12px;
    height: 12px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .spin {
    width: 11px;
    height: 11px;
    border-radius: 50%;
    border: 1.5px solid var(--spin-track);
    border-top-color: var(--primary);
    animation: apd-spin 0.7s linear infinite;
  }
  .tick {
    display: none;
    color: var(--tick);
  }
  .tick svg {
    width: 12px;
    height: 12px;
  }
  .step.done .spin {
    display: none;
  }
  .step.done .tick {
    display: flex;
  }
  .work-head .caret-r {
    color: var(--secondary);
    display: flex;
  }
  .work-head .caret-r svg {
    width: 11px;
    height: 11px;
  }
  /* slideAnimation: a light sweep across the running title */
  .shimmer {
    background: linear-gradient(
      90deg,
      var(--secondary) 0%,
      var(--secondary) 40%,
      var(--primary) 50%,
      var(--secondary) 60%,
      var(--secondary) 100%
    );
    background-size: 250% 100%;
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    animation: apd-shimmer 1.4s linear infinite;
  }
  @keyframes apd-shimmer {
    from {
      background-position: 100% 0;
    }
    to {
      background-position: -150% 0;
    }
  }
  @keyframes apd-spin {
    to {
      transform: rotate(360deg);
    }
  }
  .reply {
    font-size: 12px;
    line-height: 1.55;
    flex-shrink: 0;
  }
  .reply b {
    font-weight: 600;
  }
  .pop {
    animation: apd-pop 0.2s ease both;
  }
  @keyframes apd-pop {
    from {
      opacity: 0;
      transform: translateY(5px);
    }
  }
  .composer {
    flex-shrink: 0;
    padding: 10px 12px 10px;
    border-top: 1px solid var(--neutral);
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .box-wrap {
    position: relative;
  }
  .box {
    background: var(--input);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 9px 40px 9px 10px;
    font-size: 12px;
    min-height: 66px;
    line-height: 1.4;
    transition: border-color 0.15s;
  }
  .box.focus {
    border-color: var(--accent);
  }
  .box .ph {
    color: var(--secondary);
  }
  .send,
  .stop {
    position: absolute;
    right: 7px;
    bottom: 7px;
    width: 26px;
    height: 26px;
    border-radius: 5px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .send {
    background: var(--action);
    color: #fff;
    border: 1px solid var(--action);
  }
  .send.off {
    background: var(--control);
    border-color: var(--border);
    color: var(--disabled);
  }
  .send svg {
    width: 14px;
    height: 14px;
  }
  .stop {
    right: 38px;
    background: var(--control);
    border: 1px solid var(--border);
    color: var(--primary);
    display: none;
  }
  .stop svg {
    width: 11px;
    height: 11px;
  }
  .ai.busy .stop {
    display: flex;
  }
  .caret {
    display: inline-block;
    width: 1px;
    height: 13px;
    background: var(--primary);
    vertical-align: -2px;
    animation: apd-blink 1s step-end infinite;
  }
  @keyframes apd-blink {
    50% {
      opacity: 0;
    }
  }
  .ai-foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .model {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 11px;
    color: var(--secondary);
    padding: 3px 4px;
  }
  .model svg {
    width: 12px;
    height: 12px;
  }
  .model .cd svg {
    width: 9px;
    height: 9px;
  }
  .fbtn {
    width: 26px;
    height: 26px;
    border: 1px solid var(--border);
    border-radius: 5px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--secondary);
  }
  .fbtn svg {
    width: 13px;
    height: 13px;
  }
`
