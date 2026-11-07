import {
	Gauge,
	Image,
	Monitor,
	Plane,
	RefreshCw,
	Rocket,
	RotateCcw,
	ShieldCheck,
	Sparkles
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
	low: { label: "Low", desc: "30 fps, fewer stars and ribbons. Best for battery or integrated graphics." },
	balanced: {
		label: "Balanced",
		desc: "60 fps at a moderate resolution. The default for most machines."
	},
	high: {
		label: "High",
		desc: "60 fps at full device resolution with the densest scene."
	}
};

const SCENES = [
	{ id: "drive", label: "Drive", detail: "Procedural road landscape" },
	{ id: "sky", label: "Skyflight", detail: "Warm horizon and high terrain" },
	{ id: "rocket", label: "Rocket", detail: "A powered ascent into the upper atmosphere" },
	{ id: "space", label: "Space", detail: "Deep space and starfield" },
	{ id: "underwater", label: "Underwater", detail: "Ocean depths and cool light" },
	{ id: "ambient", label: "Ambient", detail: "Soft dusk colors and hills" }
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
	const [scene, setScene] = useState(() => localStorage.getItem("bloom-wallpaper-scene") || "drive");
	const chooseScene = (value: string) => {
		setScene(value);
		localStorage.setItem("bloom-wallpaper-scene", value);
		void invoke("save_setting", { key: "bloom-wallpaper-scene", value });
	};
	return (
		<>
			<div className="setting-group-label">Scene</div>
			<div className="setting-group">
				{SCENES.map((item, index) => (
					<SettingRow key={item.id} icon={item.id === "sky" ? Plane : item.id === "space" ? Rocket : Sparkles} label={item.label} desc={item.detail} divider={index !== SCENES.length - 1}>
						<button type="button" className={`wallpaper-action-hint ${scene === item.id ? "selected" : ""}`} aria-pressed={scene === item.id} onClick={() => chooseScene(item.id)}>{scene === item.id ? "Selected" : "Select"}</button>
					</SettingRow>
				))}
			</div>
			<div className="setting-group-label">Wallpaper</div>
			<div className="setting-group">
				<SettingRow
					icon={Image}
					label="STARK-07 Wallpaper"
					desc="An original interactive scene behind your windows, dock and notch"
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
								? "Running below normal windows. Dock and notch stay above it."
								: enabled
									? "Enabled, but the scene window is not active yet."
									: "Not shown. Your Windows wallpaper is untouched."
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

			<div className="setting-group-label">Performance</div>
			<div className="setting-group">
				<SettingRow icon={Gauge} label="Quality" desc={QUALITY_COPY[quality].desc}>
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

			<div className="setting-group-label">Desktop</div>
			<div className="setting-group">
				<SettingRow
					icon={RotateCcw}
					label="Return to Normal Wallpaper"
					desc="Close the STARK-07 scene. Windows' own wallpaper is never changed."
					action
					divider={false}
					onClick={() => void restoreNormalWallpaper()}
				>
					<span className="wallpaper-action-hint">Restore</span>
				</SettingRow>
			</div>

			<div className="wallpaper-note">
				<ShieldCheck size={14} />
				<span>
					STARK-07&apos;s scene is drawn entirely by this app. Slow Roads is a separate
					work by Topograph Interactive and its license does not permit embedding,
					rehosting or redistributing the game. The link above is the authorized way to
					play it.
				</span>
			</div>

			<div className="setting-group-label">Future modes · design only</div>
			<div className="wallpaper-design-grid">
				<article className="wallpaper-design-card">
					<div className="wallpaper-design-heading">
						<Plane size={15} />
						<strong>Plane mode</strong>
						<span className="wallpaper-design-badge">Concept</span>
					</div>
					<p>
						A slow sightseeing flight over the same procedural hills, with a fixed-wing
						chase camera. Needs an original low-poly aircraft, a separate flight model and
						altitude-aware terrain LOD. It would run in a dedicated mode of the wallpaper
						window so the notch and dock are unaffected.
					</p>
				</article>
				<article className="wallpaper-design-card">
					<div className="wallpaper-design-heading">
						<Rocket size={15} />
						<strong>Rocket mode</strong>
						<span className="wallpaper-design-badge">Concept</span>
					</div>
					<p>
						An ascent from the horizon into a star field, with a launch sequence and
						re-entry glow. Needs original vehicle and plume assets, a second camera rig and
						a strict frame budget; it would be opt-in per mode, never on by default.
					</p>
				</article>
			</div>
			<div className="wallpaper-note subtle">
				<Sparkles size={14} />
				<span>
					These modes are a design plan for a later pass. No plane or rocket simulation is
					included, and no assets were copied from another game. The current wallpaper
					remains stable while that work is scoped.
				</span>
			</div>
		</>
	);
}
