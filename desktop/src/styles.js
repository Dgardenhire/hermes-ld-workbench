// The 0.2 frame: the event rail, the strip drawn to scale in time, the big clock with the time cards, the
// recorder, the waveform, the ballot sheet, headlines, rhetoric marks and the Ballots view.
//
// Colors come only from the app's theme (the kit's --hk-* tokens over --ui-* / --dt-*). Corners follow the
// host's radius. Nothing is below 12px. The user's accent is the judge's pen and the current segment; red is
// kept for the DRILL stamp, over-time and the numbers that need work, and always comes with a word, so a red
// or green accent never carries a meaning alone. Serif is for words spoken or read aloud (questions,
// speeches, the student's own lines); sans is the app and the judge.

export const FRAME_CSS = `
.ldw{--ldw-cond:"Avenir Next Condensed","DIN Condensed","Bahnschrift Condensed","Bahnschrift","Roboto Condensed","Arial Narrow",sans-serif;
  --ldw-serif:"Iowan Old Style","Charter","Georgia",serif;--ldw-r:var(--hk-radius);
  --ldw-paper:var(--ui-bg-elevated,var(--hk-surface));--ldw-paper-ink:var(--hk-ink);--ldw-paper-rule:color-mix(in srgb,var(--hk-ink) 24%,transparent)}
:root.dark .ldw{--ldw-paper:color-mix(in srgb,var(--ui-base,#e6edf3) 90%,var(--ui-bg-chrome,#0d1015));--ldw-paper-ink:var(--ui-bg-chrome,#0d1015);
  --ldw-paper-rule:color-mix(in srgb,var(--ui-bg-chrome,#0d1015) 30%,transparent)}
.ldw-frame{display:grid;grid-template-columns:184px minmax(0,1fr);min-height:100%;align-items:stretch}
.ldw-frame>.ldw-inner{padding:20px 28px 44px;gap:18px;max-width:1240px;box-sizing:border-box;width:100%}
.ldw-rail{border-right:1px solid var(--hk-stroke);padding:20px 0;display:flex;flex-direction:column;gap:2px;position:sticky;top:0;align-self:start;min-height:100%}
.ldw-ev{display:grid;gap:3px;text-align:left;background:transparent;border:0;padding:11px 18px;color:var(--hk-ink);font:inherit;cursor:pointer}
.ldw-ev b{font-family:var(--ldw-cond);font-weight:700;font-size:21px;line-height:1;text-transform:uppercase;letter-spacing:.02em}
.ldw-ev span{font-size:13px}
.ldw-ev:hover{background:var(--hk-hover)}
.ldw-ev[aria-current=page]{box-shadow:inset 3px 0 0 var(--hk-accent);background:color-mix(in srgb,var(--hk-accent) 9%,transparent)}
.ldw-ev-ballots{margin-top:16px}.ldw-ev-ballots b{font-size:18px}
.ldw-ev:focus-visible{outline:2px solid var(--hk-accent);outline-offset:-2px}

.ldw-strip{list-style:none;margin:0;padding:0;display:flex;gap:3px;min-height:46px}
.ldw-seg{position:relative;flex-basis:0;border:1px solid var(--hk-stroke-strong);border-radius:var(--ldw-r);overflow:hidden;display:flex}
.ldw-seg>b,.ldw-seg>span,.ldw-seg-btn{position:relative}
.ldw-seg:not(:has(.ldw-seg-btn)){flex-direction:column;justify-content:center;padding:5px 10px}
.ldw-seg-btn{all:unset;box-sizing:border-box;display:flex;flex-direction:column;justify-content:center;width:100%;padding:5px 10px;cursor:pointer}
.ldw-seg-btn:focus-visible{outline:2px solid var(--hk-accent);outline-offset:-2px}
.ldw-seg-btn:hover{background:var(--hk-hover)}
.ldw-seg-code{font-family:var(--hk-mono);font-size:12.5px;font-weight:700;white-space:nowrap;position:relative}
.ldw-seg-sub{font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;position:relative}
.ldw-seg[data-state=done]{background:var(--hk-sunken)}
.ldw-seg[data-state=now]{border-color:var(--hk-accent);box-shadow:inset 0 0 0 1px var(--hk-accent)}
.ldw-seg-fill{position:absolute;left:0;top:0;bottom:0;background:color-mix(in srgb,var(--hk-accent) 16%,transparent);transition:width 200ms linear}

.ldw-slip{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:22px;align-items:end;border-bottom:1px solid var(--hk-stroke);padding-bottom:14px}
.ldw-kicker{font-family:var(--hk-mono);font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;display:flex;align-items:center;gap:14px;flex-wrap:wrap}
.ldw-modeswitch{text-transform:none;letter-spacing:0;font-family:var(--font-sans,inherit);font-weight:400}
.ldw-question{margin:6px 0 4px;font-family:var(--ldw-serif);font-weight:600;font-size:25px;line-height:1.25;max-width:34ch;letter-spacing:0}
.ldw-question-sm{font-family:var(--ldw-serif);font-size:19px;line-height:1.3;font-weight:600}
.ldw-outline-side{font-size:13.5px;text-align:right;line-height:1.6;max-width:300px}

.ldw-stage2{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:30px;align-items:center;padding:6px 0}
.ldw-clockface{display:grid;gap:14px;justify-items:start}
.ldw-clock-label{font-family:var(--hk-mono);font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}
.ldw-bigclock{font-family:var(--ldw-cond);font-weight:700;font-size:clamp(120px,15vw,190px);line-height:.82;letter-spacing:-.01em;font-variant-numeric:tabular-nums;display:flex;align-items:baseline;gap:10px}
.ldw-bigclock.ldw-over{color:var(--hk-bad)}
.ldw-overword{font-family:var(--ldw-cond);font-size:34px;text-transform:uppercase;letter-spacing:.04em}
.ldw-cards{display:flex;gap:6px;align-items:flex-end;flex-wrap:wrap}
.ldw-card{font-family:var(--ldw-cond);font-weight:700;font-size:22px;min-width:44px;height:52px;padding:0 6px;border-radius:var(--ldw-r);display:grid;place-items:center;border:1.5px solid var(--hk-stroke-strong)}
.ldw-card-time{min-width:64px;font-size:16px;text-transform:uppercase;letter-spacing:.04em}
.ldw-card[data-up]{height:66px;background:var(--hk-ink);color:var(--hk-bg);border-color:var(--hk-ink)}
@media (prefers-reduced-motion:no-preference){.ldw-card[data-up]{animation:ldw-flip 120ms ease-out}@keyframes ldw-flip{from{transform:rotateX(70deg)}to{transform:none}}}
.ldw-go{display:grid;gap:12px;justify-items:stretch}
.ldw-rec{display:flex;align-items:center;justify-content:center;gap:10px;border:0;border-radius:var(--ldw-r);padding:18px;background:var(--hk-accent);color:var(--dt-primary-foreground,#fff);font:inherit;font-size:17px;font-weight:700;cursor:pointer}
.ldw-rec .codicon{font-size:20px !important}
.ldw-rec:disabled{cursor:default}
.ldw-rec:focus-visible{outline:2px solid var(--hk-ink);outline-offset:2px}
.ldw-rec-stop{background:var(--hk-ink);color:var(--hk-bg)}
.ldw-level{width:14px;height:14px;border-radius:50%;background:var(--hk-bad-fill);transform:scale(calc(.55 + var(--lv,0) * 1.4));transition:transform 60ms linear}

.ldw-last{background:var(--hk-surface);border:1px solid var(--hk-stroke);border-radius:var(--ldw-r);padding:14px 16px 12px;display:grid;gap:10px}
.ldw-last-head{display:flex;justify-content:space-between;align-items:baseline;gap:10px;flex-wrap:wrap}
.ldw-prov{font-size:13px}
.ldw-wave{position:relative;padding-top:14px}
.ldw-wave svg{display:block;width:100%;height:64px;color:var(--hk-ink)}
.ldw-wave-bar{fill:color-mix(in srgb,var(--hk-ink) 55%,transparent)}
.ldw-wave-pause{fill:color-mix(in srgb,var(--hk-bad-fill) 24%,transparent)}
.ldw-wave-answer{stroke:var(--hk-accent);stroke-width:3;vector-effect:non-scaling-stroke}
.ldw-wave-mark{position:absolute;top:-2px;transform:translateX(-50%);font-family:var(--hk-mono);font-size:12px;font-weight:700;background:var(--hk-surface);padding:0 4px;white-space:nowrap;text-transform:uppercase}
.ldw-wave-ticks{position:relative;height:18px;margin-top:4px}
.ldw-wave-ticks span{position:absolute;transform:translateX(-50%);font-family:var(--hk-mono);font-size:12px}
.ldw-wave-ticks span:first-child{transform:none}.ldw-wave-ticks span:last-child{transform:translateX(-100%)}
.ldw-stats{display:flex;gap:8px 24px;flex-wrap:wrap;margin:0;font-size:13.5px}
.ldw-stat dd{margin:0}
.ldw-stat b{font-family:var(--hk-mono);font-size:15px}
.ldw-stat[data-bad] b{color:var(--hk-bad)}
.ldw-said summary{cursor:pointer;font-size:13px;font-weight:600}
.ldw-spoken{font-family:var(--ldw-serif);font-size:16px;line-height:1.6;max-width:74ch;white-space:pre-wrap}

.ldw-upnext{display:flex;gap:14px;align-items:center;border-top:1px solid var(--hk-stroke);padding-top:14px;margin-top:auto}
.ldw-upnext p{margin:0;flex:1;font-size:14px;max-width:80ch}.ldw-upnext p+*{margin-left:auto}
/* the ballot sheet: white paper in light mode, a lit page in dark; the accent is the judge's pen */
.ldw-sheet{background:var(--ldw-paper);color:var(--ldw-paper-ink);border:1px solid var(--hk-stroke);border-radius:var(--ldw-r);padding:18px 24px 18px;max-width:760px;
  box-shadow:0 8px 24px -14px color-mix(in srgb,#000 55%,transparent);display:grid;gap:0}
@media (prefers-reduced-motion:no-preference){.ldw-sheet{animation:ldw-in 220ms var(--hk-ease)}@keyframes ldw-in{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}}
.ldw-sheet-head{display:flex;justify-content:space-between;align-items:baseline;border-bottom:2px solid currentColor;padding-bottom:8px;gap:10px}
.ldw-sheet-head b{font-size:19px;font-weight:800;letter-spacing:-.01em}
.ldw-sheet-head span{font-family:var(--hk-mono);font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}
.ldw-sheet-fields{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));border-bottom:1px solid var(--ldw-paper-rule)}
.ldw-sheet-fields>div{padding:7px 10px 6px;font-size:14px}
.ldw-sheet-fields>div:first-child{padding-left:0}
.ldw-sheet-fields>div+div{border-left:1px solid var(--ldw-paper-rule)}
.ldw-sheet-fields i{display:block;font-style:normal;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase}
.ldw-sheet-q{padding:9px 0;border-bottom:1px solid var(--ldw-paper-rule);font-family:var(--ldw-serif);font-size:16.5px;font-style:italic}
.ldw-sheet-dec{display:grid;grid-template-columns:auto minmax(0,1fr) 200px;gap:18px;align-items:center;padding:12px 0;border-bottom:1px solid var(--ldw-paper-rule)}
.ldw-boxes{display:flex;gap:12px;font-size:14px;white-space:nowrap}
.ldw-sheet .ldw-box{width:16px;height:16px;border:1.6px solid currentColor;margin-right:6px;vertical-align:-3px}
.ldw-sheet .ldw-box[data-x="1"]::before,.ldw-sheet .ldw-box[data-x="1"]::after{background:var(--hk-accent);width:2.6px;height:22px;top:-4px;left:6px;border-radius:2px}
.ldw-verdict{font-size:18px;font-weight:700;line-height:1.3}
.ldw-pts{display:grid;gap:4px;padding-bottom:14px}
.ldw-pts-lbl{font-size:13px}.ldw-pts-lbl b{font-family:var(--hk-mono)}
.ldw-pts-scale{position:relative;height:30px;border-bottom:1.5px solid currentColor;margin:0 8px}
.ldw-pts-scale span{position:absolute;bottom:-29px;transform:translateX(-50%);font-family:var(--hk-mono);font-size:12px}
.ldw-pts-mark{position:absolute;bottom:-11px;width:30px;height:20px;border:2.4px solid var(--hk-accent);border-radius:50%;transform:translateX(-50%) rotate(-8deg)}
.ldw-declines{padding:22px 0 4px;display:grid;gap:2px;font-style:normal}
.ldw-declines h4,.ldw-sheet-rfd h4{margin:0 0 4px;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase}
.ldw-line{display:grid;gap:2px;padding:7px 0;border-bottom:1px dashed var(--ldw-paper-rule)}
.ldw-line-said{font-family:var(--ldw-serif);font-size:15.5px;line-height:1.4;text-decoration:underline;text-decoration-color:var(--hk-accent);text-decoration-thickness:2px;text-underline-offset:3px}
.ldw-line-effect{font-size:13.5px}
.ldw-line-flag{font-size:13px;font-weight:700}
.ldw-drillrow{display:flex;align-items:center;gap:16px;margin-top:14px}
.ldw-drillrow p{margin:0;font-size:14.5px;flex:1}
.ldw-stamp2{font-family:var(--hk-mono);font-weight:800;font-size:12.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--hk-bad-fill);border:2px solid currentColor;border-radius:var(--ldw-r);padding:4px 9px;transform:rotate(-4deg);white-space:nowrap;display:inline-block}
.ldw-stamp-sm{font-size:12px;padding:1px 6px;transform:rotate(-3deg)}
.ldw-fold{all:unset;cursor:pointer;margin-top:14px;font-size:13px;font-weight:600;display:flex;justify-content:space-between;gap:10px}
.ldw-fold span:last-child{font-weight:400}
.ldw-fold:focus-visible{outline:2px solid var(--hk-accent);outline-offset:2px}
.ldw-sheet-rfd{font-family:var(--font-sans,inherit);font-size:14px;line-height:1.55;padding-top:8px;max-width:72ch}
.ldw-sheet .hb-btn,.ldw-sheet button{font-family:var(--font-sans,inherit)}

/* headlines */
.ldw-pullrow,.ldw-drawrow{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.ldw-topic{flex:1;min-width:240px;font-size:15px !important}
.ldw-heads{display:grid;gap:10px}
.ldw-heads-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px;align-items:start}
.ldw-heads-side{display:grid;gap:12px;align-content:start}
.ldw-heads-title{margin:0;font-family:var(--ldw-cond);font-size:17px;font-weight:700;text-transform:uppercase;letter-spacing:.03em;border-bottom:2px solid var(--hk-ink);padding-bottom:4px}
.ldw-outlet{display:grid;gap:6px;padding-bottom:8px;border-bottom:1px solid var(--hk-stroke)}
.ldw-outlet-head{display:flex;justify-content:space-between;gap:8px;align-items:baseline}
.ldw-outlet-head b{font-size:13.5px}
.ldw-lean{font-family:var(--hk-mono);font-size:12px;font-weight:700;white-space:nowrap}
.ldw-outlet-err{margin:0;font-size:13px;font-weight:600;color:var(--hk-bad)}
.ldw-head{display:grid;gap:2px}
.ldw-head-link{all:unset;cursor:pointer;font-family:var(--ldw-serif);font-size:15px;line-height:1.35}
.ldw-head-link:hover{text-decoration:underline}
.ldw-linkmiss{font-family:var(--hk-mono);font-size:12.5px;word-break:break-all;user-select:all}
.ldw-head-link:focus-visible{outline:2px solid var(--hk-accent);outline-offset:2px}
.ldw-head-meta{display:flex;gap:12px;font-size:12.5px}
.ldw-saved{font-weight:600}
.ldw-drawn{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
.ldw-drawn-q{all:unset;box-sizing:border-box;cursor:pointer;display:grid;gap:8px;height:100%;padding:14px 16px;border:1px solid var(--hk-stroke-strong);border-radius:var(--ldw-r);background:var(--hk-surface)}
.ldw-drawn-q:hover{border-color:var(--hk-accent)}
.ldw-drawn-q:focus-visible{outline:2px solid var(--hk-accent);outline-offset:2px}
.ldw-outlet-table{border-collapse:collapse;width:100%}
.ldw-outlet-table td{padding:4px 6px 4px 0}
.ldw-select{font:inherit;font-size:13px;color:var(--hk-ink);background:var(--hk-surface);border:1px solid var(--hk-stroke-strong);border-radius:var(--ldw-r);padding:5px 6px}

/* prep */
.ldw-prep{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:26px;align-items:start}
.ldw-outline{display:grid;gap:12px}
.ldw-ofield{display:grid;gap:4px}
.ldw-ofield>span{font-size:13px;font-weight:700}
.ldw-ofield textarea{font-family:var(--ldw-serif) !important;font-size:15px !important;line-height:1.5 !important;resize:vertical}
.ldw-prep-side{display:grid;gap:12px;position:sticky;top:0}
.ldw-prepclock{display:flex;align-items:baseline;justify-content:space-between;gap:10px}
.ldw-prepclock .ldw-num{font-family:var(--ldw-cond);font-weight:700;font-size:64px;line-height:1}
.ldw-srcs{list-style:none;margin:0;padding:0;display:grid;gap:6px;max-height:340px;overflow:auto;font-size:13px}
.ldw-srcs label{display:flex;gap:8px;align-items:flex-start;cursor:pointer;flex:1;min-width:0}
.ldw-src-row{display:flex;gap:10px;align-items:flex-start}
.ldw-src-remove{flex:none;font-size:12px}
.ldw-srcs .hk-notice{margin-top:6px}

/* rhetoric */
.ldw-read{display:grid;grid-template-columns:220px minmax(0,1fr) 230px;gap:24px;align-items:start}
.ldw-library ul{list-style:none;margin:6px 0;padding:0;display:grid;gap:2px}
.ldw-lib-item{all:unset;box-sizing:border-box;display:grid;gap:2px;width:100%;padding:8px 10px;border-radius:var(--ldw-r);cursor:pointer;font-size:13px}
.ldw-lib-item b{font-size:13.5px}
.ldw-lib-item:hover{background:var(--hk-hover)}
.ldw-lib-item[aria-current],.ldw-lib-on{box-shadow:inset 3px 0 0 var(--hk-accent);background:color-mix(in srgb,var(--hk-accent) 8%,transparent)}
.ldw-lib-item:focus-visible{outline:2px solid var(--hk-accent);outline-offset:-2px}
.ldw-readtext{display:grid;gap:12px;min-width:0}
.ldw-docmeta{display:grid;gap:2px}
.ldw-marked{font-family:var(--ldw-serif);font-size:17px;line-height:1.75;white-space:pre-wrap;max-width:68ch}
.ldw-mk{text-decoration:underline;text-decoration-color:var(--hk-accent);text-decoration-thickness:2px;text-underline-offset:4px;cursor:help}
.ldw-mk[data-n]{text-decoration-thickness:3.5px}
.ldw-mk-appeal{text-decoration-style:dashed}
.ldw-mk-focus{background:color-mix(in srgb,var(--hk-accent) 18%,transparent)}
.ldw-counts{display:grid;gap:10px;position:sticky;top:0}
.ldw-countlist{list-style:none;margin:0;padding:0;display:grid;gap:2px}
.ldw-count{all:unset;box-sizing:border-box;display:flex;gap:10px;align-items:baseline;width:100%;padding:4px 8px;border-radius:var(--ldw-r);cursor:pointer;font-size:13.5px}
.ldw-count b{font-family:var(--hk-mono);min-width:2ch;text-align:right}
.ldw-count[aria-pressed=false]{text-decoration:line-through}
.ldw-count:hover{background:var(--hk-hover)}
.ldw-count:focus-visible{outline:2px solid var(--hk-accent);outline-offset:-2px}
.ldw-figs{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,330px),1fr));gap:22px;align-items:start}
.ldw-effect{display:grid;gap:8px;align-content:start}
.ldw-effect-title{margin:0;font-family:var(--ldw-cond);font-size:19px;font-weight:700;text-transform:uppercase;letter-spacing:.02em;border-bottom:2px solid var(--hk-ink);padding-bottom:4px}
.ldw-effect-q{margin:0;font-size:13.5px;font-style:italic}
.ldw-figlist{margin:0;display:grid;gap:10px}
.ldw-fig{display:grid;gap:2px}
.ldw-fig dt{font-weight:700;font-size:14px;display:flex;gap:10px;align-items:baseline;justify-content:space-between}
.ldw-fig dd{margin:0;font-size:13.5px}
.ldw-fig-ex q{font-family:var(--ldw-serif);font-size:14.5px}
.ldw-fig-ex cite{font-style:normal;font-size:12.5px;margin-left:6px}
.ldw-spot,.ldw-write{display:grid;gap:12px;max-width:760px}
.ldw-spot-q{margin:0;font-family:var(--ldw-serif);font-size:24px;line-height:1.4;border-left:3px solid var(--hk-stroke-strong);padding:4px 0 4px 16px}
.ldw-small{font-size:16px}

/* ballots */
.ldw-ballots{display:grid;gap:20px}
.ldw-patgrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:26px;align-items:start}
.ldw-patterns{display:grid;gap:10px}
.ldw-patlist{list-style:none;margin:0;padding:0;display:grid;gap:12px}
.ldw-pat{display:grid;gap:6px}
.ldw-pat-text{display:grid;gap:1px}
.ldw-pat-text b{font-size:14.5px}
.ldw-pat-text span{font-size:13px}
.ldw-rounds{list-style:none;margin:0;padding:0;display:flex;gap:4px;flex-wrap:wrap}
.ldw-round{display:flex;gap:4px;align-items:baseline;border:1px solid var(--hk-stroke-strong);border-radius:var(--ldw-r);padding:2px 7px;font-family:var(--hk-mono);font-size:12px}
.ldw-round b{font-weight:800}
.ldw-round[data-hit]{border-color:var(--hk-bad-fill);box-shadow:inset 0 -3px 0 var(--hk-bad-fill)}
.ldw-blist{list-style:none;margin:0;padding:0;display:grid;gap:0}
.ldw-brow{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:20px;padding:12px 0;border-top:1px solid var(--hk-stroke);align-items:start}
.ldw-brow-main{display:grid;gap:3px}
.ldw-brow-top{display:flex;gap:12px;font-size:13px;flex-wrap:wrap}
.ldw-brow-q{margin:0;font-family:var(--ldw-serif);font-size:15.5px}
.ldw-brow-res{margin:0;font-size:13.5px}
.ldw-brow-drill{display:flex;gap:8px;align-items:flex-start;font-size:13.5px;cursor:pointer}
.ldw-done>span{text-decoration:line-through}

/* floors: nothing under 12px, anywhere on the page */
.ldw-side-tag,.ldw-paper-top,.ldw-flow th span,.ldw-mono,.ldw-slot-who,.ldw-menu-meta,.ldw-menu-head,.ldw-pnum,.ldw-caret{font-size:12px !important}
.ldw-thinking{font-size:12px}
.ldw-paper-top{letter-spacing:.1em}

@container (max-width:1060px){.ldw-read{grid-template-columns:200px minmax(0,1fr)}.ldw-counts{grid-column:1/-1;position:static}.ldw-brow{grid-template-columns:1fr}}
@container (max-width:900px){.ldw-frame{grid-template-columns:1fr;grid-template-rows:auto 1fr}.ldw-rail{flex-direction:row;flex-wrap:wrap;border-right:0;border-bottom:1px solid var(--hk-stroke);padding:0;position:static;min-height:0}
  .ldw-ev{padding:12px 14px}.ldw-ev b,.ldw-ev-ballots b,.ldw-ev-settings b{font-size:17px;white-space:nowrap}.ldw-ev span{display:none}.ldw-ev-settings{margin-top:0}.ldw-ev[aria-current=page]{box-shadow:inset 0 -3px 0 var(--hk-accent)}
  .ldw-sheet-fields>div:nth-child(odd){padding-left:0;border-left:0}.ldw-sheet-fields>div:nth-child(n+3){border-top:1px solid var(--ldw-paper-rule)}
  .ldw-ev-ballots{margin-top:0}.ldw-stage2,.ldw-prep,.ldw-heads-grid,.ldw-drawn,.ldw-read,.ldw-patgrid,.ldw-slip{grid-template-columns:1fr}.ldw-sheet-dec,.ldw-sheet-fields{grid-template-columns:1fr 1fr}
  .ldw-outline-side{text-align:left}}
/* Lincoln-Douglas in the frame: the big clock and its actions on one row, the speech and last ballot under it */
.ldw-floor{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:var(--ldw-gap) 30px;align-items:start}
.ldw-floor>.ldw-clock{grid-column:1/-1;position:static;border-bottom:1px solid var(--hk-stroke);padding:4px 0 20px}
.ldw-ldface{display:grid;gap:12px;justify-items:start}
.ldw-ldside{display:grid;gap:12px;align-content:start}
.ldw-ldside .ldw-rows{margin:0}
.ldw-ldactions{position:sticky;top:0}
.ldw-ldactions .hb-menu-trigger,.ldw-ldactions>button{width:100%}
.ldw-ldballot{display:grid;gap:12px;min-width:0}
.ldw-ldballot .ldw-sheet{max-width:none}
.ldw-paper{background:var(--ldw-paper) !important;color:var(--ldw-paper-ink) !important;border-color:var(--hk-stroke) !important}
.ldw-paper .ldw-stamp{color:var(--hk-bad-fill)}
.ldw-line-btn{all:unset;cursor:pointer;display:flex;gap:10px;align-items:baseline}
.ldw-line-btn:hover .ldw-line-said{text-decoration-thickness:3px}
.ldw-line-btn:focus-visible{outline:2px solid var(--hk-accent);outline-offset:2px}
.ldw-line-code{font-family:var(--hk-mono);font-size:12px;font-weight:700;min-width:34px}
.ldw-ldverdict{font-family:var(--ldw-cond);font-size:38px;line-height:1;text-transform:uppercase;letter-spacing:.01em}
.ldw-sheet-why{margin:0;padding:10px 0;border-bottom:1px solid var(--ldw-paper-rule);font-size:15px;line-height:1.45;max-width:70ch}
.ldw-sheet-rfd h4{margin-top:12px}
.ldw-drill2{display:grid;gap:2px;padding:6px 0;border-bottom:1px dashed var(--ldw-paper-rule)}.ldw-drill2 p{margin:0}
.ldw-live{background:var(--hk-surface);border:1px solid var(--hk-stroke);border-radius:var(--ldw-r);padding:14px 16px 12px;display:grid;gap:10px}
.ldw-live .ldw-wave-bar{fill:var(--hk-accent)}
.ldw-live-wait{font-size:14px}
@container (max-width:900px){.ldw-floor{grid-template-columns:1fr}}
.ldw-ev-settings{margin-top:auto}.ldw-ev-settings b{font-size:16px}
.ldw-settings{display:grid;gap:4px;max-width:880px}
.ldw-set-h1{margin:0 0 10px;font-family:var(--ldw-cond);font-size:34px;font-weight:700;text-transform:uppercase;letter-spacing:.01em}
.ldw-set{display:grid;grid-template-columns:200px minmax(0,1fr);gap:24px;padding:20px 0;border-top:1px solid var(--hk-stroke)}
.ldw-set-title{margin:0;font-size:16px;font-weight:700}
.ldw-set-body{display:grid;gap:12px;min-width:0;justify-items:start}
.ldw-set-body>.ldw-panel,.ldw-set-body>.hk-notice,.ldw-set-body>.ldw-outlets-embedded{justify-self:stretch}
.ldw-set-status{margin:0;font-size:15px;font-weight:600}
.ldw-set-line{margin:0;font-size:14px;line-height:1.5;max-width:64ch}
.ldw-leaves{display:grid;grid-template-columns:120px minmax(0,1fr);gap:8px 16px;margin:0;font-size:14px;line-height:1.5}
.ldw-leaves dt{font-weight:700}.ldw-leaves dd{margin:0;max-width:64ch}
@container (max-width:900px){.ldw-set{grid-template-columns:1fr;gap:10px}}
.ldw-web{display:grid;gap:10px;border-top:1px solid var(--hk-stroke);padding-top:14px}
.ldw-web .ldw-topic{min-width:0}
.ldw-webres{list-style:none;margin:0;padding:0;display:grid}
.ldw-webres li{display:grid;gap:6px;justify-items:start;padding:9px 0;border-bottom:1px solid var(--hk-stroke)}
.ldw-webres-text{display:grid;gap:3px;min-width:0}
.ldw-webres-text .ldw-meta{font-size:13px;line-height:1.45}
.ldw-listen{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.ldw-listen .hk-notice{flex-basis:100%}
.ldw-ocards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;align-items:start}
.ldw-ocard{position:relative;background:var(--hk-surface);border:1px solid var(--hk-stroke);border-radius:var(--ldw-r);padding:14px 16px;display:grid;gap:8px;justify-items:start;min-height:120px}
.ldw-ocard[data-active]{border-color:var(--hk-accent);box-shadow:inset 0 0 0 1px var(--hk-accent)}
.ldw-ocard-best{border-color:var(--hk-ink);box-shadow:inset 0 0 0 1px var(--hk-ink)}
.ldw-ocard-head{display:flex;justify-content:space-between;gap:10px;width:100%;align-items:center;flex-wrap:wrap}
.ldw-ocard-head b{font-family:var(--ldw-cond);font-size:19px;text-transform:uppercase;letter-spacing:.02em}
.ldw-ocard-said{margin:0;font-size:15px;line-height:1.45}
.ldw-stamp-best{color:var(--hk-ink);margin-right:auto}
.ldw-bad{color:var(--hk-bad)}
.ldw-onote{display:grid;gap:4px;font-size:13.5px;line-height:1.45;border-top:1px dashed var(--hk-stroke);padding-top:8px}.ldw-onote p{margin:0}
.ldw-ocoach{display:grid;gap:6px;max-width:760px}.ldw-ocoach p{margin:0;font-size:15px;line-height:1.5}
@container (max-width:900px){.ldw-ocards{grid-template-columns:1fr}}

/* 0.2.1: narrow windows (a 1024 x 720 laptop leaves about 790px): the strip stays on one row, drawn to scale,
   and the clock keeps its actions beside it so Speak is above the fold. Only a phone-narrow pane stacks. */
@container (max-width:900px){.ldw-seg:not(:has(.ldw-seg-btn)),.ldw-seg-btn{padding:4px 6px}.ldw-seg-code{font-size:12px}
  .ldw-stage2{grid-template-columns:minmax(0,1fr) 230px;gap:18px}.ldw-bigclock{font-size:clamp(96px,13vw,150px)}.ldw-card{min-width:34px}}
@container (max-width:620px){.ldw-strip{flex-wrap:wrap}.ldw-seg{min-width:96px !important}.ldw-stage2,.ldw-stage3{grid-template-columns:1fr}}
/* a choice of one: the picked option is outlined in the accent, checked and bold */
.ldw-choices{display:inline-flex;flex-wrap:wrap;gap:4px;text-transform:none;letter-spacing:0;font-family:var(--font-sans,inherit);font-weight:400}
.ldw-choice{all:unset;box-sizing:border-box;display:inline-flex;align-items:center;gap:5px;padding:5px 11px 5px 8px;border:1px solid var(--hk-stroke-strong);border-radius:var(--ldw-r);font-size:13px;line-height:1.2;color:var(--hk-ink);cursor:pointer;white-space:nowrap;transition:background var(--hk-dur,120ms) var(--hk-ease,ease),border-color var(--hk-dur,120ms) var(--hk-ease,ease)}
.ldw-choice:hover{background:var(--hk-hover)}
.ldw-choice:focus-visible{outline:2px solid var(--hk-accent);outline-offset:2px}
.ldw-choice[aria-checked=true]{border-color:var(--hk-accent);box-shadow:inset 0 0 0 1px var(--hk-accent);background:color-mix(in srgb,var(--hk-accent) 13%,transparent);font-weight:700}
.ldw-choice[disabled]{opacity:.55;cursor:default}
.ldw-choice .ldw-choice-check{font-size:13px !important;width:13px;visibility:hidden}
.ldw-choice[aria-checked=true] .ldw-choice-check{visibility:visible;color:var(--hk-accent)}
/* the question tools: another, your own, the list */
.ldw-qtools{display:grid;gap:10px;margin-top:2px}
.ldw-qlinks{display:flex;gap:18px;flex-wrap:wrap}
.ldw-qown,.ldw-qlist{display:grid;gap:10px;max-width:820px;padding:12px 14px;border:1px solid var(--hk-stroke);border-radius:var(--ldw-r);background:var(--hk-surface)}
.ldw-qown-row{display:flex;gap:12px;align-items:center;flex-wrap:wrap}
.ldw-qown-input{width:100%}
.ldw-qown-row .ldw-qown-input{flex:1;min-width:220px;width:auto}
.ldw-check{display:inline-flex;gap:7px;align-items:center;font-size:13.5px;cursor:pointer}
.ldw-qrows{list-style:none;margin:0;padding:0;display:grid}
.ldw-qrow{display:flex;gap:14px;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid var(--hk-stroke)}
.ldw-qrow-text{display:grid;gap:1px;font-family:var(--ldw-serif);font-size:15px;line-height:1.35}
.ldw-qrow-text .ldw-meta{font-family:var(--font-sans,inherit)}
.ldw-qrow-hidden .ldw-qrow-text>span:first-child{text-decoration:line-through}
.ldw-qbuilt summary{cursor:pointer;font-size:13.5px;font-weight:600;padding:4px 0}
.ldw-qbuilt[open] summary{margin-bottom:6px}
.ldw-qbuilt>.hk-link{margin-bottom:6px}
.ldw-ownq{display:grid;gap:8px;border-top:1px solid var(--hk-stroke);padding-top:14px}
.ldw-why-off{margin:-4px 0 0;font-size:13.5px;line-height:1.45;max-width:72ch}
.ldw-drill-note{font-weight:600}
/* the ballot: what the boxes answer, and what the points mean */
.ldw-boxwrap{display:grid;gap:5px}
.ldw-boxes-q{font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase}
.ldw-sheet-dec>.ldw-pts-key{grid-column:1/-1;margin:2px 0 0;font-size:12.5px;line-height:1.45;max-width:none}
/* checked quotes in a fallacy answer */
.ldw-inline-flag{display:inline-block;margin-left:6px;padding:0 6px;border:1.5px solid var(--hk-bad-fill);border-radius:var(--ldw-r);color:var(--hk-bad);font-family:var(--font-sans,inherit);font-style:normal}
/* the flow beside the clock in your rebuttals */
.ldw-stage3{grid-template-columns:auto minmax(0,1fr) 300px;align-items:start}
.ldw-flowside{display:grid;gap:8px;align-content:start;min-width:0;max-height:340px;overflow:auto;border:1px solid var(--hk-stroke);border-radius:var(--ldw-r);padding:10px 12px;background:var(--hk-surface)}
.ldw-flowside-head{display:flex;justify-content:space-between;gap:10px;align-items:baseline}
.ldw-flowside-cols{display:grid;gap:10px}
.ldw-flowside-col{display:grid;gap:4px;align-content:start;min-width:0}
.ldw-flowside-th{display:flex;gap:6px;align-items:baseline;border-bottom:1px solid var(--hk-stroke-strong);padding-bottom:3px;font-family:var(--hk-mono);font-size:12px}
.ldw-flowside-pt{font-size:12.5px;line-height:1.35;overflow-wrap:anywhere}
@container (max-width:1180px){.ldw-stage3{grid-template-columns:minmax(0,1fr) 300px}.ldw-stage3>.ldw-flowside{grid-column:1/-1;grid-row:2;max-height:260px}}
@container (max-width:900px){.ldw-stage3{grid-template-columns:minmax(0,1fr) 230px}}
/* Ballots: a heading, the key, rows that open */
.ldw-ballots-head{display:flex;justify-content:space-between;gap:14px;align-items:center;flex-wrap:wrap}
.ldw-ballots-head .ldw-set-h1{margin:0}
.ldw-legend{margin:0;display:flex;gap:8px 20px;align-items:center;flex-wrap:wrap;font-size:13px}
.ldw-legend-item{display:inline-flex;gap:7px;align-items:center}
button.ldw-brow-main{all:unset;box-sizing:border-box;display:grid;gap:3px;cursor:pointer;min-width:0;border-radius:var(--ldw-r)}
button.ldw-brow-main:hover .ldw-brow-q{text-decoration:underline;text-decoration-color:var(--hk-stroke-strong)}
button.ldw-brow-main:focus-visible{outline:2px solid var(--hk-accent);outline-offset:3px}
.ldw-brow-open-lbl{display:inline-flex;gap:3px;align-items:center;margin-left:auto;color:var(--hk-accent);font-weight:600}
.ldw-brow-sheet{grid-column:1/-1}
.ldw-brow-sheet .ldw-sheet{max-width:900px}
.ldw-print-ballots{display:grid;gap:18px}
.ldw-print-sheet{display:grid;gap:8px;break-inside:avoid}
@media print{.ldw-print-ballots .ldw-noprint,.ldw-rail{display:none !important}.ldw-print-sheet{break-inside:avoid;page-break-inside:avoid}
  .ldw-print-ballots .ldw-sheet{animation:none;box-shadow:none}.ldw-print-ballots h2,.ldw-print-ballots h3{break-after:avoid}.ldw-print-ballots p,.ldw-print-ballots li{orphans:3;widows:3}}
/* The coach: its own box for everything it writes, dashed like an insert pinned to the page, with a label that
   says whose words they are; the chat beside the floor. */
.ldw-ev-coach{margin-top:16px}
.ldw-ev-coach b{font-size:16px;display:inline-flex;align-items:center;gap:6px}.ldw-ev-coach b .codicon{font-size:16px !important}
.ldw-ev-coach[aria-expanded=true]{background:color-mix(in srgb,var(--hk-accent) 9%,transparent)}
.ldw-frame[data-chat]{grid-template-columns:184px minmax(0,1fr) minmax(300px,360px)}
.ldw-frame[data-chat]>.ldw-inner{container-type:inline-size}
.ldw-chat{position:sticky;top:0;align-self:start;height:calc(100vh - 60px);box-sizing:border-box;border-left:1px solid var(--hk-stroke);
  padding:18px 18px 14px;display:grid;grid-template-rows:auto auto minmax(0,1fr) auto auto;gap:10px;background:var(--hk-bg)}
.ldw-chat-head{display:flex;align-items:center;justify-content:space-between;gap:10px}.ldw-chat-head .ldw-h2{margin:0}
.ldw-chat-sees{margin:0;font-size:13.5px;line-height:1.45;padding-bottom:10px;border-bottom:1px solid var(--hk-stroke)}
.ldw-chat-thread{overflow:auto;display:grid;gap:12px;align-content:start;min-height:120px}
.ldw-chat-thread .ldw-prose{font-family:inherit;font-size:14px;line-height:1.55}
.ldw-chat-foot{margin:0;font-size:12.5px;line-height:1.45}
@container (max-width:900px){.ldw-frame[data-chat]{grid-template-columns:1fr}
  .ldw-chat{position:sticky;bottom:0;top:auto;height:auto;max-height:60vh;border-left:0;border-top:1px solid var(--hk-stroke-strong);box-shadow:0 -6px 18px color-mix(in srgb,var(--hk-ink) 12%,transparent)}
  .ldw-ev-coach{margin-top:0}.ldw-ev-coach b{font-size:17px}}

.ldw-coachbox{border:1.5px dashed var(--hk-stroke-strong);border-radius:var(--ldw-r);padding:14px 16px;display:grid;gap:9px;max-width:760px;box-sizing:border-box;min-width:0}
.ldw-coachbox-head{display:flex;align-items:baseline;gap:4px 14px;flex-wrap:wrap}
.ldw-coachbox-label{font-family:var(--hk-mono);font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}
.ldw-coachbox-sub{font-size:13.5px}
.ldw-coachbox-close{margin-left:auto}
.ldw-coachbox-said{margin:2px 0}
.ldw-coachbox-h{margin:4px 0 0;font-size:13px;font-weight:700}
.ldw-coachbox-notes{margin:0;padding-left:20px;display:grid;gap:4px;font-size:14.5px;line-height:1.5}
.ldw-coachbox-kept{margin:0;font-size:14px;line-height:1.5}
.ldw-coachbox-check{margin:2px 0 0;padding-top:8px;border-top:1px dashed var(--hk-stroke);font-size:13px;line-height:1.45}
.ldw-coachask{display:flex;align-items:center;gap:8px 14px;flex-wrap:wrap}.ldw-coachask .ldw-meta{font-size:13.5px}
.ldw-coachask-row{margin-top:10px}
.ldw-redo-row{display:grid;grid-template-columns:142px minmax(0,1fr);gap:12px;align-items:baseline}.ldw-redo-row p{margin:0}
.ldw-redo-k{font-family:var(--hk-mono);font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase}
@container (max-width:620px){.ldw-redo-row{grid-template-columns:1fr;gap:2px}}
.ldw-prep-main{display:grid;gap:18px;min-width:0}
.ldw-prepcoach{display:grid;gap:10px;padding-top:14px;border-top:1px solid var(--hk-stroke)}
.ldw-prepcoach-row{display:flex;gap:8px 12px;align-items:center;flex-wrap:wrap}.ldw-prepcoach-row .ldw-why-off,.ldw-prepcoach-row .ldw-meta{margin:0;font-size:13.5px;flex:1;min-width:220px}
.ldw-prepcoach-row .ldw-topic{flex:1;min-width:220px}
.ldw-areas{margin:0;padding-left:22px;display:grid;gap:12px;list-style:decimal}.ldw-areas>li{display:list-item}.ldw-areas>li>*+*{margin-top:3px}.ldw-areas p{margin:0;font-size:14.5px;line-height:1.5}
.ldw-areas b{font-size:15px}
.ldw-areas-src{font-family:var(--ldw-serif)}
.ldw-areas-cite{font-family:var(--hk-mono);font-size:12.5px;font-weight:700}
.ldw-areas.ldw-picks{list-style:none;padding-left:0}
.ldw-versions{margin:0;padding-left:22px;display:grid;gap:10px;list-style:decimal}.ldw-versions p{margin:0}
.ldw-drafts{margin:0;padding:0;list-style:none;display:grid;gap:14px}.ldw-drafts>li{display:grid;gap:4px}.ldw-drafts b{font-size:14.5px}
.ldw-draft-text .ldw-prose{font-size:14.5px;line-height:1.55}.ldw-draft-text ol{list-style:decimal}.ldw-draft-text ul{list-style:disc}
.ldw-attackbox{display:grid;gap:8px;max-width:680px}
.ldw-sheet .ldw-coachbox{margin-top:12px;max-width:none;border-color:var(--ldw-paper-rule)}.ldw-sheet .ldw-coachbox-check{border-top-color:var(--ldw-paper-rule)}
`
