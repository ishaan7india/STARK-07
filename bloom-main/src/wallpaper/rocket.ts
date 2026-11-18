import * as THREE from "three";
import { wallpaperAudio } from "./audio";

export class RocketModeController {
	private scene: THREE.Scene;
	private camera: THREE.PerspectiveCamera;
	private domContainer: HTMLElement | null = null;
	private hudCanvas: HTMLCanvasElement | null = null;
	private hudCtx: CanvasRenderingContext2D | null = null;

	// Space Environment Objects
	public spaceGroup: THREE.Group = new THREE.Group();
	private planetGlobe: THREE.Mesh | null = null;
	private planetAtmosphere: THREE.Mesh | null = null;
	private launchPadGroup: THREE.Group = new THREE.Group();
	private starField: THREE.Points | null = null;

	// 3D Rocket Meshes
	public rocketGroup: THREE.Group = new THREE.Group();
	private stage1Mesh: THREE.Group = new THREE.Group();
	private stage2Mesh: THREE.Group = new THREE.Group();
	private exhaustFlames: THREE.Mesh[] = [];
	private rcsPuffs: THREE.Mesh[] = [];
	private smokeParticles: THREE.Points | null = null;
	private smokeGeo: THREE.BufferGeometry | null = null;
	private smokePositions: Float32Array = new Float32Array(300 * 3);
	private smokeIndex: number = 0;

	// Rocket Flight State
	public pos: THREE.Vector3 = new THREE.Vector3(0, 0, 0); // local to launch pad
	public vel: THREE.Vector3 = new THREE.Vector3(0, 0, 0);
	public quat: THREE.Quaternion = new THREE.Quaternion();
	public throttle: number = 0; // 0 to 1
	public altitudeKm: number = 0;
	public speedMs: number = 0;
	public apoapsisKm: number = 0;
	public periapsisKm: number = 0;
	public fuelPercent: number = 100;
	public stage: 1 | 2 = 1;
	public isLaunched: boolean = false;
	public isInOrbit: boolean = false;
	public autopilot: boolean = true;
	public activeCameraMode: "chase" | "pad" | "orbital" = "chase";

	private keys: Record<string, boolean> = {};
	private enabled: boolean = false;
	private padLocation: THREE.Vector3 = new THREE.Vector3(450, 28.5, 900);

	constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
		this.scene = scene;
		this.camera = camera;

		this.buildSpaceEnvironment();
		this.buildRocket();
		this.setupHUD();
		this.setupInputListeners();
	}

	private buildSpaceEnvironment() {
		this.spaceGroup = new THREE.Group();
		this.spaceGroup.name = "stark_space_environment";

		// 1. Starfield
		const starCount = 3500;
		const starGeo = new THREE.BufferGeometry();
		const starPositions = new Float32Array(starCount * 3);
		const starColors = new Float32Array(starCount * 3);

		for (let i = 0; i < starCount; i++) {
			const theta = Math.random() * Math.PI * 2;
			const phi = Math.acos(Math.random() * 2 - 1);
			const r = 2400 + Math.random() * 800;

			starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
			starPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
			starPositions[i * 3 + 2] = r * Math.cos(phi);

			const col = Math.random();
			starColors[i * 3] = col > 0.7 ? 0.75 : 1.0;
			starColors[i * 3 + 1] = col > 0.8 ? 0.85 : 1.0;
			starColors[i * 3 + 2] = 1.0;
		}

		starGeo.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
		starGeo.setAttribute("color", new THREE.BufferAttribute(starColors, 3));

		const starMat = new THREE.PointsMaterial({
			size: 2.2,
			vertexColors: true,
			transparent: true,
			opacity: 0.95
		});
		this.starField = new THREE.Points(starGeo, starMat);
		this.spaceGroup.add(this.starField);

		// 2. Earth / Planetary Globe (Visible at high altitude)
		const planetGeo = new THREE.SphereGeometry(1800, 48, 36);
		const planetMat = new THREE.MeshStandardMaterial({
			color: 0x1b4b72,
			roughness: 0.65,
			metalness: 0.1
		});
		this.planetGlobe = new THREE.Mesh(planetGeo, planetMat);
		this.planetGlobe.position.set(0, -1820, 0); // Center below surface
		this.spaceGroup.add(this.planetGlobe);

		// Atmosphere Glow Shell
		const atmoGeo = new THREE.SphereGeometry(1835, 48, 36);
		const atmoMat = new THREE.MeshBasicMaterial({
			color: 0x48c0ff,
			transparent: true,
			opacity: 0.22,
			side: THREE.BackSide
		});
		this.planetAtmosphere = new THREE.Mesh(atmoGeo, atmoMat);
		this.planetAtmosphere.position.copy(this.planetGlobe.position);
		this.spaceGroup.add(this.planetAtmosphere);

		// 3. Ground Launch Pad Complex
		this.launchPadGroup = new THREE.Group();
		this.launchPadGroup.position.copy(this.padLocation);

		// Pad Concrete Base
		const padBaseGeo = new THREE.CylinderGeometry(35, 42, 6, 16);
		const padMat = new THREE.MeshStandardMaterial({ color: 0x24282c, roughness: 0.9 });
		const padBase = new THREE.Mesh(padBaseGeo, padMat);
		padBase.position.y = 3;
		this.launchPadGroup.add(padBase);

		// Umbilical Launch Gantry Tower
		const towerGeo = new THREE.BoxGeometry(7, 65, 7);
		const towerMat = new THREE.MeshStandardMaterial({ color: 0xaa281e, metalness: 0.6, roughness: 0.4 });
		const tower = new THREE.Mesh(towerGeo, towerMat);
		tower.position.set(16, 35, 0);
		this.launchPadGroup.add(tower);

		// Service Swing Arms
		const armGeo = new THREE.BoxGeometry(14, 2, 2.5);
		const arm1 = new THREE.Mesh(armGeo, towerMat);
		arm1.position.set(8, 48, 0);
		this.launchPadGroup.add(arm1);

		const arm2 = new THREE.Mesh(armGeo, towerMat);
		arm2.position.set(8, 25, 0);
		this.launchPadGroup.add(arm2);

		// Launch Pad Floodlights
		const padLight = new THREE.PointLight(0xffeedd, 3, 120);
		padLight.position.set(12, 45, 12);
		this.launchPadGroup.add(padLight);

		this.spaceGroup.add(this.launchPadGroup);
		this.spaceGroup.visible = false;
		this.scene.add(this.spaceGroup);
	}

	private buildRocket() {
		this.rocketGroup = new THREE.Group();
		this.rocketGroup.name = "stark_heavy_rocket";

		const rocketWhite = new THREE.MeshStandardMaterial({
			color: 0xededed,
			metalness: 0.2,
			roughness: 0.3
		});
		const carbonMat = new THREE.MeshStandardMaterial({
			color: 0x181a1d,
			metalness: 0.85,
			roughness: 0.2
		});
		const engineMat = new THREE.MeshStandardMaterial({
			color: 0x22262a,
			metalness: 0.95,
			roughness: 0.15
		});
		const stripeMat = new THREE.MeshBasicMaterial({ color: 0x7ce38b });

		// --- STAGE 1 (Booster) ---
		this.stage1Mesh = new THREE.Group();

		// Main First Stage Booster Body
		const s1BodyGeo = new THREE.CylinderGeometry(2.4, 2.4, 28, 24);
		const s1Body = new THREE.Mesh(s1BodyGeo, rocketWhite);
		s1Body.position.y = 14;
		this.stage1Mesh.add(s1Body);

		// Interstage Ring (Carbon composite)
		const interstageGeo = new THREE.CylinderGeometry(2.42, 2.42, 3.2, 24);
		const interstage = new THREE.Mesh(interstageGeo, carbonMat);
		interstage.position.y = 29;
		this.stage1Mesh.add(interstage);

		// Grid Fins (4 at top of Stage 1)
		const finGeo = new THREE.BoxGeometry(0.2, 1.8, 1.8);
		for (let i = 0; i < 4; i++) {
			const angle = (i * Math.PI) / 2;
			const fin = new THREE.Mesh(finGeo, carbonMat);
			fin.position.set(Math.cos(angle) * 2.7, 27.5, Math.sin(angle) * 2.7);
			fin.rotation.y = angle;
			this.stage1Mesh.add(fin);
		}

		// Stage 1 Engine Cluster (9 Nozzles)
		const nozzleGeo = new THREE.ConeGeometry(0.5, 1.4, 16);
		nozzleGeo.rotateX(Math.PI);
		for (let i = 0; i < 9; i++) {
			const nozzle = new THREE.Mesh(nozzleGeo, engineMat);
			if (i === 0) {
				nozzle.position.set(0, -0.6, 0);
			} else {
				const a = ((i - 1) * Math.PI) / 4;
				nozzle.position.set(Math.cos(a) * 1.4, -0.6, Math.sin(a) * 1.4);
			}
			this.stage1Mesh.add(nozzle);
		}

		// Volumetric Exhaust Flame Plume
		const flameGeo = new THREE.ConeGeometry(2.6, 16, 16);
		flameGeo.rotateX(Math.PI);
		const flameMat = new THREE.MeshBasicMaterial({
			color: 0xffa500,
			transparent: true,
			opacity: 0.92
		});
		const mainFlame = new THREE.Mesh(flameGeo, flameMat);
		mainFlame.position.set(0, -9, 0);
		this.stage1Mesh.add(mainFlame);
		this.exhaustFlames.push(mainFlame);

		// Inner Core White Flame
		const coreFlameGeo = new THREE.ConeGeometry(1.2, 10, 12);
		coreFlameGeo.rotateX(Math.PI);
		const coreFlameMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 });
		const coreFlame = new THREE.Mesh(coreFlameGeo, coreFlameMat);
		coreFlame.position.set(0, -6, 0);
		this.stage1Mesh.add(coreFlame);
		this.exhaustFlames.push(coreFlame);

		this.rocketGroup.add(this.stage1Mesh);

		// --- STAGE 2 & PAYLOAD FAIRING ---
		this.stage2Mesh = new THREE.Group();
		this.stage2Mesh.position.y = 30.5;

		// Stage 2 Tank
		const s2BodyGeo = new THREE.CylinderGeometry(2.38, 2.38, 12, 24);
		const s2Body = new THREE.Mesh(s2BodyGeo, rocketWhite);
		s2Body.position.y = 6;
		this.stage2Mesh.add(s2Body);

		// Payload Fairing (Aerodynamic Nose Cone)
		const fairingGeo = new THREE.ConeGeometry(2.4, 8, 24);
		const fairing = new THREE.Mesh(fairingGeo, rocketWhite);
		fairing.position.y = 16;
		this.stage2Mesh.add(fairing);

		// STARK-07 Green Accent Band
		const stripeGeo = new THREE.CylinderGeometry(2.42, 2.42, 0.6, 24);
		const stripe = new THREE.Mesh(stripeGeo, stripeMat);
		stripe.position.y = 11.8;
		this.stage2Mesh.add(stripe);

		// RCS Thruster Puffs (4 ports on Stage 2)
		const rcsPuffGeo = new THREE.ConeGeometry(0.3, 1.2, 8);
		for (let i = 0; i < 4; i++) {
			const a = (i * Math.PI) / 2;
			const rcs = new THREE.Mesh(rcsPuffGeo, new THREE.MeshBasicMaterial({ color: 0xddeeff, transparent: true, opacity: 0.8 }));
			rcs.position.set(Math.cos(a) * 2.5, 9, Math.sin(a) * 2.5);
			rcs.rotation.z = Math.PI / 2;
			rcs.rotation.y = a;
			rcs.visible = false;
			this.stage2Mesh.add(rcs);
			this.rcsPuffs.push(rcs);
		}

		this.rocketGroup.add(this.stage2Mesh);

		// Smoke Particle System
		this.smokeGeo = new THREE.BufferGeometry();
		this.smokeGeo.setAttribute("position", new THREE.BufferAttribute(this.smokePositions, 3));
		const smokeMat = new THREE.PointsMaterial({
			color: 0xcccccc,
			size: 8,
			transparent: true,
			opacity: 0.45
		});
		this.smokeParticles = new THREE.Points(this.smokeGeo, smokeMat);
		this.scene.add(this.smokeParticles);

		this.rocketGroup.visible = false;
		this.scene.add(this.rocketGroup);
	}

	private setupHUD() {
		if (document.getElementById("stark-rocket-hud-container")) return;

		const container = document.createElement("div");
		container.id = "stark-rocket-hud-container";
		container.style.cssText = `
			position: fixed;
			bottom: 24px;
			right: 24px;
			z-index: 99998;
			display: none;
			flex-direction: column;
			align-items: flex-end;
			gap: 8px;
			pointer-events: none;
			user-select: none;
			font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Share Tech", monospace;
		`;

		const hudBox = document.createElement("div");
		hudBox.style.cssText = `
			width: 290px;
			height: 250px;
			border-radius: 12px;
			background: rgba(9, 14, 22, 0.92);
			border: 1.5px solid rgba(72, 192, 255, 0.4);
			box-shadow: 0 0 30px rgba(72, 192, 255, 0.2), 0 8px 32px rgba(0, 0, 0, 0.7);
			backdrop-filter: blur(14px);
			-webkit-backdrop-filter: blur(14px);
			overflow: hidden;
			position: relative;
		`;

		const canvas = document.createElement("canvas");
		canvas.width = 580;
		canvas.height = 500;
		canvas.style.cssText = "width: 100%; height: 100%; display: block;";
		hudBox.appendChild(canvas);
		this.hudCanvas = canvas;
		this.hudCtx = canvas.getContext("2d");

		const banner = document.createElement("div");
		banner.style.cssText = `
			display: flex;
			align-items: center;
			justify-content: space-between;
			width: 290px;
			padding: 6px 12px;
			background: rgba(9, 14, 22, 0.85);
			border: 1px solid rgba(255, 255, 255, 0.12);
			border-radius: 8px;
			color: #48c0ff;
			font-size: 11px;
			font-weight: 600;
			letter-spacing: 0.8px;
		`;
		banner.innerHTML = `
			<span>ORBITAL TELEMETRY</span>
			<span id="stark-rocket-stage-tag" style="color: #7ce38b;">STAGE 1 PRE-LAUNCH</span>
		`;

		container.appendChild(banner);
		container.appendChild(hudBox);
		document.body.appendChild(container);
		this.domContainer = container;
	}

	private setupInputListeners() {
		window.addEventListener("keydown", (e) => {
			this.keys[e.code] = true;
			if (e.code === "KeyC" && this.enabled) {
				this.cycleCamera();
			}
			if (e.code === "KeyF" && this.enabled) {
				this.autopilot = !this.autopilot;
			}
			if (e.code === "KeyX" && this.enabled && this.stage === 1) {
				this.separateBooster();
			}
		});

		window.addEventListener("keyup", (e) => {
			this.keys[e.code] = false;
		});
	}

	cycleCamera() {
		if (this.activeCameraMode === "chase") this.activeCameraMode = "orbital";
		else if (this.activeCameraMode === "orbital") this.activeCameraMode = "pad";
		else this.activeCameraMode = "chase";
	}

	activate() {
		this.enabled = true;
		this.rocketGroup.visible = true;
		this.spaceGroup.visible = true;
		if (this.domContainer) {
			this.domContainer.style.display = "flex";
		}

		// Initialize on Launch Pad
		this.pos.copy(this.padLocation).add(new THREE.Vector3(0, 6, 0));
		this.vel.set(0, 0, 0);
		this.quat.identity();
		this.throttle = 1.0; // Auto ignition ready
		this.isLaunched = false;
		this.stage = 1;
		this.stage1Mesh.visible = true;
		this.stage2Mesh.position.y = 30.5;
		this.fuelPercent = 100;

		wallpaperAudio.setMode("rocket");
	}

	deactivate() {
		this.enabled = false;
		this.rocketGroup.visible = false;
		this.spaceGroup.visible = false;
		if (this.domContainer) {
			this.domContainer.style.display = "none";
		}
	}

	separateBooster() {
		if (this.stage !== 1) return;
		this.stage = 1 ? 2 : 1;
		// Separate Stage 1
		this.stage1Mesh.visible = false;
		this.stage2Mesh.position.y = 0; // Shift stage 2 to origin
	}

	update(dt: number) {
		if (!this.enabled) return;
		dt = Math.min(dt, 0.05);

		this.handleControls(dt);
		this.updatePhysics(dt);
		this.updateVisuals(dt);
		this.updateCamera(dt);
		this.renderHUD();

		wallpaperAudio.updateRocket(this.throttle, this.altitudeKm, Math.random() > 0.7);
	}

	private handleControls(dt: number) {
		if (this.autopilot) {
			this.runAutopilot(dt);
			return;
		}

		// Manual Throttle: Shift (up) / Ctrl (down) / Space (instant full)
		if (this.keys["ShiftLeft"] || this.keys["ShiftRight"] || this.keys["KeyW"]) {
			this.throttle = Math.min(1.0, this.throttle + 0.45 * dt);
			this.isLaunched = true;
		}
		if (this.keys["ControlLeft"] || this.keys["ControlRight"] || this.keys["KeyS"]) {
			this.throttle = Math.max(0.0, this.throttle - 0.45 * dt);
		}
		if (this.keys["Space"]) {
			this.throttle = 1.0;
			this.isLaunched = true;
		}

		// Gimbal / Steering: Pitch & Yaw
		const pitchRate = ((this.keys["ArrowDown"] ? 1 : 0) - (this.keys["ArrowUp"] ? 1 : 0)) * 0.9 * dt;
		const yawRate = ((this.keys["KeyD"] || this.keys["ArrowRight"] ? 1 : 0) - (this.keys["KeyA"] || this.keys["ArrowLeft"] ? 1 : 0)) * 0.9 * dt;

		const deltaQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitchRate, yawRate, 0, "YXZ"));
		this.quat.multiply(deltaQuat);
		this.quat.normalize();
	}

	private runAutopilot(dt: number) {
		this.isLaunched = true;
		this.throttle = 1.0;

		const alt = this.altitudeKm;
		let targetPitchDeg = 90; // 90 = vertical up

		if (alt < 3) {
			targetPitchDeg = 90; // Vertical climb clear pad
		} else if (alt < 70) {
			// Smooth Gravity Turn towards downrange East (heading 90)
			const turnFrac = (alt - 3) / 67;
			targetPitchDeg = 90 - turnFrac * 68; // pitches down to ~22 deg above horizon
		} else {
			targetPitchDeg = 5; // Orbital horizontal insertion
			if (this.stage === 1) {
				this.separateBooster();
			}
		}

		// Convert target pitch to quaternion
		const pitchRad = ((90 - targetPitchDeg) * Math.PI) / 180;
		const targetQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), pitchRad);
		this.quat.slerp(targetQuat, dt * 0.8);
	}

	private updatePhysics(dt: number) {
		const rocketUp = new THREE.Vector3(0, 1, 0).applyQuaternion(this.quat);

		// Thrust force
		const maxThrust = this.stage === 1 ? 420 : 180;
		const thrust = this.throttle * maxThrust;

		// Atmospheric Drag falls off exponentially with altitude
		const atmosDensity = Math.exp(-this.altitudeKm / 12);
		const speed = this.vel.length();
		const dragCoeff = 0.0008 * atmosDensity;
		const drag = this.vel.clone().multiplyScalar(-dragCoeff * speed * speed);

		// Planetary Gravity
		const gravCoeff = Math.max(0.2, 1.0 - this.altitudeKm / 400);
		const gravity = new THREE.Vector3(0, -9.81 * 4 * gravCoeff, 0);

		const accel = rocketUp.clone().multiplyScalar(thrust).add(drag).add(gravity);
		this.vel.addScaledVector(accel, dt);

		// Launch pad collision
		if (this.pos.y <= this.padLocation.y + 6 && !this.isLaunched) {
			this.pos.y = this.padLocation.y + 6;
			this.vel.set(0, 0, 0);
		} else {
			this.pos.addScaledVector(this.vel, dt);
		}

		// Telemetry Calculations
		const deltaAlt = this.pos.y - this.padLocation.y;
		this.altitudeKm = Math.max(0, deltaAlt / 30);
		this.speedMs = Math.round(speed * 32);
		this.isInOrbit = this.altitudeKm > 80 && this.speedMs > 5500;

		// Calculate Apoapsis / Periapsis approximation
		this.apoapsisKm = Math.round(this.altitudeKm + (this.speedMs * this.speedMs) / (2 * 9.81 * 1000));
		this.periapsisKm = Math.round(Math.max(0, this.altitudeKm - 25));

		// Fuel consumption
		if (this.throttle > 0) {
			this.fuelPercent = Math.max(0, this.fuelPercent - dt * 0.85);
		}
	}

	private updateVisuals(_dt: number) {
		this.rocketGroup.position.copy(this.pos);
		this.rocketGroup.quaternion.copy(this.quat);

		// Update Exhaust Flames
		const flameScale = this.throttle > 0.05 ? 0.8 + this.throttle * 0.8 + Math.random() * 0.2 : 0;
		for (const flame of this.exhaustFlames) {
			flame.scale.set(flameScale, flameScale, flameScale * 1.4);
			flame.visible = this.throttle > 0.05 && this.stage === 1;
		}

		// RCS Puffs animation
		for (const rcs of this.rcsPuffs) {
			rcs.visible = Math.random() > 0.65 && this.altitudeKm > 50;
		}

		// Emit launch smoke particles
		if (this.smokePositions && this.throttle > 0.1 && this.altitudeKm < 40) {
			const idx = this.smokeIndex * 3;
			this.smokePositions[idx] = this.pos.x + (Math.random() - 0.5) * 8;
			this.smokePositions[idx + 1] = this.pos.y - 4 + (Math.random() - 0.5) * 4;
			this.smokePositions[idx + 2] = this.pos.z + (Math.random() - 0.5) * 8;
			this.smokeIndex = (this.smokeIndex + 1) % 300;
			if (this.smokeGeo) {
				this.smokeGeo.attributes.position.needsUpdate = true;
			}
		}
	}

	private updateCamera(_dt: number) {
		if (this.activeCameraMode === "pad") {
			// Ground spectator view of launch pad
			this.camera.position.set(this.padLocation.x + 80, this.padLocation.y + 35, this.padLocation.z + 120);
			this.camera.lookAt(this.pos);
		} else if (this.activeCameraMode === "orbital") {
			// Epic panoramic Earth & space view
			const orbitCamOffset = new THREE.Vector3(120, 45, 120);
			this.camera.position.lerp(this.pos.clone().add(orbitCamOffset), 0.1);
			this.camera.lookAt(this.pos);
		} else {
			// Chase Camera
			const rocketBack = new THREE.Vector3(0, -18, -48).applyQuaternion(this.quat);
			const targetCam = this.pos.clone().add(new THREE.Vector3(0, 15, -45)).add(rocketBack);
			this.camera.position.lerp(targetCam, 0.2);
			this.camera.lookAt(this.pos.clone().add(new THREE.Vector3(0, 10, 0)));
		}
	}

	private renderHUD() {
		if (!this.hudCanvas || !this.hudCtx) return;
		const ctx = this.hudCtx;
		const w = this.hudCanvas.width;
		const h = this.hudCanvas.height;

		ctx.clearRect(0, 0, w, h);

		// Background grid & telemetry boxes
		ctx.fillStyle = "rgba(10, 22, 34, 0.85)";
		ctx.fillRect(20, 20, w - 40, h - 40);

		ctx.strokeStyle = "rgba(72, 192, 255, 0.35)";
		ctx.lineWidth = 2;
		ctx.strokeRect(20, 20, w - 40, h - 40);

		// Title
		ctx.fillStyle = "#48c0ff";
		ctx.font = "bold 26px monospace";
		ctx.textAlign = "left";
		ctx.fillText("SPACE MISSION CONTROL", 42, 60);

		// Altitude & Speed
		ctx.font = "bold 22px monospace";
		ctx.fillStyle = "#e5edf0";
		ctx.fillText(`ALTITUDE:  ${this.altitudeKm.toFixed(1)} KM`, 42, 110);
		ctx.fillText(`VELOCITY:  ${this.speedMs.toLocaleString()} M/S`, 42, 145);

		// Throttle Gauge Bar
		ctx.fillStyle = "#7ce38b";
		ctx.fillText(`THROTTLE:  ${Math.round(this.throttle * 100)}%`, 42, 180);
		ctx.strokeStyle = "#7ce38b";
		ctx.strokeRect(42, 195, 220, 16);
		ctx.fillRect(42, 195, 220 * this.throttle, 16);

		// Fuel Gauge
		ctx.fillStyle = "#ffbd59";
		ctx.fillText(`FUEL:      ${Math.round(this.fuelPercent)}%`, 42, 245);
		ctx.strokeStyle = "#ffbd59";
		ctx.strokeRect(42, 260, 220, 16);
		ctx.fillRect(42, 260, 220 * (this.fuelPercent / 100), 16);

		// Orbital Parameters (Right Column)
		const rightX = w / 2 + 30;
		ctx.fillStyle = "#48c0ff";
		ctx.fillText(`APOAPSIS:  ${this.apoapsisKm} KM`, rightX, 110);
		ctx.fillText(`PERIAPSIS: ${this.periapsisKm} KM`, rightX, 145);

		// Staging & Orbit Status
		ctx.font = "bold 24px monospace";
		ctx.fillStyle = this.isInOrbit ? "#7ce38b" : "#48c0ff";
		ctx.fillText(this.isInOrbit ? "STATUS: STABLE ORBIT" : "STATUS: ASCENT BURN", rightX, 205);

		ctx.font = "bold 20px monospace";
		ctx.fillStyle = "#e5edf0";
		ctx.fillText(`STAGE: ${this.stage} (${this.stage === 1 ? "BOOSTER" : "ORBITAL VAC"})`, rightX, 245);

		// Autopilot & Controls Hint
		ctx.textAlign = "center";
		ctx.font = "bold 20px monospace";
		ctx.fillStyle = this.autopilot ? "#7ce38b" : "#ffbd59";
		ctx.fillText(this.autopilot ? "AUTOPILOT: ORBITAL ASCENT ACTIVE" : "MANUAL GIMBAL CONTROL (WASD / Arrows)", w / 2, h - 45);
	}
}
