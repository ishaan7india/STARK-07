import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { PlaneModeController } from "./plane";
import { RocketModeController } from "./rocket";
import { MatrixHudController } from "./matrixHud";
import { wallpaperAudio } from "./audio";

declare global {
	interface Window {
		slowroadsGame?: any;
		slowroadsConfig?: any;
		slowroadsAutoDrive?: any;
		slowroadsInput?: any;
		slowroadsVehicle?: any;
		slowroadsApp?: any;
		slowroadsThree?: any;
		starkWallpaper?: any;
	}
}

// Ensure wallpaper never pauses on window blur
try {
	window.localStorage.setItem("reloading", "true");
	window.localStorage.setItem("AutoPause", "1");
} catch {}

let planeCtrl: PlaneModeController | null = null;
let rocketCtrl: RocketModeController | null = null;
let matrixCtrl: MatrixHudController | null = null;
let currentMode: "car" | "plane" | "rocket" | "matrix" = "car";
let autoBtnElement: HTMLElement | null = null;
let modeBtnElement: HTMLElement | null = null;
let hintElement: HTMLElement | null = null;

function initWallpaperBridge() {
	// Auto-focus canvas on pointer interaction
	window.addEventListener("pointerdown", () => {
		const canvas = document.querySelector("canvas");
		if (canvas) {
			canvas.tabIndex = 0;
			canvas.focus({ preventScroll: true });
		}
	});

	// Poll until slowroadsGame and slowroadsApp are initialized
	const checkInterval = setInterval(() => {
		const game = window.slowroadsGame;
		const autoDrive = window.slowroadsAutoDrive;
		const config = window.slowroadsConfig;
		const app = window.slowroadsApp;

		if (game && autoDrive && app && app.scene && app.camController) {
			clearInterval(checkInterval);
			setupBridge(game, autoDrive, config, app);
		}
	}, 150);
}

function setupBridge(game: any, autoDrive: any, config: any, app: any) {
	// 1. Initialize Plane, Rocket, and Matrix HUD Controllers
	try {
		planeCtrl = new PlaneModeController(app.scene, app.camController.camera);
		rocketCtrl = new RocketModeController(app.scene, app.camController.camera);
		matrixCtrl = new MatrixHudController();
	} catch (err) {
		console.error("Failed to initialize Plane/Rocket/Matrix controllers:", err);
	}

	// 2. Intercept slowroadsApp.update loop to handle 60fps rendering smoothly for all modes
	const origUpdate = app.update.bind(app);
	app.update = function (e: number, t: number) {
		if (currentMode === "matrix") {
			// Matrix canvas has its own independent 60fps telemetry loop
			return;
		}

		if (currentMode === "plane" && planeCtrl) {
			planeCtrl.update(e);
			const Do = (window as any).Do;
			if (Do && typeof Do.update === "function") {
				try {
					Do.update(e, t);
				} catch {}
			}
			this.render();
			if (this.stats && typeof this.stats.update === "function") {
				this.stats.update();
			}
			return;
		}

		if (currentMode === "rocket" && rocketCtrl) {
			rocketCtrl.update(e);
			const Do = (window as any).Do;
			if (Do && typeof Do.update === "function") {
				try {
					Do.update(e, t);
				} catch {}
			}
			this.render();
			if (this.stats && typeof this.stats.update === "function") {
				this.stats.update();
			}
			return;
		}

		// Normal car mode - ensure car model is ALWAYS visible
		const carObj = (window as any).slowroadsVehicle || (window as any).z;
		if (carObj?.geo && !carObj.geo.visible) {
			carObj.geo.visible = true;
		}

		try {
			origUpdate(e, t);
		} catch (err) {
			console.warn("[Bridge] Car update frame recovered:", err);
			if (app.physDT) app.physDT = 0;
			try {
				this.render();
			} catch {}
		}
	};

	// Guard against game.retire() pausing or killing the game
	if (game) {
		game.retire = function () {
			console.warn("[Bridge] game.retire() intercepted - keeping simulation active");
			this.paused = false;
			if (typeof this.startTicker === "function") {
				try {
					this.startTicker();
				} catch (e) {}
			}
		};
	}

	// Auto-cleanup any error modals and ensure game stays active
	setInterval(() => {
		const errEl = document.getElementById("game-error");
		if (errEl) {
			errEl.remove();
		}
		if (game && game.paused) {
			try {
				game.resume(true);
			} catch (e) {}
		}
	}, 1000);

	window.addEventListener("blur", () => {
		if (game && game.paused) {
			try {
				game.resume(true);
			} catch (e) {}
		}
	});

	// 3. Ensure Autopilot is active by default
	const savedAuto = localStorage.getItem("bloom-wallpaper-autodrive");
	const shouldAuto = savedAuto !== "false";
	if (autoDrive && typeof autoDrive.set === "function") {
		autoDrive.set(shouldAuto);
	}

	// 4. Configure default audio level (gentle ambient by default)
	const savedVolume = localStorage.getItem("bloom-wallpaper-volume");
	const volume = savedVolume !== null ? parseFloat(savedVolume) : 0.15;
	if (config && typeof config.set === "function") {
		config.set("AudioLevel", volume);
		config.set("AutoPause", 1);
	}

	// 5. Make sure game is unpaused
	if (game.paused && typeof game.resume === "function") {
		game.resume(true);
	}

	// 6. Create floating STARK-07 HUD pill
	createHudPill(autoDrive, game);

	// 7. Check saved vehicle mode
	const savedVehicle = localStorage.getItem("bloom-wallpaper-vehicle") || "roadster";
	applyVehicleMode(savedVehicle);

	// 8. Global hotkey listener (KeyV for cycling mode)
	window.addEventListener("keydown", (e) => {
		if (e.code === "KeyV" && !e.repeat) {
			cycleMode();
		}
	});

	// 9. Listen to Tauri settings events
	invoke<Record<string, string>>("load_settings")
		.then((s) => {
			if (s["bloom-wallpaper-autodrive"]) {
				const autoVal = s["bloom-wallpaper-autodrive"] !== "false";
				autoDrive?.set(autoVal);
				if (planeCtrl) planeCtrl.autopilot = autoVal;
				if (rocketCtrl) rocketCtrl.autopilot = autoVal;
				updateHudState(autoVal);
			}
			if (s["bloom-wallpaper-volume"] && config) {
				const v = parseFloat(s["bloom-wallpaper-volume"]);
				if (!isNaN(v)) config.set("AudioLevel", v);
			}
			if (s["bloom-wallpaper-vehicle"]) {
				applyVehicleMode(s["bloom-wallpaper-vehicle"]);
			}
		})
		.catch(() => {});

	listen<{ key: string; value: unknown }>("settings-changed", ({ payload }) => {
		if (payload.key === "bloom-wallpaper-enabled" && String(payload.value) !== "true") {
			void invoke("wallpaper_hide").catch(() => {});
		}
		if (payload.key === "bloom-wallpaper-autodrive") {
			const autoVal = String(payload.value) !== "false";
			autoDrive?.set(autoVal);
			if (planeCtrl) planeCtrl.autopilot = autoVal;
			if (rocketCtrl) rocketCtrl.autopilot = autoVal;
			updateHudState(autoVal);
		}
		if (payload.key === "bloom-wallpaper-volume" && config) {
			const v = parseFloat(String(payload.value));
			if (!isNaN(v)) config.set("AudioLevel", v);
		}
		if (payload.key === "bloom-wallpaper-vehicle") {
			applyVehicleMode(String(payload.value));
		}
	});

	// Global STARK-07 wallpaper helper
	window.starkWallpaper = {
		setAutopilot: (enable: boolean) => {
			if (currentMode === "car") {
				autoDrive?.set(enable);
			} else if (currentMode === "plane" && planeCtrl) {
				planeCtrl.autopilot = enable;
			} else if (currentMode === "rocket" && rocketCtrl) {
				rocketCtrl.autopilot = enable;
			}
			updateHudState(enable);
			localStorage.setItem("bloom-wallpaper-autodrive", String(enable));
		},
		toggleAutopilot: () => {
			let next = false;
			if (currentMode === "car") {
				next = !autoDrive?.value;
				autoDrive?.set(next);
			} else if (currentMode === "plane" && planeCtrl) {
				next = !planeCtrl.autopilot;
				planeCtrl.autopilot = next;
			} else if (currentMode === "rocket" && rocketCtrl) {
				next = !rocketCtrl.autopilot;
				rocketCtrl.autopilot = next;
			}
			updateHudState(next);
			localStorage.setItem("bloom-wallpaper-autodrive", String(next));
		},
		resetVehicle: () => {
			if (currentMode === "car") {
				window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyR", key: "r" }));
				window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyR", key: "r" }));
			} else if (currentMode === "plane" && planeCtrl) {
				const rw = planeCtrl.runways[0];
				if (rw) {
					planeCtrl.pos.copy(rw.position).add({ x: 0, y: 85, z: -200 } as any);
					planeCtrl.vel.set(0, 0, 85);
					planeCtrl.throttle = 0.65;
				}
			} else if (currentMode === "rocket" && rocketCtrl) {
				rocketCtrl.activate();
			}
		},
		cycleMode: () => {
			cycleMode();
		},
		switchCamera: () => {
			if (currentMode === "car") {
				window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyC", key: "c" }));
				window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyC", key: "c" }));
			} else if (currentMode === "plane" && planeCtrl) {
				planeCtrl.cycleCamera();
			} else if (currentMode === "rocket" && rocketCtrl) {
				rocketCtrl.cycleCamera();
			}
		},
		toggleHUD: () => {
			window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyU", key: "u" }));
			window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyU", key: "u" }));
		},
		toggleSound: () => {
			wallpaperAudio.toggleMute();
			window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyM", key: "m" }));
			window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyM", key: "m" }));
		}
	};
}

function cycleMode() {
	if (currentMode === "car") {
		setMode("plane");
	} else if (currentMode === "plane") {
		setMode("rocket");
	} else if (currentMode === "rocket") {
		setMode("matrix");
	} else {
		setMode("car");
	}
}

function applyVehicleMode(name: string) {
	if (name === "plane") {
		setMode("plane");
	} else if (name === "rocket") {
		setMode("rocket");
	} else if (name === "matrix") {
		setMode("matrix");
	} else {
		setMode("car");
		changeCarVehicle(name);
	}
}

function setMode(mode: "car" | "plane" | "rocket" | "matrix") {
	currentMode = mode;
	const app = window.slowroadsApp;

	// UI speed container toggle
	const carSpeedDom = document.getElementById("ui-speed-val")?.parentElement;
	const vehicle = (window as any).slowroadsVehicle || (window as any).z;

	if (mode === "matrix") {
		planeCtrl?.deactivate();
		rocketCtrl?.deactivate();
		matrixCtrl?.activate();
		wallpaperAudio.setMode("car");

		// Hide car mesh
		if (vehicle?.geo) vehicle.geo.visible = false;
		if (carSpeedDom) carSpeedDom.style.display = "none";

		updateModeDisplay("MATRIX HUD");
		updateHint("Matrix HUD: Binary Rain + System Specs // Click Themes/Density // V Switch Mode");
	} else if (mode === "plane") {
		matrixCtrl?.deactivate();
		rocketCtrl?.deactivate();
		planeCtrl?.activate();
		wallpaperAudio.setMode("plane");

		// Hide car mesh and mute car audio
		if (vehicle?.geo) vehicle.geo.visible = false;
		if (app?.vehicleController?.audio) app.vehicleController.audio.vol = 0;
		if (carSpeedDom) carSpeedDom.style.display = "none";

		updateModeDisplay("JET PLANE");
		updateHudState(planeCtrl?.autopilot ?? true);
		updateHint("Plane: WASD Pitch/Roll · Q/E Rudder · Shift/Ctrl Throttle · V Switch Mode · F Autopilot");
	} else if (mode === "rocket") {
		matrixCtrl?.deactivate();
		planeCtrl?.deactivate();
		rocketCtrl?.activate();
		wallpaperAudio.setMode("rocket");

		// Hide car mesh and mute car audio
		if (vehicle?.geo) vehicle.geo.visible = false;
		if (app?.vehicleController?.audio) app.vehicleController.audio.vol = 0;
		if (carSpeedDom) carSpeedDom.style.display = "none";

		updateModeDisplay("ROCKET");
		updateHudState(rocketCtrl?.autopilot ?? true);
		updateHint("Rocket: Space Throttle · WASD Gimbal · X Staging · V Switch Mode · F Orbit AP");
	} else {
		matrixCtrl?.deactivate();
		planeCtrl?.deactivate();
		rocketCtrl?.deactivate();
		wallpaperAudio.setMode("car");

		// Show car mesh and ensure all body/wheel meshes are visible
		if (vehicle?.geo) {
			vehicle.geo.visible = true;
			vehicle.geo.traverse((child: any) => {
				if (child.name !== "z_shadow_parts_shadow") {
					child.visible = true;
				}
			});
		}
		// Reset to third-person Chase camera if camera mode was stuck in bonnet/cockpit
		if (app?.camController?.modeIndex >= 2) {
			app.camController.modeIndex = 0;
			try {
				app.camController.reset();
			} catch {}
		}

		if (carSpeedDom) carSpeedDom.style.display = "";

		updateModeDisplay("CAR");
		updateHudState(window.slowroadsAutoDrive?.value ?? true);
		updateHint("Car: WASD Drive · Space Handbrake · V Switch Mode · F Autopilot · C Cam · U HUD");
	}

	localStorage.setItem("bloom-wallpaper-vehicle", mode);
}

function changeCarVehicle(name: string) {
	const map: Record<string, string> = {
		roadster: "Roadster",
		coach: "Coach",
		bus: "Coach",
		bike: "Bike",
		lambo: "Lambo",
		supercar: "Supercar"
	};
	void map;
	void name;
	window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyB", key: "b" }));
	window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyB", key: "b" }));
}

function updateModeDisplay(modeName: string) {
	if (modeBtnElement) {
		modeBtnElement.textContent = `MODE: ${modeName} (V)`;
		if (modeName === "JET PLANE") {
			modeBtnElement.style.color = "#48c0ff";
			modeBtnElement.style.borderColor = "rgba(72, 192, 255, 0.45)";
		} else if (modeName === "ROCKET") {
			modeBtnElement.style.color = "#ff9548";
			modeBtnElement.style.borderColor = "rgba(255, 149, 72, 0.45)";
		} else {
			modeBtnElement.style.color = "#7ce38b";
			modeBtnElement.style.borderColor = "rgba(124, 227, 139, 0.45)";
		}
	}
}

function updateHudState(isAuto: boolean) {
	if (autoBtnElement) {
		autoBtnElement.textContent = isAuto ? "AUTOPILOT: ON" : "MANUAL DRIVE";
		autoBtnElement.style.color = isAuto ? "#7ce38b" : "#ffbd59";
		autoBtnElement.style.borderColor = isAuto ? "rgba(124, 227, 139, 0.4)" : "rgba(255, 189, 89, 0.4)";
	}
}

function updateHint(text: string) {
	if (hintElement) {
		hintElement.textContent = text;
		hintElement.style.opacity = "1";
	}
}

function createHudPill(autoDrive: any, _game: any) {
	if (document.getElementById("stark-wallpaper-overlay")) return;

	const container = document.createElement("div");
	container.id = "stark-wallpaper-overlay";
	container.style.cssText = `
		position: fixed;
		bottom: 22px;
		left: 22px;
		z-index: 99999;
		display: flex;
		flex-direction: column;
		gap: 8px;
		pointer-events: none;
		user-select: none;
		font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
	`;

	const pill = document.createElement("div");
	pill.id = "stark-wallpaper-hud";
	pill.style.cssText = `
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 7px 14px;
		background: rgba(9, 14, 18, 0.82);
		backdrop-filter: blur(16px);
		-webkit-backdrop-filter: blur(16px);
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 9999px;
		color: #e5edf0;
		font-size: 11px;
		letter-spacing: 0.5px;
		box-shadow: 0 4px 20px rgba(0, 0, 0, 0.45);
		pointer-events: auto;
		transition: opacity 0.4s ease, transform 0.4s ease;
	`;

	// Brand icon
	const brand = document.createElement("div");
	brand.style.cssText = "display: flex; align-items: center; gap: 6px; font-weight: 600; color: #a4c2a5;";
	brand.innerHTML = `
		<span style="width: 7px; height: 7px; border-radius: 50%; background: #7ce38b; box-shadow: 0 0 8px #7ce38b; display: inline-block;"></span>
		<span>STARK-07</span>
	`;
	pill.appendChild(brand);

	// Divider
	const divider = () => {
		const d = document.createElement("span");
		d.style.cssText = "width: 1px; height: 12px; background: rgba(255,255,255,0.15); margin: 0 2px;";
		return d;
	};
	pill.appendChild(divider());

	// Mode switch button (Car / Jet / Rocket)
	const modeBtn = document.createElement("button");
	modeBtn.type = "button";
	modeBtn.style.cssText = `
		background: rgba(255, 255, 255, 0.08);
		border: 1px solid rgba(124, 227, 139, 0.45);
		border-radius: 6px;
		padding: 3px 8px;
		color: #7ce38b;
		font-size: 10px;
		font-weight: 600;
		cursor: pointer;
		letter-spacing: 0.5px;
		transition: all 0.2s ease;
	`;
	modeBtn.textContent = "MODE: CAR (V)";
	modeBtn.title = "Cycle Mode: Car ↔ Supersonic Jet ↔ Rocket (Key V)";
	modeBtn.addEventListener("click", () => {
		cycleMode();
	});
	modeBtnElement = modeBtn;
	pill.appendChild(modeBtn);

	// Auto button
	const autoBtn = document.createElement("button");
	autoBtn.type = "button";
	autoBtn.style.cssText = `
		background: rgba(255, 255, 255, 0.08);
		border: 1px solid rgba(124, 227, 139, 0.4);
		border-radius: 6px;
		padding: 3px 8px;
		color: #7ce38b;
		font-size: 10px;
		font-weight: 600;
		cursor: pointer;
		letter-spacing: 0.5px;
		transition: all 0.2s ease;
	`;
	autoBtn.textContent = autoDrive?.value ? "AUTOPILOT: ON" : "MANUAL DRIVE";
	autoBtn.title = "Toggle Autopilot cruise / ILS / orbital mode (Key F or =)";
	autoBtn.addEventListener("click", () => {
		window.starkWallpaper?.toggleAutopilot();
	});
	autoBtnElement = autoBtn;
	pill.appendChild(autoBtn);

	// Camera button
	const camBtn = document.createElement("button");
	camBtn.type = "button";
	camBtn.style.cssText = `
		background: rgba(255, 255, 255, 0.06);
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 6px;
		padding: 3px 8px;
		color: #d1dde2;
		font-size: 10px;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s ease;
	`;
	camBtn.textContent = "CAM (C)";
	camBtn.title = "Switch camera view (Key C)";
	camBtn.addEventListener("click", () => {
		window.starkWallpaper?.switchCamera();
	});
	pill.appendChild(camBtn);

	// Sound button
	const soundBtn = document.createElement("button");
	soundBtn.type = "button";
	soundBtn.style.cssText = `
		background: rgba(255, 255, 255, 0.06);
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 6px;
		padding: 3px 8px;
		color: #d1dde2;
		font-size: 10px;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s ease;
	`;
	soundBtn.textContent = "SOUND (M)";
	soundBtn.title = "Mute / Unmute audio (Key M)";
	soundBtn.addEventListener("click", () => {
		window.starkWallpaper?.toggleSound();
	});
	pill.appendChild(soundBtn);

	// Reset button
	const resetBtn = document.createElement("button");
	resetBtn.type = "button";
	resetBtn.style.cssText = `
		background: rgba(255, 255, 255, 0.06);
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 6px;
		padding: 3px 8px;
		color: #d1dde2;
		font-size: 10px;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s ease;
	`;
	resetBtn.textContent = "RESET (R)";
	resetBtn.title = "Reset to road / runway / launch pad (Key R)";
	resetBtn.addEventListener("click", () => {
		window.starkWallpaper?.resetVehicle();
	});
	pill.appendChild(resetBtn);

	// HUD Toggle button
	const hudBtn = document.createElement("button");
	hudBtn.type = "button";
	hudBtn.style.cssText = `
		background: rgba(255, 255, 255, 0.06);
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 6px;
		padding: 3px 8px;
		color: #d1dde2;
		font-size: 10px;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s ease;
	`;
	hudBtn.textContent = "HUD (U)";
	hudBtn.title = "Toggle game speedometer and controls (Key U)";
	hudBtn.addEventListener("click", () => {
		window.starkWallpaper?.toggleHUD();
	});
	pill.appendChild(hudBtn);

	container.appendChild(pill);

	// Hint bar
	const hint = document.createElement("div");
	hint.id = "stark-wallpaper-hint";
	hint.style.cssText = `
		padding: 4px 10px;
		background: rgba(9, 14, 18, 0.6);
		border-radius: 6px;
		color: rgba(220, 230, 235, 0.75);
		font-size: 10px;
		letter-spacing: 0.3px;
		max-width: fit-content;
		transition: opacity 0.5s ease;
	`;
	hint.textContent = "WASD / Arrows to drive · Space Handbrake · V Switch Mode · F Autopilot · C Camera";
	container.appendChild(hint);
	hintElement = hint;

	document.body.appendChild(container);

	// Auto-fade hint after 8 seconds, show on mouse movement
	let fadeTimeout = setTimeout(() => {
		hint.style.opacity = "0";
	}, 8000);

	window.addEventListener("pointermove", () => {
		hint.style.opacity = "1";
		pill.style.opacity = "1";
		clearTimeout(fadeTimeout);
		fadeTimeout = setTimeout(() => {
			hint.style.opacity = "0";
		}, 6000);
	}, { passive: true });
}

// Start
if (document.readyState === "loading") {
	document.addEventListener("DOMContentLoaded", initWallpaperBridge);
} else {
	initWallpaperBridge();
}
