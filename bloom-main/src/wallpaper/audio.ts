// Dynamic Web Audio synthesizer for Jet Plane and Space Rocket sounds

class WallpaperAudioEngine {
	private ctx: AudioContext | null = null;
	private masterGain: GainNode | null = null;

	// Plane audio nodes
	private jetOsc: OscillatorNode | null = null;
	private jetGain: GainNode | null = null;
	private jetNoiseGain: GainNode | null = null;
	private jetFilter: BiquadFilterNode | null = null;

	// Rocket audio nodes
	private rocketNoiseGain: GainNode | null = null;
	private rocketRumbleOsc: OscillatorNode | null = null;
	private rocketGain: GainNode | null = null;
	private rocketFilter: BiquadFilterNode | null = null;
	private rcsGain: GainNode | null = null;

	private isMuted: boolean = false;
	private volume: number = 0.15;
	private currentMode: "car" | "plane" | "rocket" = "car";

	init() {
		if (this.ctx) return;
		try {
			const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
			if (!AudioCtx) return;
			this.ctx = new AudioCtx();

			this.masterGain = this.ctx.createGain();
			this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : this.volume, this.ctx.currentTime);
			this.masterGain.connect(this.ctx.destination);

			this.setupJetEngine();
			this.setupRocketEngine();
		} catch (e) {
			console.warn("AudioContext init failed:", e);
		}
	}

	private createNoiseBuffer(): AudioBuffer {
		if (!this.ctx) throw new Error("No ctx");
		const bufferSize = this.ctx.sampleRate * 2;
		const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
		const data = buffer.getChannelData(0);
		for (let i = 0; i < bufferSize; i++) {
			data[i] = Math.random() * 2 - 1;
		}
		return buffer;
	}

	private setupJetEngine() {
		if (!this.ctx || !this.masterGain) return;

		// 1. Turbine whine (high frequency whistle)
		this.jetOsc = this.ctx.createOscillator();
		this.jetOsc.type = "sawtooth";
		this.jetOsc.frequency.setValueAtTime(450, this.ctx.currentTime);

		const jetOscFilter = this.ctx.createBiquadFilter();
		jetOscFilter.type = "bandpass";
		jetOscFilter.frequency.setValueAtTime(900, this.ctx.currentTime);
		jetOscFilter.Q.setValueAtTime(3.5, this.ctx.currentTime);

		// 2. Air rush / exhaust roar
		const noise = this.ctx.createBufferSource();
		noise.buffer = this.createNoiseBuffer();
		noise.loop = true;

		this.jetFilter = this.ctx.createBiquadFilter();
		this.jetFilter.type = "lowpass";
		this.jetFilter.frequency.setValueAtTime(800, this.ctx.currentTime);

		this.jetNoiseGain = this.ctx.createGain();
		this.jetNoiseGain.gain.setValueAtTime(0, this.ctx.currentTime);

		this.jetGain = this.ctx.createGain();
		this.jetGain.gain.setValueAtTime(0, this.ctx.currentTime);

		this.jetOsc.connect(jetOscFilter);
		jetOscFilter.connect(this.jetGain);

		noise.connect(this.jetFilter);
		this.jetFilter.connect(this.jetNoiseGain);
		this.jetNoiseGain.connect(this.jetGain);

		this.jetGain.connect(this.masterGain);

		this.jetOsc.start();
		noise.start();
	}

	private setupRocketEngine() {
		if (!this.ctx || !this.masterGain) return;

		// 1. Deep rumble sub-bass oscillator
		this.rocketRumbleOsc = this.ctx.createOscillator();
		this.rocketRumbleOsc.type = "sine";
		this.rocketRumbleOsc.frequency.setValueAtTime(45, this.ctx.currentTime);

		// 2. Heavy roaring rocket blast noise
		const noise = this.ctx.createBufferSource();
		noise.buffer = this.createNoiseBuffer();
		noise.loop = true;

		this.rocketFilter = this.ctx.createBiquadFilter();
		this.rocketFilter.type = "lowpass";
		this.rocketFilter.frequency.setValueAtTime(400, this.ctx.currentTime);

		this.rocketNoiseGain = this.ctx.createGain();
		this.rocketNoiseGain.gain.setValueAtTime(0, this.ctx.currentTime);

		this.rocketGain = this.ctx.createGain();
		this.rocketGain.gain.setValueAtTime(0, this.ctx.currentTime);

		// 3. RCS thruster noise
		const rcsNoise = this.ctx.createBufferSource();
		rcsNoise.buffer = this.createNoiseBuffer();
		rcsNoise.loop = true;

		const rcsFilter = this.ctx.createBiquadFilter();
		rcsFilter.type = "highpass";
		rcsFilter.frequency.setValueAtTime(2500, this.ctx.currentTime);

		this.rcsGain = this.ctx.createGain();
		this.rcsGain.gain.setValueAtTime(0, this.ctx.currentTime);

		rcsNoise.connect(rcsFilter);
		rcsFilter.connect(this.rcsGain);
		this.rcsGain.connect(this.masterGain);

		this.rocketRumbleOsc.connect(this.rocketGain);
		noise.connect(this.rocketFilter);
		this.rocketFilter.connect(this.rocketNoiseGain);
		this.rocketNoiseGain.connect(this.rocketGain);

		this.rocketGain.connect(this.masterGain);

		this.rocketRumbleOsc.start();
		noise.start();
		rcsNoise.start();
	}

	setMode(mode: "car" | "plane" | "rocket") {
		this.currentMode = mode;
		if (!this.ctx) return;
		const now = this.ctx.currentTime;

		if (mode !== "plane" && this.jetGain) {
			this.jetGain.gain.setTargetAtTime(0, now, 0.2);
		}
		if (mode !== "rocket" && this.rocketGain) {
			this.rocketGain.gain.setTargetAtTime(0, now, 0.2);
			if (this.rcsGain) this.rcsGain.gain.setTargetAtTime(0, now, 0.1);
		}
	}

	updatePlane(throttle: number, speedKnots: number, afterburner: boolean) {
		if (this.currentMode !== "plane" || !this.ctx || !this.jetGain) return;
		const now = this.ctx.currentTime;

		const targetFreq = 400 + throttle * 480 + (afterburner ? 180 : 0);
		if (this.jetOsc) {
			this.jetOsc.frequency.setTargetAtTime(targetFreq, now, 0.15);
		}

		if (this.jetFilter) {
			const filterCutoff = 500 + throttle * 2200 + speedKnots * 2.5;
			this.jetFilter.frequency.setTargetAtTime(filterCutoff, now, 0.1);
		}

		const overallVol = Math.min(1, 0.2 + throttle * 0.7 + (afterburner ? 0.3 : 0));
		this.jetGain.gain.setTargetAtTime(this.isMuted ? 0 : overallVol, now, 0.1);
		if (this.jetNoiseGain) {
			this.jetNoiseGain.gain.setTargetAtTime(0.3 + throttle * 0.6, now, 0.1);
		}
	}

	updateRocket(throttle: number, altitudeKm: number, rcsActive: boolean) {
		if (this.currentMode !== "rocket" || !this.ctx || !this.rocketGain) return;
		const now = this.ctx.currentTime;

		// Sound fades as atmosphere thins (acoustic boundary in vacuum)
		const atmosFactor = Math.max(0.15, 1 - altitudeKm / 120);

		if (this.rocketRumbleOsc) {
			this.rocketRumbleOsc.frequency.setTargetAtTime(35 + throttle * 35, now, 0.2);
		}
		if (this.rocketFilter) {
			this.rocketFilter.frequency.setTargetAtTime(300 + throttle * 1200, now, 0.15);
		}

		const targetVol = throttle > 0.02 ? (0.25 + throttle * 0.75) * atmosFactor : 0;
		this.rocketGain.gain.setTargetAtTime(this.isMuted ? 0 : targetVol, now, 0.15);
		if (this.rocketNoiseGain) {
			this.rocketNoiseGain.gain.setTargetAtTime(0.5 + throttle * 0.5, now, 0.1);
		}

		if (this.rcsGain) {
			const rcsVol = rcsActive ? 0.2 : 0;
			this.rcsGain.gain.setTargetAtTime(this.isMuted ? 0 : rcsVol, now, 0.05);
		}
	}

	setVolume(v: number) {
		this.volume = v;
		if (this.ctx && this.masterGain && !this.isMuted) {
			this.masterGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.1);
		}
	}

	setMuted(muted: boolean) {
		this.isMuted = muted;
		if (this.ctx && this.masterGain) {
			this.masterGain.gain.setTargetAtTime(muted ? 0 : this.volume, this.ctx.currentTime, 0.1);
		}
	}

	toggleMute(): boolean {
		this.setMuted(!this.isMuted);
		return this.isMuted;
	}
}

export const wallpaperAudio = new WallpaperAudioEngine();
