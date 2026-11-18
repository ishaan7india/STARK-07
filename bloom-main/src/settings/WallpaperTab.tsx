import {
	Bus,
	Car,
	Gauge,
	Image,
	Monitor,
	Navigation,
	RefreshCw,
	RotateCcw,
	Sparkles,
	Volume2,
	VolumeX
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";
import { SettingRow } from "./SettingRow";
import type { WallpaperQuality } from "./useSettings";

interface WallpaperTabProps {
	enabled: boolean;
	active: boolean;
	quality: WallpaperQuality;
	error: string;
	toggleWallpaper: () => void;
	changeQuality: (quality: WallpaperQuality) => void;
	restoreNormalWallpaper: () => Promise<void>;
	refreshWallpaperStatus: () => Promise<void>;
}

const QUALITY_COPY: Record<WallpaperQuality, { label: string; desc: string }> = {
	low: { label: "Low", desc: "Energy-saving mode with reduced draw distance. Best for laptops or integrated GPUs." },
	balanced: {
		label: "Balanced",
		desc: "60 fps with adaptive terrain LOD and smooth shadows. Recommended for everyday desktop use."
	},
	high: {
		label: "High",
		desc: "Maximum render distance, dense foliage, and ultra crisp anti-aliasing."
	}
};

const VEHICLES = [
	{ id: "roadster", label: "Roadster", detail: "Classic open-top sports roadster with agile handling" },
	{ id: "coach", label: "Coach", detail: "Long touring bus with scenic elevated road view" },
	{ id: "bike", label: "Bike", detail: "Single-track motorcycle with dynamic lean angles" },
	{ id: "lambo", label: "Lambo", detail: "High-power exotic supercar tuned for high speed" },
	{ id: "supercar", label: "Supercar", detail: "Hypersonic experimental vehicle with extreme top speed" },
	{ id: "plane", label: "Supersonic Jet", detail: "High-speed aircraft with runways and tactical approach radar" },
	{ id: "rocket", label: "Space Rocket", detail: "Heavy orbital launch vehicle with launch pad and space map" },
	{ id: "matrix", label: "Matrix Rain & Live Specs HUD", detail: "Cyber binary rain with real-time CPU, RAM, Network, Battery & Uptime widgets" }
] as const;

const ENVIRONMENTS = [
	{ id: "summer", label: "Summer Hills", detail: "Lush green rolling hills under clear blue skies" },
	{ id: "autumn", label: "Golden Autumn", detail: "Warm amber trees and atmospheric sunset horizon" },
	{ id: "winter", label: "Winter Snow", detail: "Snow-capped peaks and crisp alpine atmosphere" },
	{ id: "planet", label: "Offworld Planet", detail: "Alien landscape with red terrain, rock arches and earthrise" },
	{ id: "space", label: "Orbital Space", detail: "Deep cosmic space with starry expanse and planet curvature" }
] as const;

export function WallpaperTab({
	enabled,
	active,
	quality,
	error,
	toggleWallpaper,
	changeQuality,
	restoreNormalWallpaper,
	refreshWallpaperStatus
}: WallpaperTabProps) {
	const [vehicle, setVehicle] = useState(() => localStorage.getItem("bloom-wallpaper-vehicle") || "roadster");
	const [env, setEnv] = useState(() => localStorage.getItem("bloom-wallpaper-env") || "summer");
	const [autoDrive, setAutoDrive] = useState(() => localStorage.getItem("bloom-wallpaper-autodrive") !== "false");
	const [volume, setVolume] = useState(() => localStorage.getItem("bloom-wallpaper-volume") || "0.15");

	const chooseVehicle = (value: string) => {
		setVehicle(value);
		localStorage.setItem("bloom-wallpaper-vehicle", value);
		void invoke("save_setting", { key: "bloom-wallpaper-vehicle", value });
	};

	const chooseEnv = (value: string) => {
		setEnv(value);
		localStorage.setItem("bloom-wallpaper-env", value);
		void invoke("save_setting", { key: "bloom-wallpaper-env", value });
	};

	const toggleAutoDrive = () => {
		const next = !autoDrive;
		setAutoDrive(next);
		localStorage.setItem("bloom-wallpaper-autodrive", String(next));
		void invoke("save_setting", { key: "bloom-wallpaper-autodrive", value: String(next) });
	};

	const changeVolume = (value: string) => {
		setVolume(value);
		localStorage.setItem("bloom-wallpaper-volume", value);
		void invoke("save_setting", { key: "bloom-wallpaper-volume", value });
	};

	return (
		<>
			<div className="setting-group-label">Wallpaper Power</div>
			<div className="setting-group">
				<SettingRow
					icon={Image}
					label="STARK-07 Slow Roads Wallpaper"
					desc="Infinite procedural 3D driving world running live behind your dock, notch, and apps"
				>
					<label className="toggle-switch">
						<input type="checkbox" checked={enabled} onChange={toggleWallpaper} />
						<span className="slider"></span>
					</label>
				</SettingRow>

				<SettingRow
					icon={Monitor}
					label="Status"
					desc={
						error
							? error
							: active
								? "Cruising behind desktop windows. Never pauses on blur; dock and notch remain on top."
								: enabled
									? "Starting 3D driving engine..."
									: "Inactive. Windows wallpaper is untouched."
					}
				>
					<span className={`wallpaper-status ${active ? "on" : "off"}`}>
						<span className="wallpaper-status-dot" aria-hidden="true" />
						{active ? "Active" : "Inactive"}
					</span>
					<button
						type="button"
						className="wallpaper-icon-button"
						onClick={() => void refreshWallpaperStatus()}
						aria-label="Refresh wallpaper status"
						title="Refresh wallpaper status"
					>
						<RefreshCw size={13} />
					</button>
				</SettingRow>

				{error && (
					<div className="wallpaper-error" role="alert">
						{error}
					</div>
				)}
			</div>

			<div className="setting-group-label">Driving Mode</div>
			<div className="setting-group">
				<SettingRow
					icon={Navigation}
					label="Autopilot Cruise Mode"
					desc="Autonomous driving along the endless road. Recommended for a hypnotic live wallpaper. Turn off to drive manually."
				>
					<label className="toggle-switch">
						<input type="checkbox" checked={autoDrive} onChange={toggleAutoDrive} />
						<span className="slider"></span>
					</label>
				</SettingRow>
			</div>

			<div className="setting-group-label">Vehicles</div>
			<div className="setting-group">
				{VEHICLES.map((item, index) => (
					<SettingRow
						key={item.id}
						icon={item.id === "coach" ? Bus : Car}
						label={item.label}
						desc={item.detail}
						divider={index !== VEHICLES.length - 1}
					>
						<button
							type="button"
							className={`wallpaper-action-hint ${vehicle === item.id ? "selected" : ""}`}
							aria-pressed={vehicle === item.id}
							onClick={() => chooseVehicle(item.id)}
						>
							{vehicle === item.id ? "Selected" : "Select"}
						</button>
					</SettingRow>
				))}
			</div>

			<div className="setting-group-label">Environments & Atmosphere</div>
			<div className="setting-group">
				{ENVIRONMENTS.map((item, index) => (
					<SettingRow
						key={item.id}
						icon={Sparkles}
						label={item.label}
						desc={item.detail}
						divider={index !== ENVIRONMENTS.length - 1}
					>
						<button
							type="button"
							className={`wallpaper-action-hint ${env === item.id ? "selected" : ""}`}
							aria-pressed={env === item.id}
							onClick={() => chooseEnv(item.id)}
						>
							{env === item.id ? "Selected" : "Select"}
						</button>
					</SettingRow>
				))}
			</div>

			<div className="setting-group-label">Audio</div>
			<div className="setting-group">
				<SettingRow
					icon={volume === "0" ? VolumeX : Volume2}
					label="Engine & Ambient Sound"
					desc="Adjust background audio levels. Gentle ambient volume is recommended for desktop wallpapers."
				>
					<div className="unit-toggle-minimal wide" role="group" aria-label="Audio level">
						{[
							{ id: "0", label: "Mute" },
							{ id: "0.15", label: "Gentle" },
							{ id: "0.5", label: "Standard" }
						].map((lvl) => (
							<span
								key={lvl.id}
								className={volume === lvl.id ? "active" : ""}
								role="button"
								tabIndex={0}
								aria-pressed={volume === lvl.id}
								onClick={() => changeVolume(lvl.id)}
								onKeyDown={(event) => {
									if (event.key === "Enter" || event.key === " ") {
										event.preventDefault();
										changeVolume(lvl.id);
									}
								}}
							>
								{lvl.label}
							</span>
						))}
					</div>
				</SettingRow>
			</div>

			<div className="setting-group-label">Performance & Fidelity</div>
			<div className="setting-group">
				<SettingRow icon={Gauge} label="Graphics Preset" desc={QUALITY_COPY[quality].desc}>
					<div className="unit-toggle-minimal wide" role="group" aria-label="Wallpaper quality">
						{(["low", "balanced", "high"] as const).map((preset) => (
							<span
								key={preset}
								className={quality === preset ? "active" : ""}
								role="button"
								tabIndex={0}
								aria-pressed={quality === preset}
								onClick={() => changeQuality(preset)}
								onKeyDown={(event) => {
									if (event.key === "Enter" || event.key === " ") {
										event.preventDefault();
										changeQuality(preset);
									}
								}}
							>
								{QUALITY_COPY[preset].label}
							</span>
						))}
					</div>
				</SettingRow>
			</div>

			<div className="setting-group-label">Desktop Controls Guide</div>
			<div className="setting-group">
				<div style={{ padding: "14px 18px", fontSize: "12px", lineHeight: "1.7", color: "var(--text-muted, #9bb0be)" }}>
					<div style={{ display: "grid", gridTemplateColumns: "130px 1fr", gap: "6px 12px" }}>
						<strong>V</strong> <span>Cycle Mode: Car ↔ Supersonic Jet ↔ Rocket</span>
						<strong>W / S / A / D</strong> <span>Drive Car / Pitch & Roll Jet / Gimbal Rocket</span>
						<strong>Q / E</strong> <span>Jet Rudder yaw / Rocket RCS</span>
						<strong>Shift / Ctrl</strong> <span>Jet Throttle up / down</span>
						<strong>Space</strong> <span>Car Handbrake / Jet Brakes / Rocket Liftoff</span>
						<strong>X</strong> <span>Rocket Stage Booster Separation</span>
						<strong>F or =</strong> <span>Toggle Autopilot (Drive / Jet ILS / Orbit)</span>
						<strong>C</strong> <span>Cycle Camera angles</span>
						<strong>U</strong> <span>Toggle HUD speedometer & controls</span>
						<strong>R</strong> <span>Reset position to road or runway</span>
						<strong>M</strong> <span>Mute / Unmute audio engine</span>
					</div>
				</div>
			</div>

			<div className="setting-group-label">Desktop Reset</div>
			<div className="setting-group">
				<SettingRow
					icon={RotateCcw}
					label="Hide Live Wallpaper"
					desc="Hides the STARK-07 driving scene. Your original Windows desktop background is completely untouched."
					action
					divider={false}
					onClick={() => void restoreNormalWallpaper()}
				>
					<span className="wallpaper-action-hint">Hide</span>
				</SettingRow>
			</div>
		</>
	);
}
