import * as THREE from "three";
import { wallpaperAudio } from "./audio";

export interface RunwayInfo {
	id: string;
	name: string;
	position: THREE.Vector3;
	heading: number; // in radians
	length: number;
	width: number;
	elevation: number;
	group: THREE.Group;
}

export class PlaneModeController {
	private scene: THREE.Scene;
	private camera: THREE.PerspectiveCamera;
	private domContainer: HTMLElement | null = null;
	private radarCanvas: HTMLCanvasElement | null = null;
	private radarCtx: CanvasRenderingContext2D | null = null;

	// Plane 3D Mesh
	public planeGroup: THREE.Group = new THREE.Group();
	private afterburnerFlames: THREE.Mesh[] = [];

	// Runways
	public runways: RunwayInfo[] = [];

	// Flight Physics State
	public pos: THREE.Vector3 = new THREE.Vector3(0, 180, 0);
	public vel: THREE.Vector3 = new THREE.Vector3(0, 0, 75);
	public quat: THREE.Quaternion = new THREE.Quaternion();
	public throttle: number = 0.65;
	public airspeedKnots: number = 220;
	public altitudeFeet: number = 2400;
	public headingDeg: number = 0;
	public pitchDeg: number = 0;
	public rollDeg: number = 0;
	public verticalSpeedFpm: number = 0;
	public isGrounded: boolean = false;
	public airbrakes: boolean = false;
	public autopilot: boolean = true;
	public activeCameraMode: "chase" | "cockpit" | "flyby" = "chase";

	// Camera State
	private flybyPos: THREE.Vector3 = new THREE.Vector3();
	private flybyTimer: number = 0;

	// Input Keys
	private keys: Record<string, boolean> = {};
	private enabled: boolean = false;

	constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
		this.scene = scene;
		this.camera = camera;

		this.buildAircraft();
		this.buildRunways();
		this.setupRadarDOM();
		this.setupInputListeners();
	}

	private buildAircraft() {
		this.planeGroup = new THREE.Group();
		this.planeGroup.name = "stark_supersonic_jet";

		// Materials
		const bodyMat = new THREE.MeshStandardMaterial({
			color: 0x1a2430,
			metalness: 0.85,
			roughness: 0.25
		});
		const accentMat = new THREE.MeshStandardMaterial({
			color: 0x7ce38b,
			metalness: 0.5,
			roughness: 0.3,
			emissive: 0x1e4624,
			emissiveIntensity: 0.4
		});
		const glassMat = new THREE.MeshPhysicalMaterial({
			color: 0x05101a,
			metalness: 0.1,
			roughness: 0.1,
			transmission: 0.85,
			transparent: true,
			opacity: 0.85
		});
		const engineMat = new THREE.MeshStandardMaterial({
			color: 0x11161d,
			metalness: 0.95,
			roughness: 0.15
		});

		// 1. Fuselage
		const fuseGeo = new THREE.ConeGeometry(1.4, 15, 16);
		fuseGeo.rotateX(Math.PI / 2);
		const fuselage = new THREE.Mesh(fuseGeo, bodyMat);
		fuselage.scale.set(1.1, 0.75, 1);
		this.planeGroup.add(fuselage);

		// 2. Cockpit Canopy
		const canopyGeo = new THREE.SphereGeometry(1.1, 16, 12);
		canopyGeo.scale(0.7, 0.6, 2.8);
		const canopy = new THREE.Mesh(canopyGeo, glassMat);
		canopy.position.set(0, 0.65, 1.8);
		this.planeGroup.add(canopy);

		// 3. Swept Main Wings
		const wingShape = new THREE.Shape();
		wingShape.moveTo(0, 0);
		wingShape.lineTo(9.5, -4.5);
		wingShape.lineTo(9.8, -5.5);
		wingShape.lineTo(9.0, -5.8);
		wingShape.lineTo(0, -3.2);
		wingShape.closePath();

		const extrudeSettings = { depth: 0.14, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: 0.05, bevelThickness: 0.05 };
		const wingGeo = new THREE.ExtrudeGeometry(wingShape, extrudeSettings);
		wingGeo.rotateX(Math.PI / 2);

		// Right Wing
		const rightWing = new THREE.Mesh(wingGeo, bodyMat);
		rightWing.position.set(0.6, 0.05, 0);
		this.planeGroup.add(rightWing);

		// Left Wing
		const leftWing = rightWing.clone();
		leftWing.scale.x = -1;
		leftWing.position.set(-0.6, 0.05, 0);
		this.planeGroup.add(leftWing);

		// Wingtips Winglets (STARK green accent)
		const wingletGeo = new THREE.BoxGeometry(0.12, 1.2, 0.8);
		const rightWinglet = new THREE.Mesh(wingletGeo, accentMat);
		rightWinglet.position.set(9.7, 0.5, -5.2);
		rightWinglet.rotation.z = -0.25;
		this.planeGroup.add(rightWinglet);

		const leftWinglet = rightWinglet.clone();
		leftWinglet.position.set(-9.7, 0.5, -5.2);
		leftWinglet.rotation.z = 0.25;
		this.planeGroup.add(leftWinglet);

		// 4. Twin Canted Vertical Stabilizers (Fins)
		const finShape = new THREE.Shape();
		finShape.moveTo(0, 0);
		finShape.lineTo(1.2, 3.2);
		finShape.lineTo(0.2, 3.4);
		finShape.lineTo(-1.8, 0);
		finShape.closePath();

		const finGeo = new THREE.ExtrudeGeometry(finShape, { depth: 0.1, bevelEnabled: false });

		const rightFin = new THREE.Mesh(finGeo, bodyMat);
		rightFin.position.set(1.2, 0.2, -4.5);
		rightFin.rotation.y = Math.PI / 2;
		rightFin.rotation.x = -0.28; // canted outwards
		this.planeGroup.add(rightFin);

		const leftFin = rightFin.clone();
		leftFin.position.set(-1.2, 0.2, -4.5);
		leftFin.rotation.x = 0.28;
		this.planeGroup.add(leftFin);

		// 5. Dual Jet Engines & Exhaust Nozzles
		const nacelleGeo = new THREE.CylinderGeometry(0.65, 0.72, 5.5, 16);
		nacelleGeo.rotateX(Math.PI / 2);

		const rightEngine = new THREE.Mesh(nacelleGeo, engineMat);
		rightEngine.position.set(1.4, -0.2, -3.2);
		this.planeGroup.add(rightEngine);

		const leftEngine = rightEngine.clone();
		leftEngine.position.set(-1.4, -0.2, -3.2);
		this.planeGroup.add(leftEngine);

		// Afterburner Flames
		const flameGeo = new THREE.ConeGeometry(0.55, 3.8, 12);
		flameGeo.rotateX(-Math.PI / 2);
		const flameMat = new THREE.MeshBasicMaterial({
			color: 0x48c0ff,
			transparent: true,
			opacity: 0.85
		});

		const rightFlame = new THREE.Mesh(flameGeo, flameMat);
		rightFlame.position.set(1.4, -0.2, -6.5);
		this.planeGroup.add(rightFlame);
		this.afterburnerFlames.push(rightFlame);

		const leftFlame = rightFlame.clone();
		leftFlame.position.set(-1.4, -0.2, -6.5);
		this.planeGroup.add(leftFlame);
		this.afterburnerFlames.push(leftFlame);

		// Navigation Lights
		const greenLight = new THREE.PointLight(0x22ff66, 2, 25);
		greenLight.position.set(9.7, 0.6, -5.2);
		this.planeGroup.add(greenLight);

		const redLight = new THREE.PointLight(0xff2244, 2, 25);
		redLight.position.set(-9.7, 0.6, -5.2);
		this.planeGroup.add(redLight);

		// Scale and add to scene
		this.planeGroup.scale.set(1.2, 1.2, 1.2);
		this.planeGroup.visible = false;
		this.scene.add(this.planeGroup);
	}

	private buildRunways() {
		// Define 2 realistic procedural runways integrated with the map
		const configs = [
			{
				id: "RWY-09",
				name: "STARK FIELD 09L",
				pos: new THREE.Vector3(120, 28, 400),
				heading: 0.12, // near East
				length: 1200,
				width: 55,
				elevation: 28.5
			},
			{
				id: "RWY-27",
				name: "VALLEY AIRSTRIP 27R",
				pos: new THREE.Vector3(-950, 42, 2600),
				heading: -1.45, // near West
				length: 1050,
				width: 48,
				elevation: 42.5
			}
		];

		for (const cfg of configs) {
			const rwGroup = new THREE.Group();
			rwGroup.position.copy(cfg.pos);
			rwGroup.rotation.y = cfg.heading;

			// 1. Asphalt Surface
			const tarmacGeo = new THREE.BoxGeometry(cfg.width, 0.6, cfg.length);
			const tarmacMat = new THREE.MeshStandardMaterial({
				color: 0x181c20,
				roughness: 0.88,
				metalness: 0.12
			});
			const tarmac = new THREE.Mesh(tarmacGeo, tarmacMat);
			tarmac.receiveShadow = true;
			rwGroup.add(tarmac);

			// 2. Centerline Dashes
			const numDashes = Math.floor(cfg.length / 28);
			const dashGeo = new THREE.PlaneGeometry(1.8, 14);
			dashGeo.rotateX(-Math.PI / 2);
			const whiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

			for (let i = -numDashes / 2 + 2; i < numDashes / 2 - 2; i++) {
				const dash = new THREE.Mesh(dashGeo, whiteMat);
				dash.position.set(0, 0.32, i * 28);
				rwGroup.add(dash);
			}

			// 3. Threshold Markings (Zebra Piano Keys)
			const numBars = 10;
			const barGeo = new THREE.PlaneGeometry(2.2, 24);
			barGeo.rotateX(-Math.PI / 2);
			const barSpacing = (cfg.width - 8) / (numBars - 1);

			for (const endSign of [-1, 1]) {
				const endZ = (cfg.length / 2 - 22) * endSign;
				for (let b = 0; b < numBars; b++) {
					const bar = new THREE.Mesh(barGeo, whiteMat);
					bar.position.set(-cfg.width / 2 + 4 + b * barSpacing, 0.32, endZ);
					rwGroup.add(bar);
				}
			}

			// 4. Threshold Numbers (09 & 27 Canvas Textures)
			this.createRunwayNumberMesh(rwGroup, "09", 0, 0.33, -cfg.length / 2 + 65, 0);
			this.createRunwayNumberMesh(rwGroup, "27", 0, 0.33, cfg.length / 2 - 65, Math.PI);

			// 5. Runway Edge Lights & Threshold Beacons
			const numLights = Math.floor(cfg.length / 35);
			const lightGeo = new THREE.CylinderGeometry(0.18, 0.22, 0.7, 8);
			const whiteLightMat = new THREE.MeshBasicMaterial({ color: 0xfff6dd });
			const greenLightMat = new THREE.MeshBasicMaterial({ color: 0x33ff66 });
			const redLightMat = new THREE.MeshBasicMaterial({ color: 0xff2222 });

			for (let l = -numLights / 2; l <= numLights / 2; l++) {
				const zPos = l * 35;
				const isNearEnd = Math.abs(zPos) > cfg.length / 2 - 40;
				const mat = isNearEnd ? (zPos > 0 ? redLightMat : greenLightMat) : whiteLightMat;

				// Right edge light
				const rLight = new THREE.Mesh(lightGeo, mat);
				rLight.position.set(cfg.width / 2 + 1.2, 0.45, zPos);
				rwGroup.add(rLight);

				// Left edge light
				const lLight = new THREE.Mesh(lightGeo, mat);
				lLight.position.set(-cfg.width / 2 - 1.2, 0.45, zPos);
				rwGroup.add(lLight);
			}

			// 6. Approach Light Stanchions (ALS)
			const alsStanchionGeo = new THREE.BoxGeometry(0.3, 1.2, 0.3);
			for (let a = 1; a <= 8; a++) {
				const dist = cfg.length / 2 + a * 35;
				const stanchion = new THREE.Mesh(alsStanchionGeo, whiteLightMat);
				stanchion.position.set(0, 0.6, -dist);
				rwGroup.add(stanchion);

				const crossbarGeo = new THREE.BoxGeometry(8, 0.2, 0.2);
				const crossbar = new THREE.Mesh(crossbarGeo, whiteLightMat);
				crossbar.position.set(0, 1.2, -dist);
				rwGroup.add(crossbar);
			}

			this.scene.add(rwGroup);

			this.runways.push({
				id: cfg.id,
				name: cfg.name,
				position: cfg.pos,
				heading: cfg.heading,
				length: cfg.length,
				width: cfg.width,
				elevation: cfg.elevation,
				group: rwGroup
			});
		}
	}

	private createRunwayNumberMesh(parent: THREE.Group, numStr: string, x: number, y: number, z: number, rotY: number) {
		const canvas = document.createElement("canvas");
		canvas.width = 128;
		canvas.height = 256;
		const ctx = canvas.getContext("2d");
		if (ctx) {
			ctx.fillStyle = "#ffffff";
			ctx.font = "bold 160px sans-serif";
			ctx.textAlign = "center";
			ctx.textBaseline = "middle";
			ctx.fillText(numStr, 64, 128);
		}
		const texture = new THREE.CanvasTexture(canvas);
		const geo = new THREE.PlaneGeometry(12, 24);
		geo.rotateX(-Math.PI / 2);
		const mat = new THREE.MeshBasicMaterial({ map: texture, transparent: true });
		const mesh = new THREE.Mesh(geo, mat);
		mesh.position.set(x, y, z);
		mesh.rotation.y = rotY;
		parent.add(mesh);
	}

	private setupRadarDOM() {
		if (document.getElementById("stark-plane-radar-container")) return;

		const container = document.createElement("div");
		container.id = "stark-plane-radar-container";
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

		const radarBox = document.createElement("div");
		radarBox.id = "stark-plane-radar-box";
		radarBox.style.cssText = `
			position: relative;
			width: 270px;
			height: 270px;
			border-radius: 50%;
			background: radial-gradient(circle, rgba(12, 24, 30, 0.92) 0%, rgba(6, 12, 16, 0.95) 75%, rgba(4, 8, 11, 0.98) 100%);
			border: 2px solid rgba(124, 227, 139, 0.45);
			box-shadow: 0 0 25px rgba(124, 227, 139, 0.2), 0 8px 32px rgba(0, 0, 0, 0.7);
			backdrop-filter: blur(12px);
			-webkit-backdrop-filter: blur(12px);
			overflow: hidden;
		`;

		const canvas = document.createElement("canvas");
		canvas.id = "stark-plane-radar-canvas";
		canvas.width = 540;
		canvas.height = 540;
		canvas.style.cssText = `
			width: 100%;
			height: 100%;
			display: block;
		`;
		radarBox.appendChild(canvas);
		this.radarCanvas = canvas;
		this.radarCtx = canvas.getContext("2d");

		// Header telemetry banner
		const banner = document.createElement("div");
		banner.id = "stark-plane-banner";
		banner.style.cssText = `
			display: flex;
			align-items: center;
			justify-content: space-between;
			width: 270px;
			padding: 6px 12px;
			background: rgba(8, 14, 18, 0.85);
			border: 1px solid rgba(255, 255, 255, 0.12);
			border-radius: 8px;
			color: #7ce38b;
			font-size: 11px;
			font-weight: 600;
			letter-spacing: 0.8px;
			box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
		`;
		banner.innerHTML = `
			<span>ILS / TACTICAL RADAR</span>
			<span id="stark-plane-ils-status" style="color: #48c0ff;">LOC / GS ACTIVE</span>
		`;

		container.appendChild(banner);
		container.appendChild(radarBox);
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
		});

		window.addEventListener("keyup", (e) => {
			this.keys[e.code] = false;
		});
	}

	cycleCamera() {
		if (this.activeCameraMode === "chase") this.activeCameraMode = "cockpit";
		else if (this.activeCameraMode === "cockpit") this.activeCameraMode = "flyby";
		else this.activeCameraMode = "chase";
	}

	activate() {
		this.enabled = true;
		this.planeGroup.visible = true;
		if (this.domContainer) {
			this.domContainer.style.display = "flex";
		}
		// Set initial takeoff position aligned with Runway 1
		const rw = this.runways[0];
		if (rw) {
			this.pos.copy(rw.position).add(new THREE.Vector3(0, 85, -200));
			this.vel.set(0, 0, 85).applyAxisAngle(new THREE.Vector3(0, 1, 0), rw.heading);
			this.quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rw.heading);
		}
		wallpaperAudio.setMode("plane");
	}

	deactivate() {
		this.enabled = false;
		this.planeGroup.visible = false;
		if (this.domContainer) {
			this.domContainer.style.display = "none";
		}
	}

	update(dt: number) {
		if (!this.enabled) return;
		dt = Math.min(dt, 0.05);

		this.handleFlightControls(dt);
		this.updatePhysics(dt);
		this.updateVisuals(dt);
		this.updateCamera(dt);
		this.renderRadar();

		// Update Audio
		const isAfterburner = this.throttle > 0.88;
		wallpaperAudio.updatePlane(this.throttle, this.airspeedKnots, isAfterburner);
	}

	private handleFlightControls(dt: number) {
		if (this.autopilot) {
			this.runAutopilot(dt);
			return;
		}

		// Throttle: Shift (up) / Ctrl (down)
		if (this.keys["ShiftLeft"] || this.keys["ShiftRight"]) {
			this.throttle = Math.min(1.0, this.throttle + 0.35 * dt);
		}
		if (this.keys["ControlLeft"] || this.keys["ControlRight"]) {
			this.throttle = Math.max(0.12, this.throttle - 0.35 * dt);
		}

		// Pitch: W / S or ArrowUp / ArrowDown
		const pitchInput = (this.keys["KeyS"] || this.keys["ArrowDown"] ? 1 : 0) -
		                   (this.keys["KeyW"] || this.keys["ArrowUp"] ? 1 : 0);

		// Roll: A / D or ArrowLeft / ArrowRight
		const rollInput = (this.keys["KeyD"] || this.keys["ArrowRight"] ? 1 : 0) -
		                  (this.keys["KeyA"] || this.keys["ArrowLeft"] ? 1 : 0);

		// Rudder / Yaw: Q / E
		const yawInput = (this.keys["KeyE"] ? 1 : 0) - (this.keys["KeyQ"] ? 1 : 0);

		// Airbrakes / Wheel Brakes: Space
		this.airbrakes = !!this.keys["Space"];

		// Apply control surface rotations
		const pitchRate = pitchInput * 1.6 * dt;
		const rollRate = rollInput * 2.8 * dt;
		const yawRate = (yawInput * 0.9 - rollInput * 0.35) * dt;

		const deltaQuat = new THREE.Quaternion();
		deltaQuat.setFromEuler(new THREE.Euler(pitchRate, yawRate, -rollRate, "YXZ"));
		this.quat.multiply(deltaQuat);
		this.quat.normalize();
	}

	private runAutopilot(dt: number) {
		// Target nearest runway approach path or scenic highway cruising
		const rw = this.runways[0];
		if (!rw) return;

		// ILS localizer & glideslope waypoint targeting
		const targetAlt = 150;
		const targetSpeed = 82;

		if (this.vel.length() < targetSpeed) {
			this.throttle = THREE.MathUtils.lerp(this.throttle, 0.72, dt * 0.5);
		} else {
			this.throttle = THREE.MathUtils.lerp(this.throttle, 0.65, dt * 0.5);
		}

		// Calculate desired heading towards runway approach cone
		const toRw = new THREE.Vector3().subVectors(rw.position, this.pos);
		const dist = Math.sqrt(toRw.x * toRw.x + toRw.z * toRw.z);

		let desiredHeading = rw.heading;
		if (dist > 800) {
			// Scenic orbit / valley hold
			const orbitAngle = Date.now() * 0.0003;
			const targetX = rw.position.x + Math.cos(orbitAngle) * 900;
			const targetZ = rw.position.z + Math.sin(orbitAngle) * 900;
			desiredHeading = Math.atan2(targetX - this.pos.x, targetZ - this.pos.z);
		}

		// Smoothly steer towards desired heading & pitch
		const currentEuler = new THREE.Euler().setFromQuaternion(this.quat, "YXZ");
		const headingDiff = THREE.MathUtils.euclideanModulo(desiredHeading - currentEuler.y + Math.PI, Math.PI * 2) - Math.PI;

		const targetRoll = THREE.MathUtils.clamp(-headingDiff * 1.8, -0.65, 0.65);
		const altError = targetAlt - this.pos.y;
		const targetPitch = THREE.MathUtils.clamp(altError * 0.02, -0.35, 0.35);

		currentEuler.z = THREE.MathUtils.lerp(currentEuler.z, targetRoll, dt * 1.8);
		currentEuler.x = THREE.MathUtils.lerp(currentEuler.x, targetPitch, dt * 1.2);
		currentEuler.y += headingDiff * dt * 0.9;

		this.quat.setFromEuler(currentEuler);
	}

	private updatePhysics(dt: number) {
		const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.quat);
		const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.quat);

		// Thrust
		const maxThrust = 160;
		const thrust = this.throttle * maxThrust * (this.throttle > 0.88 ? 1.4 : 1.0);

		// Aerodynamic drag
		const dragCoeff = this.airbrakes ? 0.0035 : 0.0016;
		const speed = this.vel.length();
		const drag = this.vel.clone().multiplyScalar(-dragCoeff * speed);

		// Lift (acts perpendicular to forward along the local up axis)
		const liftCoeff = 0.019;
		const liftMagnitude = Math.min(speed * speed * liftCoeff, 220);
		const lift = up.clone().multiplyScalar(liftMagnitude);

		// Gravity
		const gravity = new THREE.Vector3(0, -9.81 * 8, 0);

		// Total Acceleration
		const accel = forward.clone().multiplyScalar(thrust).add(drag).add(lift).add(gravity);
		this.vel.addScaledVector(accel, dt);

		// Ground Contact / Runway Collision
		const groundElevation = 28.5; // match runway level
		if (this.pos.y <= groundElevation + 1.2) {
			this.pos.y = groundElevation + 1.2;
			this.isGrounded = true;
			if (this.vel.y < 0) this.vel.y = 0;
			// Ground friction / wheel rolling resistance
			const friction = this.airbrakes ? 0.92 : 0.985;
			this.vel.x *= friction;
			this.vel.z *= friction;
		} else {
			this.isGrounded = false;
		}

		// Integrate Position
		this.pos.addScaledVector(this.vel, dt);

		// Update Telemetry
		this.airspeedKnots = Math.round(speed * 1.94384);
		this.altitudeFeet = Math.round(this.pos.y * 3.28084 * 4);
		this.verticalSpeedFpm = Math.round(this.vel.y * 196.85);

		const euler = new THREE.Euler().setFromQuaternion(this.quat, "YXZ");
		this.headingDeg = Math.round(((-euler.y * 180 / Math.PI) + 360) % 360);
		this.pitchDeg = Math.round(euler.x * 180 / Math.PI);
		this.rollDeg = Math.round(-euler.z * 180 / Math.PI);
	}

	private updateVisuals(_dt: number) {
		this.planeGroup.position.copy(this.pos);
		this.planeGroup.quaternion.copy(this.quat);

		// Afterburner flame pulsation & scale
		const flameScale = this.throttle > 0.88 ? 1.4 + Math.random() * 0.25 : this.throttle * 0.8;
		for (const flame of this.afterburnerFlames) {
			flame.scale.set(flameScale, flameScale, flameScale * 1.2);
			flame.visible = this.throttle > 0.2;
		}
	}

	private updateCamera(dt: number) {
		if (this.activeCameraMode === "cockpit") {
			const cockpitOffset = new THREE.Vector3(0, 0.8, 1.6).applyQuaternion(this.quat);
			this.camera.position.copy(this.pos).add(cockpitOffset);
			const lookTarget = this.pos.clone().add(new THREE.Vector3(0, 0.5, 40).applyQuaternion(this.quat));
			this.camera.lookAt(lookTarget);
		} else if (this.activeCameraMode === "flyby") {
			this.flybyTimer += dt;
			if (this.flybyTimer > 6.0 || this.flybyPos.distanceTo(this.pos) > 400) {
				this.flybyTimer = 0;
				// Place camera ahead and to the side of the aircraft
				const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.quat);
				const side = new THREE.Vector3(1, 0, 0).applyQuaternion(this.quat);
				this.flybyPos.copy(this.pos).add(forward.multiplyScalar(120)).add(side.multiplyScalar(50)).add(new THREE.Vector3(0, 20, 0));
			}
			this.camera.position.copy(this.flybyPos);
			this.camera.lookAt(this.pos);
		} else {
			// Chase Camera (default)
			const chaseDist = 22;
			const chaseHeight = 4.8;
			const behind = new THREE.Vector3(0, chaseHeight, -chaseDist).applyQuaternion(this.quat);
			const targetCamPos = this.pos.clone().add(behind);

			this.camera.position.lerp(targetCamPos, 0.18);
			const lookAhead = this.pos.clone().add(new THREE.Vector3(0, 1.2, 12).applyQuaternion(this.quat));
			this.camera.lookAt(lookAhead);
		}
	}

	private renderRadar() {
		if (!this.radarCanvas || !this.radarCtx) return;
		const ctx = this.radarCtx;
		const w = this.radarCanvas.width;
		const h = this.radarCanvas.height;
		const cx = w / 2;
		const cy = h / 2;
		const radius = w / 2 - 20;

		ctx.clearRect(0, 0, w, h);

		// 1. Radar Background & Glow
		const grad = ctx.createRadialGradient(cx, cy, 10, cx, cy, radius);
		grad.addColorStop(0, "rgba(8, 28, 24, 0.85)");
		grad.addColorStop(0.7, "rgba(5, 18, 16, 0.92)");
		grad.addColorStop(1, "rgba(2, 10, 8, 0.98)");
		ctx.fillStyle = grad;
		ctx.beginPath();
		ctx.arc(cx, cy, radius, 0, Math.PI * 2);
		ctx.fill();

		// 2. Range Rings (2 NM, 5 NM, 10 NM)
		ctx.strokeStyle = "rgba(124, 227, 139, 0.22)";
		ctx.lineWidth = 1.5;
		for (const rFrac of [0.3, 0.6, 0.95]) {
			ctx.beginPath();
			ctx.arc(cx, cy, radius * rFrac, 0, Math.PI * 2);
			ctx.stroke();
		}

		// 3. Compass Crosshairs
		ctx.strokeStyle = "rgba(124, 227, 139, 0.18)";
		ctx.beginPath();
		ctx.moveTo(cx - radius, cy);
		ctx.lineTo(cx + radius, cy);
		ctx.moveTo(cx, cy - radius);
		ctx.lineTo(cx, cy + radius);
		ctx.stroke();

		// Radar Sweep Beam
		const sweepAngle = (Date.now() * 0.0022) % (Math.PI * 2);
		ctx.save();
		ctx.translate(cx, cy);
		ctx.rotate(sweepAngle);
		const sweepGrad = ctx.createLinearGradient(0, 0, radius, 0);
		sweepGrad.addColorStop(0, "rgba(124, 227, 139, 0.4)");
		sweepGrad.addColorStop(1, "rgba(124, 227, 139, 0.0)");
		ctx.fillStyle = sweepGrad;
		ctx.beginPath();
		ctx.moveTo(0, 0);
		ctx.arc(0, 0, radius, 0, 0.45);
		ctx.closePath();
		ctx.fill();
		ctx.restore();

		// Scale: Map 3000m to radius
		const radarScale = radius / 3200;

		// 4. Render Runways & Approach Lines on Radar
		for (const rw of this.runways) {
			const relX = rw.position.x - this.pos.x;
			const relZ = rw.position.z - this.pos.z;

			// Invert Z for screen coords
			const rwScreenX = cx + relX * radarScale;
			const rwScreenY = cy - relZ * radarScale;

			// If within radar display circle
			const distFromCenter = Math.hypot(rwScreenX - cx, rwScreenY - cy);
			if (distFromCenter < radius - 15) {
				ctx.save();
				ctx.translate(rwScreenX, rwScreenY);
				ctx.rotate(-rw.heading);

				// Draw Runway Rectangle
				const rwDispLen = rw.length * radarScale;
				const rwDispWidth = Math.max(6, rw.width * radarScale);

				ctx.fillStyle = "#ffffff";
				ctx.shadowColor = "#7ce38b";
				ctx.shadowBlur = 8;
				ctx.fillRect(-rwDispWidth / 2, -rwDispLen / 2, rwDispWidth, rwDispLen);

				// Draw Extended Approach Centerline & Glideslope Funnel
				ctx.strokeStyle = "rgba(72, 192, 255, 0.85)";
				ctx.lineWidth = 2;
				ctx.setLineDash([8, 6]);

				// Extended centerline extending 1200m before threshold
				const approachExt = 1200 * radarScale;
				ctx.beginPath();
				ctx.moveTo(0, -rwDispLen / 2);
				ctx.lineTo(0, -rwDispLen / 2 - approachExt);
				ctx.stroke();

				// Approach Funnel Cone (ILS capture sector)
				ctx.setLineDash([]);
				ctx.strokeStyle = "rgba(124, 227, 139, 0.45)";
				ctx.beginPath();
				ctx.moveTo(0, -rwDispLen / 2);
				ctx.lineTo(-24, -rwDispLen / 2 - approachExt);
				ctx.moveTo(0, -rwDispLen / 2);
				ctx.lineTo(24, -rwDispLen / 2 - approachExt);
				ctx.stroke();

				// Approach Fix Waypoints (FAF, 3NM)
				ctx.fillStyle = "#48c0ff";
				ctx.beginPath();
				ctx.arc(0, -rwDispLen / 2 - approachExt * 0.5, 4, 0, Math.PI * 2);
				ctx.arc(0, -rwDispLen / 2 - approachExt, 4, 0, Math.PI * 2);
				ctx.fill();

				// Runway Identifier Text
				ctx.fillStyle = "#7ce38b";
				ctx.font = "bold 18px monospace";
				ctx.textAlign = "center";
				ctx.fillText(rw.id, 0, rwDispLen / 2 + 20);

				ctx.restore();
			}
		}

		// 5. Aircraft Symbol (Center)
		ctx.save();
		ctx.translate(cx, cy);
		const currentEuler = new THREE.Euler().setFromQuaternion(this.quat, "YXZ");
		ctx.rotate(-currentEuler.y);

		// Aircraft Icon (Delta Wing Symbol)
		ctx.fillStyle = "#7ce38b";
		ctx.shadowColor = "#7ce38b";
		ctx.shadowBlur = 12;
		ctx.beginPath();
		ctx.moveTo(0, -14);
		ctx.lineTo(12, 10);
		ctx.lineTo(0, 5);
		ctx.lineTo(-12, 10);
		ctx.closePath();
		ctx.fill();

		// Velocity Vector Track Line
		ctx.strokeStyle = "#48c0ff";
		ctx.lineWidth = 2.5;
		ctx.beginPath();
		ctx.moveTo(0, -14);
		ctx.lineTo(0, -38);
		ctx.stroke();
		ctx.restore();

		// 6. Flight Data Overlays
		ctx.fillStyle = "#7ce38b";
		ctx.font = "bold 20px monospace";
		ctx.textAlign = "left";
		ctx.fillText(`IAS: ${this.airspeedKnots} KT`, 24, 45);
		ctx.fillText(`ALT: ${this.altitudeFeet} FT`, 24, 72);

		ctx.textAlign = "right";
		ctx.fillText(`HDG: ${String(this.headingDeg).padStart(3, "0")}°`, w - 24, 45);
		ctx.fillText(`V/S: ${this.verticalSpeedFpm > 0 ? "+" : ""}${this.verticalSpeedFpm}`, w - 24, 72);

		// Autopilot & Distance to Touchdown
		ctx.textAlign = "center";
		ctx.font = "bold 18px monospace";
		ctx.fillStyle = this.autopilot ? "#7ce38b" : "#ffbd59";
		ctx.fillText(this.autopilot ? "AUTO FLIGHT: ON" : "MANUAL PILOT", cx, h - 22);
	}
}
