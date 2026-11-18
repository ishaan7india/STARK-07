import { invoke } from "@tauri-apps/api/core";

export type MatrixTheme = "cyan" | "emerald" | "amber" | "crimson" | "synth";
export type MatrixLayout = "full" | "minimal" | "stream";
export type GlyphMode = "binary" | "matrix" | "hex" | "cyber";

interface ThemeColors {
	name: string;
	head: string;
	trail: string;
	dim: string;
	bgAlpha: string;
	accent: string;
	border: string;
	panelBg: string;
	glow: string;
	particle: string;
	grid: string;
}

const THEMES: Record<MatrixTheme, ThemeColors> = {
	cyan: {
		name: "Stark Arc Cyan",
		head: "#ffffff",
		trail: "#00e5ff",
		dim: "#003b5c",
		bgAlpha: "rgba(1, 6, 14, 0.18)",
		accent: "#00e5ff",
		border: "rgba(0, 229, 255, 0.35)",
		panelBg: "rgba(3, 14, 26, 0.85)",
		glow: "0 0 18px rgba(0, 229, 255, 0.6)",
		particle: "rgba(0, 229, 255, 0.75)",
		grid: "rgba(0, 229, 255, 0.15)"
	},
	emerald: {
		name: "Matrix Emerald",
		head: "#ffffff",
		trail: "#00ff66",
		dim: "#00471c",
		bgAlpha: "rgba(1, 8, 4, 0.18)",
		accent: "#00ff66",
		border: "rgba(0, 255, 102, 0.35)",
		panelBg: "rgba(2, 16, 8, 0.85)",
		glow: "0 0 18px rgba(0, 255, 102, 0.6)",
		particle: "rgba(0, 255, 102, 0.75)",
		grid: "rgba(0, 255, 102, 0.15)"
	},
	amber: {
		name: "Amber Core",
		head: "#fff9e6",
		trail: "#ffb300",
		dim: "#5c3300",
		bgAlpha: "rgba(10, 5, 2, 0.18)",
		accent: "#ffb300",
		border: "rgba(255, 179, 0, 0.35)",
		panelBg: "rgba(22, 11, 2, 0.85)",
		glow: "0 0 18px rgba(255, 179, 0, 0.6)",
		particle: "rgba(255, 179, 0, 0.75)",
		grid: "rgba(255, 179, 0, 0.15)"
	},
	crimson: {
		name: "Crimson Alert",
		head: "#ffffff",
		trail: "#ff3355",
		dim: "#5c0816",
		bgAlpha: "rgba(12, 2, 4, 0.18)",
		accent: "#ff3355",
		border: "rgba(255, 51, 85, 0.35)",
		panelBg: "rgba(26, 4, 8, 0.85)",
		glow: "0 0 18px rgba(255, 51, 85, 0.6)",
		particle: "rgba(255, 51, 85, 0.75)",
		grid: "rgba(255, 51, 85, 0.15)"
	},
	synth: {
		name: "Synthwave Neon",
		head: "#ffffff",
		trail: "#c084fc",
		dim: "#4a1268",
		bgAlpha: "rgba(8, 2, 14, 0.18)",
		accent: "#e879f9",
		border: "rgba(232, 121, 249, 0.35)",
		panelBg: "rgba(18, 4, 28, 0.85)",
		glow: "0 0 18px rgba(232, 121, 249, 0.6)",
		particle: "rgba(232, 121, 249, 0.75)",
		grid: "rgba(232, 121, 249, 0.15)"
	}
};

const GLYPH_SETS: Record<GlyphMode, string[]> = {
	binary: ["0", "1"],
	matrix: [
		"ｦ", "ｱ", "ｳ", "ｴ", "ｵ", "ｶ", "ｷ", "ｹ", "ｺ", "ｻ", "ｼ", "ｽ", "ｾ", "ｿ",
		"ﾀ", "ﾂ", "ﾃ", "ﾅ", "ﾆ", "ﾇ", "ﾈ", "ﾊ", "ﾋ", "ﾎ", "ﾏ", "ﾐ", "ﾑ", "ﾒ",
		"ﾓ", "ﾔ", "ﾕ", "ﾗ", "ﾘ", "ﾜ", "9", "8", "7", "5", "2", "1", "0",
		"+", "-", "*", "=", "<", ">", "$", "%", "#", "&"
	],
	hex: [
		"0", "1", "2", "3", "4", "5", "6", "7", "8", "9",
		"A", "B", "C", "D", "E", "F", "0x", "FF", "7F", "E0"
	],
	cyber: [
		"⚡", "◈", "⬡", "⬢", "⌁", "⎔", "⏣", "⎇", "⎈", "⏚",
		"λ", "Ω", "Ψ", "⌘", "❖", "▲", "▼", "0", "1"
	]
};

interface DropStream {
	x: number;
	y: number;
	speed: number;
	length: number;
	layer: number; // 0 = far, 1 = mid, 2 = fore
	fontSize: number;
	chars: string[];
	glitchTimer: number;
	burst: boolean;
}

interface CyberMote {
	x: number;
	y: number;
	vx: number;
	vy: number;
	size: number;
	alpha: number;
	baseAlpha: number;
}

interface RippleWave {
	x: number;
	y: number;
	radius: number;
	maxRadius: number;
	alpha: number;
}

export class MatrixHudController {
	private container: HTMLElement | null = null;
	private canvas: HTMLCanvasElement | null = null;
	private ctx: CanvasRenderingContext2D | null = null;
	private animationFrameId: number | null = null;
	private telemetryIntervalId: number | null = null;

	public enabled: boolean = false;
	public theme: MatrixTheme = "cyan";
	public layout: MatrixLayout = "full";
	public glyphMode: GlyphMode = "binary";
	public density: "dense" | "balanced" | "sparse" = "dense";
	public rainSpeed: "fast" | "normal" | "steady" = "normal";
	public showGrid: boolean = true;
	public showMotes: boolean = true;
	public hudVisible: boolean = true;

	// Widget Toggle State (user editable widgets)
	public widgetToggles = {
		cpu: true,
		ram: true,
		gpu: true,
		disk: true,
		net: true,
		power: true,
		weather: true,
		reticle: true,
		wave: true,
		terminal: true
	};

	// Rain Engine State
	private streams: DropStream[] = [];
	private motes: CyberMote[] = [];
	private ripples: RippleWave[] = [];
	private mouseX: number = -1000;
	private mouseY: number = -1000;
	private isEditorOpen: boolean = false;
	private gridOffset: number = 0;

	// FPS Calculation
	private fps: number = 60;
	private frameCount: number = 0;
	private fpsTimer: number = performance.now();

	// Telemetry State
	private cpuPercent: number = 24;
	private cpuHistory: number[] = new Array(30).fill(22);
	private threadLoads: number[] = [22, 28, 18, 35, 14, 40, 26, 31, 20, 24, 16, 29, 38, 19, 25, 33];
	private ramPercent: number = 46;
	private totalRamGb: number = 16.0;
	private usedRamGb: number = 7.4;
	private gpuPercent: number = 18;
	private vramUsedGb: number = 2.4;
	private vramTotalGb: number = 8.0;
	private diskFreeGb: number = 380;
	private diskTotalGb: number = 512;
	private netRxKbps: number = 1420;
	private netTxKbps: number = 320;
	private netHistory: number[] = new Array(24).fill(15);
	private batteryPercent: number = 85;
	private batteryCharging: boolean = true;
	private startTime: number = Date.now();
	private lastLogUpdate: number = Date.now();
	private terminalLogs: string[] = [
		"[CORE_INIT] STARK-07 Cybernetic Kernel loaded",
		"[SECURITY] Hardware Secure Enclave: Operational",
		"[MEMORY] High-speed DDR5 address mapping verified",
		"[NETWORK] Encrypted mesh handshake established",
		"[GRAPHICS] Direct3D 12 low-overhead 60 FPS active",
		"[TELEMETRY] Multi-layer matrix stream active // Tracking sensors"
	];

	constructor() {
		this.theme = (localStorage.getItem("stark-matrix-theme") as MatrixTheme) || "cyan";
		this.layout = (localStorage.getItem("stark-matrix-layout") as MatrixLayout) || "full";
		this.glyphMode = (localStorage.getItem("stark-matrix-glyph-mode") as GlyphMode) || "binary";
		this.density = (localStorage.getItem("stark-matrix-density") as "dense" | "balanced" | "sparse") || "dense";
		this.rainSpeed = (localStorage.getItem("stark-matrix-speed") as "fast" | "normal" | "steady") || "normal";
		this.showGrid = localStorage.getItem("stark-matrix-grid") !== "false";
		this.showMotes = localStorage.getItem("stark-matrix-motes") !== "false";

		try {
			const saved = localStorage.getItem("stark-matrix-widgets");
			if (saved) {
				this.widgetToggles = { ...this.widgetToggles, ...JSON.parse(saved) };
			}
		} catch {}
	}

	public activate() {
		this.enabled = true;
		this.createDOM();
		this.initRainStreams();
		this.initMotes();
		this.startRainLoop();
		this.startTelemetryLoop();
	}

	public deactivate() {
		this.enabled = false;
		if (this.animationFrameId !== null) {
			cancelAnimationFrame(this.animationFrameId);
			this.animationFrameId = null;
		}
		if (this.telemetryIntervalId !== null) {
			clearInterval(this.telemetryIntervalId);
			this.telemetryIntervalId = null;
		}
		if (this.container) {
			this.container.remove();
			this.container = null;
		}
	}

	private createDOM() {
		if (this.container) return;

		this.container = document.createElement("div");
		this.container.id = "stark-matrix-hud-root";
		this.container.style.cssText = `
			position: fixed;
			top: 0;
			left: 0;
			width: 100vw;
			height: 100vh;
			z-index: 15;
			pointer-events: auto;
			overflow: hidden;
			background: #010408;
			font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Syne', monospace;
			color: #e2e8f0;
			user-select: none;
		`;

		// 1. Matrix Rain & Particle Canvas
		this.canvas = document.createElement("canvas");
		this.canvas.style.cssText = `
			position: absolute;
			top: 0;
			left: 0;
			width: 100%;
			height: 100%;
			display: block;
			z-index: 1;
		`;
		this.container.appendChild(this.canvas);
		this.ctx = this.canvas.getContext("2d");

		// 2. Scanline & Vignette Overlay
		const scanlines = document.createElement("div");
		scanlines.style.cssText = `
			position: absolute;
			top: 0;
			left: 0;
			width: 100%;
			height: 100%;
			z-index: 2;
			pointer-events: none;
			background: linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.22) 50%),
			            linear-gradient(90deg, rgba(255, 0, 0, 0.02), rgba(0, 255, 0, 0.01), rgba(0, 0, 255, 0.02));
			background-size: 100% 3px, 6px 100%;
			box-shadow: inset 0 0 120px rgba(0, 0, 0, 0.8);
		`;
		this.container.appendChild(scanlines);

		// 3. HUD Telemetry Container
		const hudLayer = document.createElement("div");
		hudLayer.id = "stark-hud-layer";
		hudLayer.style.cssText = `
			position: absolute;
			top: 0;
			left: 0;
			width: 100%;
			height: 100%;
			z-index: 3;
			box-sizing: border-box;
			padding: 40px 32px 76px 32px;
			display: grid;
			grid-template-columns: 350px 1fr 350px;
			grid-template-rows: auto 1fr auto;
			gap: 16px;
			pointer-events: none;
			transition: opacity 0.3s ease;
		`;

		hudLayer.innerHTML = `
			<!-- TOP CONTROL DECK -->
			<div style="grid-column: 1 / -1; display: flex; align-items: center; justify-content: space-between; pointer-events: auto;">
				<div style="display: flex; align-items: center; gap: 14px;">
					<div id="m-indicator" style="width: 10px; height: 10px; border-radius: 50%; background: #00e5ff; box-shadow: 0 0 14px #00e5ff; animation: pulse 2s infinite;"></div>
					<div>
						<div style="display: flex; align-items: center; gap: 8px;">
							<span style="font-size: 13px; font-weight: 900; letter-spacing: 0.14em; color: #fff; text-shadow: 0 0 8px rgba(255,255,255,0.4);">
								STARK-07 CYBERNETIC KERNEL
							</span>
							<span id="hud-fps-badge" style="font-size: 9px; font-weight: 800; padding: 1px 6px; border-radius: 4px; background: rgba(0,229,255,0.18); color: #00e5ff; border: 1px solid rgba(0,229,255,0.4);">
								60 FPS // D3D12
							</span>
						</div>
						<div style="font-size: 10px; opacity: 0.65; letter-spacing: 0.08em; font-family: monospace;">
							ACTIVE MATRIX STREAM // HARDWARE TELEMETRY // REAL-TIME SENSORS
						</div>
					</div>
				</div>

				<!-- THEMES, GLYPH MODES, LAYOUT & CUSTOMIZER -->
				<div style="display: flex; align-items: center; gap: 6px; background: rgba(3, 12, 22, 0.75); padding: 5px 10px; border-radius: 9px; border: 1px solid rgba(255,255,255,0.12); backdrop-filter: blur(10px);">
					<!-- Themes -->
					<button id="theme-cyan-btn" class="hud-top-btn" title="Arc Cyan" style="padding: 4px 8px; border-radius: 5px; font-size: 10px; font-weight: 800; cursor: pointer; border: 1px solid rgba(0,229,255,0.4); background: rgba(0,229,255,0.12); color: #00e5ff;">CYAN</button>
					<button id="theme-emerald-btn" class="hud-top-btn" title="Matrix Emerald" style="padding: 4px 8px; border-radius: 5px; font-size: 10px; font-weight: 800; cursor: pointer; border: 1px solid rgba(0,255,102,0.4); background: rgba(0,255,102,0.12); color: #00ff66;">EMERALD</button>
					<button id="theme-amber-btn" class="hud-top-btn" title="Amber Core" style="padding: 4px 8px; border-radius: 5px; font-size: 10px; font-weight: 800; cursor: pointer; border: 1px solid rgba(255,179,0,0.4); background: rgba(255,179,0,0.12); color: #ffb300;">AMBER</button>
					<button id="theme-crimson-btn" class="hud-top-btn" title="Crimson Alert" style="padding: 4px 8px; border-radius: 5px; font-size: 10px; font-weight: 800; cursor: pointer; border: 1px solid rgba(255,51,85,0.4); background: rgba(255,51,85,0.12); color: #ff3355;">CRIMSON</button>
					<button id="theme-synth-btn" class="hud-top-btn" title="Synthwave" style="padding: 4px 8px; border-radius: 5px; font-size: 10px; font-weight: 800; cursor: pointer; border: 1px solid rgba(232,121,249,0.4); background: rgba(232,121,249,0.12); color: #e879f9;">SYNTH</button>

					<div style="width: 1px; height: 16px; background: rgba(255,255,255,0.15); margin: 0 4px;"></div>

					<!-- Glyph Style Button -->
					<button id="glyph-cycle-btn" class="hud-top-btn" title="Cycle Glyphs: Binary / Matrix Katakana / Hex / Cyber (Key B)" style="padding: 4px 9px; border-radius: 5px; font-size: 10px; font-weight: 800; cursor: pointer; border: 1px solid rgba(255,255,255,0.2); background: rgba(255,255,255,0.06); color: #fff;">
						GLYPH: BINARY
					</button>

					<!-- Layout Button -->
					<button id="layout-cycle-btn" class="hud-top-btn" style="padding: 4px 9px; border-radius: 5px; font-size: 10px; font-weight: 800; cursor: pointer; border: 1px solid rgba(255,255,255,0.2); background: rgba(255,255,255,0.06); color: #fff;">
						LAYOUT: FULL
					</button>

					<!-- Customizer Modal Button ("edited widgets thingie") -->
					<button id="widget-editor-btn" class="hud-top-btn" style="padding: 4px 10px; border-radius: 5px; font-size: 10px; font-weight: 800; cursor: pointer; border: 1px solid rgba(0,229,255,0.4); background: rgba(0,229,255,0.14); color: #38bdf8;">
						⚙ EDIT WIDGETS
					</button>
				</div>
			</div>

			<!-- LEFT COLUMN: HARDWARE & ENGINE VITALS -->
			<div id="hud-col-left" style="display: flex; flex-direction: column; gap: 14px; pointer-events: auto;">
				<!-- CPU PROCESSOR WIDGET -->
				<div id="w-cpu" class="hud-panel" style="background: rgba(3, 14, 26, 0.85); border: 1px solid rgba(0, 229, 255, 0.35); border-radius: 12px; padding: 16px; backdrop-filter: blur(14px); position: relative; overflow: hidden;">
					<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
						<div style="display: flex; align-items: center; gap: 6px;">
							<div class="hud-corner-tag"></div>
							<span style="font-size: 11px; font-weight: 800; letter-spacing: 0.12em; color: #94a3b8;">PROCESSOR UNIT</span>
						</div>
						<span id="hud-cpu-badge" style="font-size: 9px; font-weight: 800; padding: 2px 6px; border-radius: 4px; background: rgba(0,229,255,0.15); color: #00e5ff;">16 THREADS // x86_64</span>
					</div>

					<div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
						<div style="display: flex; align-items: baseline; gap: 6px;">
							<div id="hud-cpu-val" style="font-size: 34px; font-weight: 900; color: #fff; font-family: monospace; text-shadow: 0 0 10px rgba(0,229,255,0.4);">24%</div>
							<div style="font-size: 10px; opacity: 0.6; letter-spacing: 0.05em;">SYSTEM LOAD</div>
						</div>
						<!-- Radial Ring Mini -->
						<div style="width: 44px; height: 44px; position: relative;">
							<svg width="44" height="44" viewBox="0 0 44 44">
								<circle cx="22" cy="22" r="18" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="4"></circle>
								<circle id="hud-cpu-ring" cx="22" cy="22" r="18" fill="none" stroke="#00e5ff" stroke-width="4" stroke-dasharray="113" stroke-dashoffset="86" stroke-linecap="round" transform="rotate(-90 22 22)" style="transition: stroke-dashoffset 0.5s ease;"></circle>
							</svg>
						</div>
					</div>

					<!-- Real-time CPU Area Chart -->
					<canvas id="hud-cpu-chart" width="310" height="42" style="width: 100%; height: 42px; border-radius: 4px; display: block;"></canvas>

					<!-- 16-Thread Micro Grid -->
					<div style="margin-top: 8px;">
						<div style="display: flex; justify-content: space-between; font-size: 9px; opacity: 0.55; margin-bottom: 4px; font-family: monospace;">
							<span>THREAD WORKLOAD MATRIX</span>
							<span>3.60 GHz // 42°C NOMINAL</span>
						</div>
						<div id="hud-thread-grid" style="display: grid; grid-template-columns: repeat(16, 1fr); gap: 3px; height: 12px;"></div>
					</div>
				</div>

				<!-- RAM / PHYSICAL MEMORY WIDGET -->
				<div id="w-ram" class="hud-panel" style="background: rgba(3, 14, 26, 0.85); border: 1px solid rgba(0, 229, 255, 0.35); border-radius: 12px; padding: 16px; backdrop-filter: blur(14px);">
					<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
						<span style="font-size: 11px; font-weight: 800; letter-spacing: 0.12em; color: #94a3b8;">PHYSICAL MEMORY</span>
						<span id="hud-ram-badge" style="font-size: 9px; font-weight: 800; padding: 2px 6px; border-radius: 4px; background: rgba(0,229,255,0.15); color: #00e5ff;">DDR5 ENCLAVE</span>
					</div>

					<div style="display: flex; align-items: baseline; justify-content: space-between;">
						<div style="display: flex; align-items: baseline; gap: 6px;">
							<div id="hud-ram-val" style="font-size: 32px; font-weight: 900; color: #fff; font-family: monospace;">46%</div>
							<div style="font-size: 10px; opacity: 0.6;">COMMITTED</div>
						</div>
						<div id="hud-ram-gb" style="font-size: 12px; font-weight: 700; color: #38bdf8; font-family: monospace;">7.4 GB / 16.0 GB</div>
					</div>

					<!-- Segmented RAM Chips Visualizer -->
					<div style="margin-top: 8px;">
						<div id="hud-ram-chips" style="display: grid; grid-template-columns: repeat(16, 1fr); gap: 3px; height: 10px; margin-bottom: 6px;"></div>
					</div>

					<div style="display: flex; justify-content: space-between; font-size: 9px; opacity: 0.55; font-family: monospace;">
						<span>PAGE CACHE: 3.2 GB</span>
						<span>PRESSURE: LOW // CLEAN</span>
					</div>
				</div>

				<!-- GPU & COMPUTE ENGINE WIDGET -->
				<div id="w-gpu" class="hud-panel" style="background: rgba(3, 14, 26, 0.85); border: 1px solid rgba(0, 229, 255, 0.35); border-radius: 12px; padding: 14px; backdrop-filter: blur(14px);">
					<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
						<span style="font-size: 11px; font-weight: 800; letter-spacing: 0.12em; color: #94a3b8;">GPU COMPUTE PIPELINE</span>
						<span style="font-size: 9px; opacity: 0.7; font-family: monospace;">DIRECT3D 12</span>
					</div>
					<div style="display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 6px;">
						<div style="display: flex; align-items: baseline; gap: 6px;">
							<div id="hud-gpu-val" style="font-size: 26px; font-weight: 900; color: #fff; font-family: monospace;">18%</div>
							<div style="font-size: 9px; opacity: 0.6;">RENDER LOAD</div>
						</div>
						<div id="hud-vram-val" style="font-size: 11px; font-weight: 700; color: #38bdf8; font-family: monospace;">2.4 GB / 8.0 GB VRAM</div>
					</div>
					<div style="width: 100%; height: 6px; background: rgba(255,255,255,0.08); border-radius: 3px; overflow: hidden;">
						<div id="hud-gpu-bar" style="width: 30%; height: 100%; background: linear-gradient(90deg, #00e5ff, #a855f7);"></div>
					</div>
				</div>

				<!-- STORAGE & DISK VOLUME WIDGET -->
				<div id="w-disk" class="hud-panel" style="background: rgba(3, 14, 26, 0.85); border: 1px solid rgba(0, 229, 255, 0.35); border-radius: 12px; padding: 14px; backdrop-filter: blur(14px);">
					<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
						<span style="font-size: 11px; font-weight: 800; letter-spacing: 0.12em; color: #94a3b8;">STORAGE VOLUME</span>
						<span style="font-size: 9px; opacity: 0.7; font-family: monospace;">NVME GEN4 x4</span>
					</div>
					<div style="display: flex; justify-content: space-between; font-size: 12px; font-weight: 700; margin-bottom: 6px;">
						<span>C: / SYSTEM OS</span>
						<span id="hud-disk-val" style="color: #38bdf8; font-family: monospace;">380 GB FREE</span>
					</div>
					<div style="width: 100%; height: 6px; background: rgba(255,255,255,0.08); border-radius: 3px; overflow: hidden; margin-bottom: 6px;">
						<div id="hud-disk-bar" style="width: 65%; height: 100%; background: linear-gradient(90deg, #00e5ff, #38bdf8);"></div>
					</div>
					<div style="display: flex; justify-content: space-between; font-size: 9px; opacity: 0.55; font-family: monospace;">
						<span style="display: flex; align-items: center; gap: 4px;">
							<span style="width: 6px; height: 6px; border-radius: 50%; background: #4ade80; display: inline-block;"></span>
							I/O READ/WRITE OK
						</span>
						<span>SMART 100% HEALTHY</span>
					</div>
				</div>
			</div>

			<!-- CENTER WORKSPACE: HOLOGRAPHIC CHRONOMETER & RADAR -->
			<div id="hud-col-center" style="display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; pointer-events: none;">
				<div id="w-reticle" style="position: relative; width: 280px; height: 280px; display: flex; align-items: center; justify-content: center;">
					<!-- Outer rotating tick ring -->
					<div id="hud-reticle-outer" style="position: absolute; width: 100%; height: 100%; border: 2px dashed rgba(0, 229, 255, 0.35); border-radius: 50%; animation: spin 30s linear infinite;"></div>
					<!-- Inner counter-rotating ring -->
					<div id="hud-reticle-inner" style="position: absolute; width: 82%; height: 82%; border: 1px dotted rgba(0, 229, 255, 0.3); border-radius: 50%; animation: spin-reverse 20s linear infinite;"></div>
					<!-- Concentric circle with crosshair ticks -->
					<div style="position: absolute; width: 68%; height: 68%; border: 1px solid rgba(0, 229, 255, 0.18); border-radius: 50%;"></div>
					<!-- Compass marks -->
					<div style="position: absolute; top: 4px; font-size: 8px; font-weight: 800; color: rgba(0,229,255,0.7); font-family: monospace;">000° N</div>
					<div style="position: absolute; bottom: 4px; font-size: 8px; font-weight: 800; color: rgba(0,229,255,0.7); font-family: monospace;">180° S</div>
					<div style="position: absolute; left: 4px; font-size: 8px; font-weight: 800; color: rgba(0,229,255,0.7); font-family: monospace;">270° W</div>
					<div style="position: absolute; right: 4px; font-size: 8px; font-weight: 800; color: rgba(0,229,255,0.7); font-family: monospace;">090° E</div>

					<div style="text-align: center; z-index: 2;">
						<div id="hud-clock" style="font-size: 44px; font-weight: 900; letter-spacing: 0.05em; color: #fff; text-shadow: 0 0 24px rgba(0, 229, 255, 0.7); font-family: monospace;">20:00:00</div>
						<div id="hud-ms" style="font-size: 14px; font-weight: 700; color: #38bdf8; font-family: monospace; margin-top: -2px;">.000</div>
						<div id="hud-date" style="font-size: 11px; font-weight: 800; opacity: 0.85; letter-spacing: 0.14em; margin-top: 6px; font-family: monospace;">19-NOV-2026 // THURSDAY</div>
						<div id="hud-uptime" style="font-size: 10px; opacity: 0.6; font-family: monospace; margin-top: 4px;">UPTIME: 00:00:00</div>

						<!-- Audio / Frequency Spectrum Bar Wave -->
						<div id="w-wave" style="margin-top: 10px; display: flex; align-items: center; justify-content: center; gap: 3px; height: 16px;">
							<div id="hud-spectrum-bars" style="display: flex; align-items: flex-end; gap: 2px; height: 14px;"></div>
						</div>
					</div>
				</div>
			</div>

			<!-- RIGHT COLUMN: COMMS, POWER & ATMOSPHERE -->
			<div id="hud-col-right" style="display: flex; flex-direction: column; gap: 14px; pointer-events: auto;">
				<!-- NETWORK COMMS RADAR -->
				<div id="w-net" class="hud-panel" style="background: rgba(3, 14, 26, 0.85); border: 1px solid rgba(0, 229, 255, 0.35); border-radius: 12px; padding: 16px; backdrop-filter: blur(14px);">
					<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
						<span style="font-size: 11px; font-weight: 800; letter-spacing: 0.12em; color: #94a3b8;">NETWORK COMMS</span>
						<span style="font-size: 9px; font-weight: 800; padding: 2px 6px; border-radius: 4px; background: rgba(34,197,94,0.18); color: #4ade80; border: 1px solid rgba(34,197,94,0.4);">LINK ONLINE</span>
					</div>

					<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 8px;">
						<div>
							<div style="font-size: 9px; opacity: 0.6; font-family: monospace;">INCOMING / RX</div>
							<div id="hud-net-rx" style="font-size: 19px; font-weight: 900; color: #38bdf8; font-family: monospace;">↓ 1.4 MB/s</div>
						</div>
						<div>
							<div style="font-size: 9px; opacity: 0.6; font-family: monospace;">OUTGOING / TX</div>
							<div id="hud-net-tx" style="font-size: 19px; font-weight: 900; color: #4ade80; font-family: monospace;">↑ 320 KB/s</div>
						</div>
					</div>

					<!-- Real-time Network Histogram Bars -->
					<div id="hud-net-bars" style="display: grid; grid-template-columns: repeat(24, 1fr); gap: 2px; height: 16px; align-items: end; margin-bottom: 6px;"></div>

					<div style="display: flex; justify-content: space-between; font-size: 9px; opacity: 0.55; font-family: monospace;">
						<span>LATENCY: 12ms // TLS 1.3</span>
						<span>PACKET LOSS: 0.0%</span>
					</div>
				</div>

				<!-- POWER / ARC REACTOR CELL -->
				<div id="w-power" class="hud-panel" style="background: rgba(3, 14, 26, 0.85); border: 1px solid rgba(0, 229, 255, 0.35); border-radius: 12px; padding: 16px; backdrop-filter: blur(14px);">
					<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
						<span style="font-size: 11px; font-weight: 800; letter-spacing: 0.12em; color: #94a3b8;">POWER SUBSYSTEM</span>
						<span id="hud-bat-status" style="font-size: 9px; color: #38bdf8; font-weight: 700;">AC ADAPTER ONLINE</span>
					</div>

					<div style="display: flex; align-items: baseline; gap: 8px;">
						<div id="hud-bat-val" style="font-size: 32px; font-weight: 900; color: #fff; font-family: monospace;">85%</div>
						<div style="font-size: 10px; opacity: 0.7;">PLASMA CELL CHARGED</div>
					</div>

					<!-- Segmented Battery Level Bar -->
					<div style="width: 100%; height: 7px; background: rgba(255,255,255,0.08); border-radius: 4px; overflow: hidden; margin-top: 8px;">
						<div id="hud-bat-bar" style="width: 85%; height: 100%; background: linear-gradient(90deg, #22c55e, #4ade80);"></div>
					</div>

					<div style="display: flex; justify-content: space-between; font-size: 9px; opacity: 0.55; font-family: monospace; margin-top: 6px;">
						<span>POWER DRAW: 45W</span>
						<span>EFFICIENCY: 98.4%</span>
					</div>
				</div>

				<!-- ATMOSPHERIC & PLANETARY SCANNER -->
				<div id="w-weather" class="hud-panel" style="background: rgba(3, 14, 26, 0.85); border: 1px solid rgba(0, 229, 255, 0.35); border-radius: 12px; padding: 16px; backdrop-filter: blur(14px);">
					<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
						<span style="font-size: 11px; font-weight: 800; letter-spacing: 0.12em; color: #94a3b8;">ATMOSPHERIC SCANNER</span>
						<span style="font-size: 9px; opacity: 0.75; font-weight: 700;">BENGALURU, IN</span>
					</div>
					<div style="display: flex; align-items: baseline; justify-content: space-between;">
						<div style="font-size: 28px; font-weight: 900; color: #fff; font-family: monospace;">27°C</div>
						<div style="font-size: 11px; opacity: 0.85; text-align: right; font-weight: 700;">
							CLEAR SKY<br>
							<span style="font-size: 9px; opacity: 0.55; font-family: monospace;">58% HUMIDITY // WIND 8 KM/H</span>
						</div>
					</div>
				</div>
			</div>

			<!-- BOTTOM DIAGNOSTIC LOG DECK & INTERACTIVE TERMINAL PROMPT -->
			<div id="w-terminal" style="grid-column: 1 / -1; display: flex; align-items: center; justify-content: space-between; pointer-events: auto; background: rgba(2, 8, 16, 0.88); border: 1px solid rgba(0, 229, 255, 0.28); border-radius: 10px; padding: 8px 16px; backdrop-filter: blur(12px); gap: 14px;">
				<div style="display: flex; align-items: center; gap: 10px; flex: 1; overflow: hidden;">
					<span style="font-size: 10px; font-weight: 900; color: #38bdf8; font-family: monospace; white-space: nowrap;">STARK_OPS &gt;_</span>
					<div id="hud-log-stream" style="font-size: 11px; font-family: monospace; opacity: 0.9; letter-spacing: 0.04em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #bae6fd; flex: 1;">
						[TELEMETRY] Multi-layer matrix stream active // Tracking 3D coordinates
					</div>
					<!-- Interactive Command Line -->
					<input id="hud-terminal-input" type="text" placeholder="Type command (help, theme, mode, clear)..." style="background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.15); border-radius: 5px; padding: 3px 8px; color: #fff; font-size: 10px; font-family: monospace; width: 230px; outline: none;">
				</div>

				<div style="display: flex; align-items: center; gap: 10px;">
					<span style="font-size: 10px; font-weight: 800; opacity: 0.65; letter-spacing: 0.08em; font-family: monospace;">
						[V] SWITCH MODE &nbsp;|&nbsp; [H] TOGGLE HUD &nbsp;|&nbsp; [B] GLYPHS
					</span>
				</div>
			</div>
		`;

		// 4. WIDGET CUSTOMIZER MODAL ("an edited widgets thingie")
		const editorModal = document.createElement("div");
		editorModal.id = "stark-widget-editor-modal";
		editorModal.style.cssText = `
			position: absolute;
			top: 75px;
			right: 32px;
			width: 340px;
			background: rgba(3, 16, 28, 0.96);
			border: 1px solid rgba(0, 229, 255, 0.45);
			border-radius: 12px;
			box-shadow: 0 10px 30px rgba(0,0,0,0.85), 0 0 25px rgba(0,229,255,0.25);
			backdrop-filter: blur(20px);
			padding: 18px;
			z-index: 10;
			display: none;
			pointer-events: auto;
			font-family: inherit;
		`;

		editorModal.innerHTML = `
			<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; border-bottom: 1px solid rgba(255,255,255,0.12); padding-bottom: 8px;">
				<div style="font-size: 12px; font-weight: 900; letter-spacing: 0.12em; color: #fff; display: flex; align-items: center; gap: 6px;">
					<span>⚙ WIDGET CUSTOMIZER</span>
				</div>
				<button id="editor-close-btn" style="background: none; border: none; color: #94a3b8; font-size: 14px; cursor: pointer;">✕</button>
			</div>

			<div style="font-size: 10px; opacity: 0.7; margin-bottom: 12px;">Toggle system specs & configure your live matrix background:</div>

			<!-- Widget Checkboxes -->
			<div style="display: flex; flex-direction: column; gap: 7px; margin-bottom: 14px;">
				<label style="display: flex; align-items: center; justify-content: space-between; font-size: 11px; cursor: pointer;">
					<span>CPU Unit & Load Chart</span>
					<input type="checkbox" id="chk-w-cpu" ${this.widgetToggles.cpu ? "checked" : ""}>
				</label>
				<label style="display: flex; align-items: center; justify-content: space-between; font-size: 11px; cursor: pointer;">
					<span>Physical Memory (RAM Bank)</span>
					<input type="checkbox" id="chk-w-ram" ${this.widgetToggles.ram ? "checked" : ""}>
				</label>
				<label style="display: flex; align-items: center; justify-content: space-between; font-size: 11px; cursor: pointer;">
					<span>GPU Compute & VRAM</span>
					<input type="checkbox" id="chk-w-gpu" ${this.widgetToggles.gpu ? "checked" : ""}>
				</label>
				<label style="display: flex; align-items: center; justify-content: space-between; font-size: 11px; cursor: pointer;">
					<span>Storage Volumes (Disks)</span>
					<input type="checkbox" id="chk-w-disk" ${this.widgetToggles.disk ? "checked" : ""}>
				</label>
				<label style="display: flex; align-items: center; justify-content: space-between; font-size: 11px; cursor: pointer;">
					<span>Network Comms & Radar</span>
					<input type="checkbox" id="chk-w-net" ${this.widgetToggles.net ? "checked" : ""}>
				</label>
				<label style="display: flex; align-items: center; justify-content: space-between; font-size: 11px; cursor: pointer;">
					<span>Arc Reactor Power Cell</span>
					<input type="checkbox" id="chk-w-power" ${this.widgetToggles.power ? "checked" : ""}>
				</label>
				<label style="display: flex; align-items: center; justify-content: space-between; font-size: 11px; cursor: pointer;">
					<span>Atmospheric Weather</span>
					<input type="checkbox" id="chk-w-weather" ${this.widgetToggles.weather ? "checked" : ""}>
				</label>
				<label style="display: flex; align-items: center; justify-content: space-between; font-size: 11px; cursor: pointer;">
					<span>Centerpiece Clock & Radar</span>
					<input type="checkbox" id="chk-w-reticle" ${this.widgetToggles.reticle ? "checked" : ""}>
				</label>
				<label style="display: flex; align-items: center; justify-content: space-between; font-size: 11px; cursor: pointer;">
					<span>Frequency Audio Wave</span>
					<input type="checkbox" id="chk-w-wave" ${this.widgetToggles.wave ? "checked" : ""}>
				</label>
				<label style="display: flex; align-items: center; justify-content: space-between; font-size: 11px; cursor: pointer;">
					<span>Bottom Terminal & Log Deck</span>
					<input type="checkbox" id="chk-w-terminal" ${this.widgetToggles.terminal ? "checked" : ""}>
				</label>
			</div>

			<!-- Rain Glyphs & Visual Effects -->
			<div style="border-top: 1px solid rgba(255,255,255,0.1); padding-top: 10px; margin-bottom: 10px;">
				<div style="font-size: 10px; font-weight: 800; opacity: 0.75; margin-bottom: 6px;">STREAM GLYPH STYLE:</div>
				<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 5px; margin-bottom: 10px;">
					<button id="glyph-btn-binary" style="padding: 4px; font-size: 9px; font-weight: 700; border-radius: 4px; border: 1px solid rgba(255,255,255,0.2); background: rgba(255,255,255,0.08); color: #fff; cursor: pointer;">01 BINARY</button>
					<button id="glyph-btn-matrix" style="padding: 4px; font-size: 9px; font-weight: 700; border-radius: 4px; border: 1px solid rgba(255,255,255,0.2); background: rgba(255,255,255,0.08); color: #fff; cursor: pointer;">KATAKANA</button>
					<button id="glyph-btn-hex" style="padding: 4px; font-size: 9px; font-weight: 700; border-radius: 4px; border: 1px solid rgba(255,255,255,0.2); background: rgba(255,255,255,0.08); color: #fff; cursor: pointer;">0x HEX</button>
					<button id="glyph-btn-cyber" style="padding: 4px; font-size: 9px; font-weight: 700; border-radius: 4px; border: 1px solid rgba(255,255,255,0.2); background: rgba(255,255,255,0.08); color: #fff; cursor: pointer;">⚡ RUNES</button>
				</div>

				<div style="font-size: 10px; font-weight: 800; opacity: 0.75; margin-bottom: 6px;">STREAM DENSITY:</div>
				<div style="display: flex; gap: 5px; margin-bottom: 10px;">
					<button id="density-dense-btn" style="flex: 1; padding: 4px; font-size: 9px; font-weight: 700; border-radius: 4px; border: 1px solid rgba(255,255,255,0.2); background: rgba(255,255,255,0.08); color: #fff; cursor: pointer;">DENSE</button>
					<button id="density-balanced-btn" style="flex: 1; padding: 4px; font-size: 9px; font-weight: 700; border-radius: 4px; border: 1px solid rgba(255,255,255,0.2); background: rgba(255,255,255,0.08); color: #fff; cursor: pointer;">BALANCED</button>
					<button id="density-sparse-btn" style="flex: 1; padding: 4px; font-size: 9px; font-weight: 700; border-radius: 4px; border: 1px solid rgba(255,255,255,0.2); background: rgba(255,255,255,0.08); color: #fff; cursor: pointer;">SPARSE</button>
				</div>

				<div style="font-size: 10px; font-weight: 800; opacity: 0.75; margin-bottom: 6px;">RAIN SPEED:</div>
				<div style="display: flex; gap: 5px; margin-bottom: 10px;">
					<button id="speed-steady-btn" style="flex: 1; padding: 4px; font-size: 9px; font-weight: 700; border-radius: 4px; border: 1px solid rgba(255,255,255,0.2); background: rgba(255,255,255,0.08); color: #fff; cursor: pointer;">STEADY</button>
					<button id="speed-normal-btn" style="flex: 1; padding: 4px; font-size: 9px; font-weight: 700; border-radius: 4px; border: 1px solid rgba(255,255,255,0.2); background: rgba(255,255,255,0.08); color: #fff; cursor: pointer;">NORMAL</button>
					<button id="speed-fast-btn" style="flex: 1; padding: 4px; font-size: 9px; font-weight: 700; border-radius: 4px; border: 1px solid rgba(255,255,255,0.2); background: rgba(255,255,255,0.08); color: #fff; cursor: pointer;">HYPER</button>
				</div>

				<div style="display: flex; justify-content: space-between; align-items: center; font-size: 11px;">
					<span>3D Perspective Grid Floor</span>
					<input type="checkbox" id="chk-opt-grid" ${this.showGrid ? "checked" : ""}>
				</div>
				<div style="display: flex; justify-content: space-between; align-items: center; font-size: 11px; margin-top: 6px;">
					<span>Ascending Cyber Sparks</span>
					<input type="checkbox" id="chk-opt-motes" ${this.showMotes ? "checked" : ""}>
				</div>
			</div>
		`;
		this.container.appendChild(editorModal);

		this.container.appendChild(hudLayer);
		document.body.appendChild(this.container);

		this.attachUIEvents();
		this.applyTheme(this.theme);
		this.applyGlyphMode(this.glyphMode);
		this.applyLayout(this.layout);
		this.applyWidgetToggles();
	}

	private attachUIEvents() {
		// Theme Buttons
		document.getElementById("theme-cyan-btn")?.addEventListener("click", () => this.applyTheme("cyan"));
		document.getElementById("theme-emerald-btn")?.addEventListener("click", () => this.applyTheme("emerald"));
		document.getElementById("theme-amber-btn")?.addEventListener("click", () => this.applyTheme("amber"));
		document.getElementById("theme-crimson-btn")?.addEventListener("click", () => this.applyTheme("crimson"));
		document.getElementById("theme-synth-btn")?.addEventListener("click", () => this.applyTheme("synth"));

		// Glyph Cycle Button
		const glyphBtn = document.getElementById("glyph-cycle-btn");
		glyphBtn?.addEventListener("click", () => {
			const order: GlyphMode[] = ["binary", "matrix", "hex", "cyber"];
			const idx = order.indexOf(this.glyphMode);
			const next = order[(idx + 1) % order.length];
			this.applyGlyphMode(next);
		});

		// Glyph Buttons in Modal
		document.getElementById("glyph-btn-binary")?.addEventListener("click", () => this.applyGlyphMode("binary"));
		document.getElementById("glyph-btn-matrix")?.addEventListener("click", () => this.applyGlyphMode("matrix"));
		document.getElementById("glyph-btn-hex")?.addEventListener("click", () => this.applyGlyphMode("hex"));
		document.getElementById("glyph-btn-cyber")?.addEventListener("click", () => this.applyGlyphMode("cyber"));

		// Layout Toggle Button
		const layoutBtn = document.getElementById("layout-cycle-btn");
		layoutBtn?.addEventListener("click", () => {
			if (this.layout === "full") this.applyLayout("minimal");
			else if (this.layout === "minimal") this.applyLayout("stream");
			else this.applyLayout("full");
		});

		// Customizer Modal
		const editorBtn = document.getElementById("widget-editor-btn");
		const editorModal = document.getElementById("stark-widget-editor-modal");
		const editorClose = document.getElementById("editor-close-btn");

		editorBtn?.addEventListener("click", () => {
			this.isEditorOpen = !this.isEditorOpen;
			if (editorModal) editorModal.style.display = this.isEditorOpen ? "block" : "none";
		});

		editorClose?.addEventListener("click", () => {
			this.isEditorOpen = false;
			if (editorModal) editorModal.style.display = "none";
		});

		// Widget Checkboxes
		const bindCheckbox = (id: string, key: keyof typeof this.widgetToggles) => {
			const el = document.getElementById(id) as HTMLInputElement | null;
			el?.addEventListener("change", () => {
				this.widgetToggles[key] = el.checked;
				localStorage.setItem("stark-matrix-widgets", JSON.stringify(this.widgetToggles));
				this.applyWidgetToggles();
			});
		};

		bindCheckbox("chk-w-cpu", "cpu");
		bindCheckbox("chk-w-ram", "ram");
		bindCheckbox("chk-w-gpu", "gpu");
		bindCheckbox("chk-w-disk", "disk");
		bindCheckbox("chk-w-net", "net");
		bindCheckbox("chk-w-power", "power");
		bindCheckbox("chk-w-weather", "weather");
		bindCheckbox("chk-w-reticle", "reticle");
		bindCheckbox("chk-w-wave", "wave");
		bindCheckbox("chk-w-terminal", "terminal");

		// Density Buttons
		document.getElementById("density-dense-btn")?.addEventListener("click", () => {
			this.density = "dense";
			localStorage.setItem("stark-matrix-density", "dense");
			this.initRainStreams();
		});
		document.getElementById("density-balanced-btn")?.addEventListener("click", () => {
			this.density = "balanced";
			localStorage.setItem("stark-matrix-density", "balanced");
			this.initRainStreams();
		});
		document.getElementById("density-sparse-btn")?.addEventListener("click", () => {
			this.density = "sparse";
			localStorage.setItem("stark-matrix-density", "sparse");
			this.initRainStreams();
		});

		// Speed Buttons
		document.getElementById("speed-steady-btn")?.addEventListener("click", () => {
			this.rainSpeed = "steady";
			localStorage.setItem("stark-matrix-speed", "steady");
		});
		document.getElementById("speed-normal-btn")?.addEventListener("click", () => {
			this.rainSpeed = "normal";
			localStorage.setItem("stark-matrix-speed", "normal");
		});
		document.getElementById("speed-fast-btn")?.addEventListener("click", () => {
			this.rainSpeed = "fast";
			localStorage.setItem("stark-matrix-speed", "fast");
		});

		// Visual Toggles
		const gridChk = document.getElementById("chk-opt-grid") as HTMLInputElement | null;
		gridChk?.addEventListener("change", () => {
			this.showGrid = gridChk.checked;
			localStorage.setItem("stark-matrix-grid", String(this.showGrid));
		});

		const motesChk = document.getElementById("chk-opt-motes") as HTMLInputElement | null;
		motesChk?.addEventListener("change", () => {
			this.showMotes = motesChk.checked;
			localStorage.setItem("stark-matrix-motes", String(this.showMotes));
		});

		// Interactive Terminal Input
		const termInput = document.getElementById("hud-terminal-input") as HTMLInputElement | null;
		termInput?.addEventListener("keydown", (e) => {
			if (e.key === "Enter" && termInput.value.trim()) {
				const cmd = termInput.value.trim().toLowerCase();
				termInput.value = "";
				this.executeTerminalCommand(cmd);
			}
		});

		// Mouse Interactivity: Light field & Shockwaves
		window.addEventListener("pointermove", (e) => {
			this.mouseX = e.clientX;
			this.mouseY = e.clientY;
		});

		window.addEventListener("pointerdown", (e) => {
			this.ripples.push({
				x: e.clientX,
				y: e.clientY,
				radius: 12,
				maxRadius: 320,
				alpha: 1.0
			});
			if (this.ripples.length > 6) this.ripples.shift();
		});

		// Global Hotkeys (V: cycle mode, H: toggle HUD, B: cycle glyphs, E: edit widgets)
		window.addEventListener("keydown", (e) => {
			if (e.target instanceof HTMLInputElement) return;

			if (e.code === "KeyH" && !e.repeat) {
				this.toggleHUD();
			} else if (e.code === "KeyB" && !e.repeat) {
				const order: GlyphMode[] = ["binary", "matrix", "hex", "cyber"];
				const idx = order.indexOf(this.glyphMode);
				const next = order[(idx + 1) % order.length];
				this.applyGlyphMode(next);
			} else if (e.code === "KeyE" && !e.repeat) {
				this.isEditorOpen = !this.isEditorOpen;
				if (editorModal) editorModal.style.display = this.isEditorOpen ? "block" : "none";
			}
		});

		window.addEventListener("resize", () => {
			this.initRainStreams();
			this.initMotes();
		});
	}

	public toggleHUD() {
		this.hudVisible = !this.hudVisible;
		const hudLayer = document.getElementById("stark-hud-layer");
		if (hudLayer) {
			hudLayer.style.opacity = this.hudVisible ? "1" : "0";
			hudLayer.style.pointerEvents = this.hudVisible ? "auto" : "none";
		}
	}

	public applyTheme(theme: MatrixTheme) {
		this.theme = theme;
		localStorage.setItem("stark-matrix-theme", theme);
		const t = THEMES[theme];

		const indicator = document.getElementById("m-indicator");
		if (indicator) {
			indicator.style.background = t.accent;
			indicator.style.boxShadow = `0 0 14px ${t.accent}`;
		}

		const reticleOut = document.getElementById("hud-reticle-outer");
		if (reticleOut) reticleOut.style.borderColor = t.border;
		const reticleIn = document.getElementById("hud-reticle-inner");
		if (reticleIn) reticleIn.style.borderColor = t.border;

		const panels = document.querySelectorAll<HTMLElement>(".hud-panel");
		panels.forEach((p) => {
			p.style.borderColor = t.border;
			p.style.background = t.panelBg;
		});

		const badges = [
			document.getElementById("hud-cpu-badge"),
			document.getElementById("hud-ram-badge"),
			document.getElementById("hud-fps-badge")
		];
		badges.forEach((b) => {
			if (b) {
				b.style.color = t.accent;
				b.style.background = t.border;
			}
		});

		const ring = document.getElementById("hud-cpu-ring");
		if (ring) ring.setAttribute("stroke", t.accent);

		const clock = document.getElementById("hud-clock");
		if (clock) clock.style.textShadow = `0 0 24px ${t.accent}`;
	}

	public applyGlyphMode(mode: GlyphMode) {
		this.glyphMode = mode;
		localStorage.setItem("stark-matrix-glyph-mode", mode);
		const btn = document.getElementById("glyph-cycle-btn");
		if (btn) btn.textContent = `GLYPH: ${mode.toUpperCase()}`;
		this.initRainStreams();
	}

	public applyLayout(layout: MatrixLayout) {
		this.layout = layout;
		localStorage.setItem("stark-matrix-layout", layout);

		const btn = document.getElementById("layout-cycle-btn");
		if (btn) btn.textContent = `LAYOUT: ${layout.toUpperCase()}`;

		const left = document.getElementById("hud-col-left");
		const right = document.getElementById("hud-col-right");
		const center = document.getElementById("hud-col-center");
		const term = document.getElementById("w-terminal");

		if (layout === "full") {
			if (left) left.style.display = "flex";
			if (right) right.style.display = "flex";
			if (center) center.style.display = "flex";
			if (term) term.style.display = "flex";
		} else if (layout === "minimal") {
			if (left) left.style.display = "none";
			if (right) right.style.display = "none";
			if (center) center.style.display = "flex";
			if (term) term.style.display = "none";
		} else if (layout === "stream") {
			if (left) left.style.display = "none";
			if (right) right.style.display = "none";
			if (center) center.style.display = "none";
			if (term) term.style.display = "none";
		}
	}

	public applyWidgetToggles() {
		const toggleEl = (id: string, visible: boolean) => {
			const el = document.getElementById(id);
			if (el) el.style.display = visible ? "" : "none";
		};

		if (this.layout === "full") {
			toggleEl("w-cpu", this.widgetToggles.cpu);
			toggleEl("w-ram", this.widgetToggles.ram);
			toggleEl("w-gpu", this.widgetToggles.gpu);
			toggleEl("w-disk", this.widgetToggles.disk);
			toggleEl("w-net", this.widgetToggles.net);
			toggleEl("w-power", this.widgetToggles.power);
			toggleEl("w-weather", this.widgetToggles.weather);
			toggleEl("w-reticle", this.widgetToggles.reticle);
			toggleEl("w-wave", this.widgetToggles.wave);
			toggleEl("w-terminal", this.widgetToggles.terminal);
		}
	}

	private executeTerminalCommand(cmd: string) {
		const logEl = document.getElementById("hud-log-stream");
		if (!logEl) return;

		const parts = cmd.split(" ");
		const action = parts[0];
		const arg = parts[1];

		if (action === "help") {
			logEl.textContent = "COMMANDS: theme <cyan|emerald|amber|crimson|synth>, mode <binary|matrix|hex|cyber>, layout <full|minimal|stream>, clear, specs";
		} else if (action === "theme" && arg) {
			if (arg in THEMES) {
				this.applyTheme(arg as MatrixTheme);
				logEl.textContent = `[SYSTEM] Theme switched to: ${THEMES[arg as MatrixTheme].name.toUpperCase()}`;
			}
		} else if (action === "mode" && arg) {
			if (arg in GLYPH_SETS) {
				this.applyGlyphMode(arg as GlyphMode);
				logEl.textContent = `[SYSTEM] Stream glyphs set to: ${arg.toUpperCase()}`;
			}
		} else if (action === "layout" && arg) {
			if (arg === "full" || arg === "minimal" || arg === "stream") {
				this.applyLayout(arg);
				logEl.textContent = `[SYSTEM] Layout layout mode: ${arg.toUpperCase()}`;
			}
		} else if (action === "clear") {
			logEl.textContent = "[SYSTEM] Diagnostic stream buffer cleared";
		} else if (action === "specs") {
			logEl.textContent = `[SPECS] CPU: ${this.cpuPercent}% | RAM: ${this.usedRamGb}/${this.totalRamGb} GB | DISK: ${this.diskFreeGb} GB FREE | FPS: ${this.fps}`;
		} else {
			logEl.textContent = `[SYNTAX ERROR] Unknown command: "${cmd}". Type "help" for cyber command list.`;
		}
	}

	private initRainStreams() {
		if (!this.canvas) return;
		this.canvas.width = window.innerWidth;
		this.canvas.height = window.innerHeight;

		const baseStep = this.density === "dense" ? 14 : this.density === "balanced" ? 20 : 28;
		const cols = Math.floor(this.canvas.width / baseStep);
		this.streams = [];

		for (let i = 0; i < cols; i++) {
			const layer = i % 3; // 0 = far, 1 = mid, 2 = fore
			const fontSize = layer === 0 ? 10 : layer === 1 ? 14 : 17;
			const speedMult = this.rainSpeed === "fast" ? 1.6 : this.rainSpeed === "steady" ? 0.75 : 1.0;
			const speed = (layer === 0 ? 0.9 + Math.random() * 0.8 : layer === 1 ? 1.8 + Math.random() * 1.5 : 2.8 + Math.random() * 2.2) * speedMult;
			const length = 12 + Math.floor(Math.random() * 26);

			const chars: string[] = [];
			for (let j = 0; j < length; j++) {
				chars.push(this.getRandomGlyph());
			}

			this.streams.push({
				x: i * baseStep + (Math.random() * 4 - 2),
				y: Math.floor(Math.random() * -120),
				speed,
				length,
				layer,
				fontSize,
				chars,
				glitchTimer: Math.random() * 50,
				burst: Math.random() < 0.12
			});
		}
	}

	private initMotes() {
		this.motes = [];
		const count = 50;
		for (let i = 0; i < count; i++) {
			this.motes.push({
				x: Math.random() * window.innerWidth,
				y: Math.random() * window.innerHeight,
				vx: (Math.random() - 0.5) * 0.5,
				vy: -(0.4 + Math.random() * 0.9),
				size: 1 + Math.random() * 2.5,
				alpha: Math.random() * 0.6,
				baseAlpha: 0.3 + Math.random() * 0.5
			});
		}
	}

	private getRandomGlyph(): string {
		const set = GLYPH_SETS[this.glyphMode] || GLYPH_SETS.binary;
		return set[Math.floor(Math.random() * set.length)];
	}

	private startRainLoop() {
		const render = () => {
			if (!this.enabled || !this.ctx || !this.canvas) return;
			const t = THEMES[this.theme];

			// Measure FPS
			this.frameCount++;
			const now = performance.now();
			if (now - this.fpsTimer >= 1000) {
				this.fps = this.frameCount;
				this.frameCount = 0;
				this.fpsTimer = now;
				const fpsEl = document.getElementById("hud-fps-badge");
				if (fpsEl) fpsEl.textContent = `${this.fps} FPS // D3D12`;
			}

			// Translucent fade over canvas for phosphor persistence
			this.ctx.fillStyle = t.bgAlpha;
			this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

			// 1. Draw 3D Perspective Grid Floor
			if (this.showGrid) {
				this.renderPerspectiveGrid(t);
			}

			// 2. Draw Shockwave Ripples
			for (let i = this.ripples.length - 1; i >= 0; i--) {
				const r = this.ripples[i];
				r.radius += 5.5;
				r.alpha = Math.max(0, 1 - r.radius / r.maxRadius);

				this.ctx.save();
				this.ctx.beginPath();
				this.ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
				this.ctx.strokeStyle = t.accent;
				this.ctx.lineWidth = 2.5 * r.alpha;
				this.ctx.globalAlpha = r.alpha * 0.7;
				this.ctx.stroke();
				this.ctx.restore();

				if (r.radius >= r.maxRadius) {
					this.ripples.splice(i, 1);
				}
			}

			// 3. Render 3-Layer Rain Streams
			for (const stream of this.streams) {
				const x = stream.x;
				const y = stream.y * stream.fontSize;
				const fontSize = stream.fontSize;

				this.ctx.font = `${fontSize}px monospace`;

				// Distance to mouse pointer
				const distToMouse = Math.hypot(x - this.mouseX, y - this.mouseY);
				const isNearMouse = distToMouse < 150;

				// Glyph cycling / glitching
				stream.glitchTimer--;
				if (stream.glitchTimer <= 0) {
					const idx = Math.floor(Math.random() * stream.chars.length);
					stream.chars[idx] = this.getRandomGlyph();
					stream.glitchTimer = 6 + Math.random() * 24;
				}

				// Draw trailing characters
				for (let j = stream.length - 1; j >= 0; j--) {
					const charY = y - j * fontSize;
					if (charY < -20 || charY > this.canvas.height + 40) continue;

					const char = stream.chars[j] || "0";
					const posRatio = 1 - j / stream.length; // 1 at head, 0 at tail

					if (j === 0) {
						// Head character: bright glowing white/accent with bloom
						this.ctx.save();
						this.ctx.shadowColor = t.trail;
						this.ctx.shadowBlur = stream.burst ? 18 : stream.layer === 2 ? 14 : 8;
						this.ctx.fillStyle = isNearMouse ? "#ffffff" : t.head;
						this.ctx.globalAlpha = stream.layer === 0 ? 0.65 : 1.0;
						this.ctx.fillText(char, x, charY);
						this.ctx.restore();
					} else if (j < 3) {
						// Luminescent lead
						this.ctx.fillStyle = isNearMouse ? t.accent : t.trail;
						this.ctx.globalAlpha = (stream.layer === 0 ? 0.38 : 0.88) * posRatio;
						this.ctx.fillText(char, x, charY);
					} else {
						// Phosphor tail fade
						this.ctx.fillStyle = isNearMouse ? t.trail : t.dim;
						this.ctx.globalAlpha = (stream.layer === 0 ? 0.22 : 0.65) * posRatio;
						this.ctx.fillText(char, x, charY);
					}
				}

				// Drop physics advance
				if (y - stream.length * fontSize > this.canvas.height) {
					stream.y = Math.floor(Math.random() * -30);
					stream.speed =
						(stream.layer === 0 ? 0.9 + Math.random() * 0.8 : stream.layer === 1 ? 1.8 + Math.random() * 1.5 : 2.8 + Math.random() * 2.2) *
						(this.rainSpeed === "fast" ? 1.6 : this.rainSpeed === "steady" ? 0.75 : 1.0);
					stream.burst = Math.random() < 0.12;
				} else {
					stream.y += stream.speed * 0.35;
				}
			}

			// 4. Render Ascending Cyber Sparks / Embers
			if (this.showMotes) {
				this.ctx.save();
				for (const m of this.motes) {
					m.x += m.vx;
					m.y += m.vy;
					m.alpha = m.baseAlpha * (0.6 + Math.sin(Date.now() * 0.003 + m.x) * 0.4);

					if (m.y < -10) {
						m.y = this.canvas.height + 10;
						m.x = Math.random() * this.canvas.width;
					}

					this.ctx.beginPath();
					this.ctx.arc(m.x, m.y, m.size, 0, Math.PI * 2);
					this.ctx.fillStyle = t.particle;
					this.ctx.globalAlpha = m.alpha;
					this.ctx.shadowColor = t.trail;
					this.ctx.shadowBlur = 6;
					this.ctx.fill();
				}
				this.ctx.restore();
			}

			this.animationFrameId = requestAnimationFrame(render);
		};

		this.animationFrameId = requestAnimationFrame(render);
	}

	private renderPerspectiveGrid(t: ThemeColors) {
		if (!this.ctx || !this.canvas) return;
		const w = this.canvas.width;
		const h = this.canvas.height;
		const horizon = h * 0.72;

		this.gridOffset = (this.gridOffset + 0.6) % 36;

		this.ctx.save();
		this.ctx.strokeStyle = t.grid;
		this.ctx.lineWidth = 1;

		// 1. Perspective Depth Lines radiating from center vanishing point
		const vpX = w / 2;
		const lines = 24;
		for (let i = 0; i <= lines; i++) {
			const x = (w / lines) * i;
			this.ctx.beginPath();
			this.ctx.moveTo(vpX, horizon);
			this.ctx.lineTo(x, h);
			this.ctx.stroke();
		}

		// 2. Horizontal Moving Lines with geometric perspective spacing
		for (let z = this.gridOffset; z < (h - horizon); z += 24) {
			const progress = z / (h - horizon);
			const y = horizon + Math.pow(progress, 1.8) * (h - horizon);
			this.ctx.beginPath();
			this.ctx.moveTo(0, y);
			this.ctx.lineTo(w, y);
			this.ctx.stroke();
		}

		this.ctx.restore();
	}

	private startTelemetryLoop() {
		// Millisecond clock tick & spectrum dance
		const clockTicker = () => {
			if (!this.enabled) return;
			const now = new Date();
			const pad = (n: number) => String(n).padStart(2, "0");
			const clockEl = document.getElementById("hud-clock");
			if (clockEl) {
				clockEl.textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
			}
			const msEl = document.getElementById("hud-ms");
			if (msEl) {
				msEl.textContent = `.${String(now.getMilliseconds()).padStart(3, "0")}`;
			}
			requestAnimationFrame(clockTicker);
		};
		requestAnimationFrame(clockTicker);

		// Hardware Polling (1000ms)
		this.telemetryIntervalId = window.setInterval(async () => {
			if (!this.enabled) return;

			// 1. Query Real System Stats from Tauri IPC
			try {
				const cpu = await invoke<number>("get_cpu_usage");
				if (typeof cpu === "number") {
					this.cpuPercent = Math.min(100, Math.max(1, cpu));
					this.cpuHistory.push(this.cpuPercent);
					if (this.cpuHistory.length > 30) this.cpuHistory.shift();

					// Jitter thread grid around main CPU
					this.threadLoads = this.threadLoads.map(() => {
						const j = (Math.random() - 0.5) * 16;
						return Math.min(100, Math.max(5, Math.round(this.cpuPercent + j)));
					});
				}
			} catch {}

			try {
				const ram = await invoke<number>("get_ram_usage");
				if (typeof ram === "number") {
					this.ramPercent = Math.min(100, Math.max(1, Math.round(ram)));
					this.usedRamGb = Number(((this.totalRamGb * this.ramPercent) / 100).toFixed(1));
				}
			} catch {}

			try {
				const disk = await invoke<number>("get_disk_space");
				if (typeof disk === "number" && disk > 0) {
					this.diskFreeGb = disk;
				}
			} catch {}

			try {
				const net = await invoke<[number, number]>("get_network_speed");
				if (Array.isArray(net) && net.length === 2) {
					this.netRxKbps = Math.round(net[0] / 1024);
					this.netTxKbps = Math.round(net[1] / 1024);
					this.netHistory.push(Math.min(100, Math.round(this.netRxKbps / 80)));
					if (this.netHistory.length > 24) this.netHistory.shift();
				}
			} catch {}

			try {
				const bat = await invoke<any>("get_battery_details");
				if (bat && typeof bat.percentage === "number") {
					this.batteryPercent = bat.percentage;
					this.batteryCharging = !!bat.is_charging;
				}
			} catch {}

			// GPU Jitter simulator (until native DirectX telemetry)
			this.gpuPercent = Math.min(100, Math.max(8, Math.round(this.cpuPercent * 0.75 + (Math.random() * 8 - 4))));
			this.vramUsedGb = Number((2.0 + (this.gpuPercent / 100) * 2.5).toFixed(1));

			this.updateHUDText();
			this.drawCpuChart();
			this.renderThreadGrid();
			this.renderRamChips();
			this.renderNetBars();
			this.renderAudioSpectrum();
		}, 1000);
	}

	private updateHUDText() {
		const now = new Date();
		const pad = (n: number) => String(n).padStart(2, "0");

		// Uptime
		const uptimeSeconds = Math.floor((Date.now() - this.startTime) / 1000);
		const uph = Math.floor(uptimeSeconds / 3600);
		const upm = Math.floor((uptimeSeconds % 3600) / 60);
		const ups = uptimeSeconds % 60;
		const upEl = document.getElementById("hud-uptime");
		if (upEl) {
			upEl.textContent = `UPTIME: ${pad(uph)}:${pad(upm)}:${pad(ups)}`;
		}

		// CPU
		const cpuEl = document.getElementById("hud-cpu-val");
		if (cpuEl) cpuEl.textContent = `${this.cpuPercent}%`;

		const ring = document.getElementById("hud-cpu-ring");
		if (ring) {
			const offset = 113.1 - (this.cpuPercent / 100) * 113.1;
			ring.setAttribute("stroke-dashoffset", String(offset.toFixed(1)));
		}

		// RAM
		const ramEl = document.getElementById("hud-ram-val");
		if (ramEl) ramEl.textContent = `${this.ramPercent}%`;
		const ramGbEl = document.getElementById("hud-ram-gb");
		if (ramGbEl) ramGbEl.textContent = `${this.usedRamGb} GB / ${this.totalRamGb} GB`;

		// GPU
		const gpuEl = document.getElementById("hud-gpu-val");
		if (gpuEl) gpuEl.textContent = `${this.gpuPercent}%`;
		const vramEl = document.getElementById("hud-vram-val");
		if (vramEl) vramEl.textContent = `${this.vramUsedGb} GB / ${this.vramTotalGb} GB VRAM`;
		const gpuBar = document.getElementById("hud-gpu-bar");
		if (gpuBar) gpuBar.style.width = `${Math.min(100, Math.max(12, this.gpuPercent))}%`;

		// Disk
		const diskEl = document.getElementById("hud-disk-val");
		if (diskEl) diskEl.textContent = `${this.diskFreeGb} GB FREE`;
		const diskBar = document.getElementById("hud-disk-bar");
		if (diskBar) {
			const usedPercent = Math.round(((this.diskTotalGb - this.diskFreeGb) / this.diskTotalGb) * 100);
			diskBar.style.width = `${Math.min(100, Math.max(10, usedPercent))}%`;
		}

		// Net
		const rxEl = document.getElementById("hud-net-rx");
		if (rxEl) {
			rxEl.textContent =
				this.netRxKbps > 1024
					? `↓ ${(this.netRxKbps / 1024).toFixed(1)} MB/s`
					: `↓ ${this.netRxKbps} KB/s`;
		}
		const txEl = document.getElementById("hud-net-tx");
		if (txEl) {
			txEl.textContent =
				this.netTxKbps > 1024
					? `↑ ${(this.netTxKbps / 1024).toFixed(1)} MB/s`
					: `↑ ${this.netTxKbps} KB/s`;
		}

		// Battery
		const batVal = document.getElementById("hud-bat-val");
		if (batVal) batVal.textContent = `${this.batteryPercent}%`;
		const batBar = document.getElementById("hud-bat-bar");
		if (batBar) batBar.style.width = `${this.batteryPercent}%`;
		const batStatus = document.getElementById("hud-bat-status");
		if (batStatus) {
			batStatus.textContent = this.batteryCharging ? "AC ADAPTER (CHARGING)" : "HIGH PERFORMANCE BATTERY";
		}

		// Terminal Log Line
		const logEl = document.getElementById("hud-log-stream");
		if (logEl && Date.now() - this.lastLogUpdate > 2600) {
			this.lastLogUpdate = Date.now();
			const idx = Math.floor(Math.random() * this.terminalLogs.length);
			logEl.textContent = `${this.terminalLogs[idx]} // TS: ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
		}
	}

	private drawCpuChart() {
		const canvas = document.getElementById("hud-cpu-chart") as HTMLCanvasElement | null;
		if (!canvas) return;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		const w = canvas.width;
		const h = canvas.height;
		ctx.clearRect(0, 0, w, h);

		const t = THEMES[this.theme];
		const step = w / (this.cpuHistory.length - 1);

		ctx.beginPath();
		for (let i = 0; i < this.cpuHistory.length; i++) {
			const val = this.cpuHistory[i];
			const x = i * step;
			const y = h - (val / 100) * (h - 6);
			if (i === 0) ctx.moveTo(x, y);
			else ctx.lineTo(x, y);
		}

		ctx.strokeStyle = t.accent;
		ctx.lineWidth = 2;
		ctx.shadowColor = t.trail;
		ctx.shadowBlur = 6;
		ctx.stroke();

		// Gradient Fill under curve
		ctx.lineTo(w, h);
		ctx.lineTo(0, h);
		ctx.closePath();
		const grad = ctx.createLinearGradient(0, 0, 0, h);
		grad.addColorStop(0, t.border);
		grad.addColorStop(1, "rgba(0, 0, 0, 0)");
		ctx.fillStyle = grad;
		ctx.fill();
	}

	private renderThreadGrid() {
		const grid = document.getElementById("hud-thread-grid");
		if (!grid) return;
		const t = THEMES[this.theme];

		let html = "";
		for (let i = 0; i < 16; i++) {
			const load = this.threadLoads[i] || 20;
			const height = Math.max(2, Math.round((load / 100) * 12));
			const alpha = (load / 100).toFixed(2);
			html += `<div style="height: 100%; display: flex; align-items: flex-end; background: rgba(255,255,255,0.06); border-radius: 1px;">
				<div style="width: 100%; height: ${height}px; background: ${t.accent}; opacity: ${alpha}; border-radius: 1px;"></div>
			</div>`;
		}
		grid.innerHTML = html;
	}

	private renderRamChips() {
		const container = document.getElementById("hud-ram-chips");
		if (!container) return;
		const t = THEMES[this.theme];

		const activeChips = Math.round((this.ramPercent / 100) * 16);
		let html = "";
		for (let i = 0; i < 16; i++) {
			const isActive = i < activeChips;
			html += `<div style="height: 100%; border-radius: 2px; background: ${isActive ? t.accent : "rgba(255,255,255,0.08)"}; box-shadow: ${isActive ? `0 0 6px ${t.accent}` : "none"};"></div>`;
		}
		container.innerHTML = html;
	}

	private renderNetBars() {
		const container = document.getElementById("hud-net-bars");
		if (!container) return;
		const t = THEMES[this.theme];

		let html = "";
		for (let i = 0; i < 24; i++) {
			const val = this.netHistory[i] || 5;
			const h = Math.max(3, Math.round((val / 100) * 16));
			html += `<div style="height: ${h}px; border-radius: 1px; background: ${t.accent}; opacity: ${0.3 + (val / 100) * 0.7};"></div>`;
		}
		container.innerHTML = html;
	}

	private renderAudioSpectrum() {
		const container = document.getElementById("hud-spectrum-bars");
		if (!container) return;
		const t = THEMES[this.theme];

		let html = "";
		for (let i = 0; i < 16; i++) {
			const h = Math.floor(3 + Math.random() * 11);
			html += `<div style="width: 3px; height: ${h}px; background: ${t.accent}; opacity: 0.75; border-radius: 1px;"></div>`;
		}
		container.innerHTML = html;
	}
}
