import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, emit } from "@tauri-apps/api/event";
import { enable, disable, isEnabled } from "@tauri-apps/plugin-autostart";
import { getVersion } from "@tauri-apps/api/app";
import { useSettingsSync } from "../hooks/useSettingsSync";
import { reloadIfMirrorWasStale } from "../hooks/settingsMirror";
import { hexToHsl } from "../theme";
import { waitForPendingSaves } from "./pendingSaves";
import {
	addCustomFolder,
	removeCustomFolder,
	toggleEnabledFolder,
	toggleHiddenDrive,
	DEFAULT_ENABLED_FOLDERS
} from "../dockExtras";
import type {
	StartMenuIconSize,
	StartMenuPage,
	StartMenuPanelSize,
	WidgetConfig
} from "./types";

function readBool(val: string | null): boolean {
	return val === "true";
}

/** The notch panels a click can open. */
export type NotchPanelChoice = "calendar" | "command-center" | "devices";

/** Rendering presets for the original STARK-07 wallpaper. */
export type WallpaperQuality = "low" | "balanced" | "high";

function asPanelChoice(val: unknown): NotchPanelChoice {
	return val === "command-center" || val === "devices" ? val : "calendar";
}

function asWallpaperQuality(val: unknown): WallpaperQuality {
	return val === "low" || val === "high" ? val : "balanced";
}

export function useSettings() {
	const [isLoaded, setIsLoaded] = useState(false);
	const [saveError, setSaveError] = useState(
		() => sessionStorage.getItem("bloom-settings-save-error") !== null
	);
	const [saveErrorDetail, setSaveErrorDetail] = useState(
		() => sessionStorage.getItem("bloom-settings-save-error-detail") || ""
	);
	const saveQueue = useRef<Promise<void>>(Promise.resolve());
	const saveFailed = useRef(false);
	const flushPendingSaves = useCallback(async () => {
		await waitForPendingSaves(() => saveQueue.current);
		return !saveFailed.current;
	}, []);
	const [autostart, setAutostart] = useState(false);
	const [weatherEnabled, setWeatherEnabled] = useState(
		() => localStorage.getItem("bloom-weather-enabled") === "true"
	);
	const [calendarMondayFirst, setCalendarMondayFirst] = useState(false);
	const [calendarEnabled, setCalendarEnabled] = useState(true);
	const [controlsPanelEnabled, setControlsPanelEnabled] = useState(true);
	const [devicesPanelEnabled, setDevicesPanelEnabled] = useState(false);
	const [timerSoundEnabled, setTimerSoundEnabled] = useState(
		() => localStorage.getItem("bloom-timer-sound-enabled") !== "false"
	);
	const [musicModeEnabled, setMusicModeEnabled] = useState(true);
	const [notchRememberPanel, setNotchRememberPanel] = useState(
		() => (localStorage.getItem("bloom-notch-remember-panel") ??
			localStorage.getItem("bloom-notch-click-to-open")) !== "false"
	);
	const [notchDefaultPanel, setNotchDefaultPanel] = useState<NotchPanelChoice>(() =>
		asPanelChoice(localStorage.getItem("bloom-notch-default-panel"))
	);
	const [musicCompactNotch, setMusicCompactNotch] = useState(true);
	const [meetingControlsEnabled, setMeetingControlsEnabled] = useState(
		() => localStorage.getItem("bloom-meeting-controls-enabled") !== "false"
	);
	const [shelfPersist, setShelfPersist] = useState(
		() => localStorage.getItem("bloom-shelf-persist") === "true"
	);
	const [volumeOverlayEnabled, setVolumeOverlayEnabled] = useState(true);
	const [volumeEdgeEnabled, setVolumeEdgeEnabled] = useState(
		() => localStorage.getItem("bloom-volume-edge-enabled") !== "false"
	);
	const [brightnessOverlayEnabled, setBrightnessOverlayEnabled] = useState(
		() => localStorage.getItem("bloom-brightness-overlay-enabled") !== "false"
	);
	const [brightnessEdgeEnabled, setBrightnessEdgeEnabled] = useState(
		() => localStorage.getItem("bloom-brightness-edge-enabled") !== "false"
	);
	const [mediaAmbienceEnabled, setMediaAmbienceEnabled] = useState(true);
	const [mediaCompactGlowEnabled, setMediaCompactGlowEnabled] = useState(true);
	const [mediaLayout, setMediaLayout] = useState<"classic" | "compact">(
		() => (localStorage.getItem("bloom-media-layout") as "classic" | "compact") || "classic"
	);
	const [cornersEnabled, setCornersEnabled] = useState(
		() => localStorage.getItem("bloom-corners-enabled") === "true"
	);
	const [edgeShineEnabled, setEdgeShineEnabled] = useState(
		() => localStorage.getItem("bloom-edge-shine-enabled") !== "false"
	);
	const [timeFormat24h, setTimeFormat24h] = useState(
		() => localStorage.getItem("bloom-time-format-24h") === "true"
	);
	const [tempUnitFahrenheit, setTempUnitFahrenheit] = useState(false);
	const [cityName, setCityName] = useState("");
	const [citySearchResults, setCitySearchResults] = useState<
		Array<{ name: string; country: string; latitude: number; longitude: number }>
	>([]);
	const [showCityDropdown, setShowCityDropdown] = useState(false);
	const [statusWidgets, setStatusWidgets] = useState<WidgetConfig>({
		left: ["weather"],
		right: ["battery"]
	});
	const [dockEnabled, setDockEnabled] = useState(true);
	const [dockPreviewEnabled, setDockPreviewEnabled] = useState(true);
	const [dockIconOnly, setDockIconOnly] = useState(
		() => localStorage.getItem("bloom-dock-icon-only") === "true"
	);
	const [dockSeparatorEnabled, setDockSeparatorEnabled] = useState(
		() => localStorage.getItem("bloom-dock-separator-enabled") !== "false"
	);
	const [startIcon, setStartIcon] = useState(
		() => localStorage.getItem("bloom-start-icon") || "default"
	);
	const [startMenuEnabled, setStartMenuEnabled] = useState(
		() => localStorage.getItem("bloom-start-menu-enabled") !== "false"
	);
	const [startMenuClickThrough, setStartMenuClickThrough] = useState(
		() => localStorage.getItem("bloom-start-menu-click-through") === "true"
	);
	const [startMenuDefaultPage, setStartMenuDefaultPageState] = useState<StartMenuPage>(
		() => localStorage.getItem("bloom-start-menu-default-page") === "apps" ? "apps" : "pinned"
	);
	const [startMenuColumns, setStartMenuColumnsState] = useState(() => {
		const value = Number(localStorage.getItem("bloom-start-menu-columns"));
		return value === 4 || value === 5 ? value : 6;
	});
	const [startMenuIconSize, setStartMenuIconSizeState] = useState<StartMenuIconSize>(
		() => {
			const value = localStorage.getItem("bloom-start-menu-icon-size");
			return value === "compact" || value === "large" ? value : "standard";
		}
	);
	const [startMenuPanelSize, setStartMenuPanelSizeState] = useState<StartMenuPanelSize>(
		() => {
			const value = localStorage.getItem("bloom-start-menu-panel-size");
			return value === "compact" || value === "large" ? value : "standard";
		}
	);
	const [startMenuAutoFocus, setStartMenuAutoFocus] = useState(
		() => localStorage.getItem("bloom-start-menu-auto-focus") !== "false"
	);
	const [startMenuShowHeader, setStartMenuShowHeader] = useState(
		() => localStorage.getItem("bloom-start-menu-show-header") !== "false"
	);
	const [startMenuShowFooter, setStartMenuShowFooter] = useState(
		() => localStorage.getItem("bloom-start-menu-show-footer") !== "false"
	);
	const [dockAdaptive, setDockAdaptive] = useState(
		() => localStorage.getItem("bloom-dock-adaptive") === "true"
	);
	const [dockWinNumberEnabled, setDockWinNumberEnabled] = useState(
		() => localStorage.getItem("bloom-dock-win-number-enabled") === "true"
	);
	const [dockWinKeyStartEnabled, setDockWinKeyStartEnabled] = useState(
		() => localStorage.getItem("bloom-dock-win-key-start-enabled") !== "false"
	);
	const [dockExtrasPosition, setDockExtrasPosition] = useState(
		() => localStorage.getItem("bloom-dock-extras-position") || "off"
	);
	const [dockExtrasDrives, setDockExtrasDrives] = useState(
		() => localStorage.getItem("bloom-dock-extras-drives") !== "false"
	);
	const [dockExtrasHiddenDrives, setDockExtrasHiddenDrives] = useState(
		() => localStorage.getItem("bloom-dock-extras-hidden-drives") || ""
	);
	const [dockExtrasRecycleBin, setDockExtrasRecycleBin] = useState(
		() => localStorage.getItem("bloom-dock-extras-recycle-bin") !== "false"
	);
	// Off unless turned on, so existing docks don't change.
	const [dockTaskView, setDockTaskView] = useState(
		() => localStorage.getItem("bloom-dock-task-view") === "true"
	);
	const [dockExtrasFolders, setDockExtrasFolders] = useState(
		() => localStorage.getItem("bloom-dock-extras-folders") ?? DEFAULT_ENABLED_FOLDERS
	);
	const [dockExtrasCustomFolders, setDockExtrasCustomFolders] = useState(
		() => localStorage.getItem("bloom-dock-extras-custom-folders") || "[]"
	);
	const [dockMode, setDockMode] = useState(() => {
		// Fixed keeps the replacement dock visible on a fresh STARK-07 install.
		// Keep in step with App.tsx, Dock.tsx, and the backend fallback in commands.rs.
		const raw = localStorage.getItem("bloom-dock-mode") || "fixed";
		return raw === "auto-hide" ? "smart" : raw;
	});
	const [dockEdgeDelay, setDockEdgeDelay] = useState(() => {
		const val = localStorage.getItem("bloom-dock-edge-delay");
		return val !== null ? parseInt(val) : 200;
	});
	const [notchMode, setNotchMode] = useState("fixed");
	const [notchEdgeDelay, setNotchEdgeDelay] = useState(() => {
		const val = localStorage.getItem("bloom-notch-edge-delay");
		return val !== null ? parseInt(val) : 200;
	});
	const [lowBatteryThreshold, setLowBatteryThreshold] = useState(20);
	const [appVersion, setAppVersion] = useState("");
	const [scale, setScale] = useState(() =>
		parseFloat(localStorage.getItem("bloom-scale") || "1.0")
	);
	const [themeMode, setThemeMode] = useState(
		() => localStorage.getItem("bloom-theme-mode") || "custom"
	);
	const [themeColor, setThemeColor] = useState(
		() => localStorage.getItem("bloom-theme-color") || "#A5B38F"
	);
	const [themeOpacity, setThemeOpacity] = useState(() => {
		const val = localStorage.getItem("bloom-theme-opacity");
		return val !== null ? parseFloat(val) : 0.82;
	});
	const [themeSaturation, setThemeSaturation] = useState(() => {
		const val = localStorage.getItem("bloom-theme-saturation");
		return val !== null ? parseFloat(val) : 0.18;
	});
	const [themeBrightness, setThemeBrightness] = useState(() => {
		const val = localStorage.getItem("bloom-theme-brightness");
		return val !== null ? parseFloat(val) : 0.12;
	});
	const [exportStatus, setExportStatus] = useState<"idle" | "exporting" | "success" | "error">(
		"idle"
	);
	const [importStatus, setImportStatus] = useState<"idle" | "importing" | "success" | "error">(
		"idle"
	);
	// The wallpaper is its own always-on-bottom window. "Enabled" is the saved
	// preference; "active" is what the backend currently reports, so a failed
	// creation is visible instead of silently showing a checkbox as on.
	const [wallpaperEnabled, setWallpaperEnabled] = useState(
		() => localStorage.getItem("bloom-wallpaper-enabled") === "true"
	);
	const [wallpaperQuality, setWallpaperQuality] = useState<WallpaperQuality>(() =>
		asWallpaperQuality(localStorage.getItem("bloom-wallpaper-quality"))
	);
	const [wallpaperActive, setWallpaperActive] = useState(false);
	const [wallpaperError, setWallpaperError] = useState("");

	// ── Load all settings from backend + localStorage ──
	const loadAllSettings = useCallback(async () => {
		try {
			const settings: Record<string, string> = await invoke("load_settings");
			if (await reloadIfMirrorWasStale(settings)) return;
			const getVal = (key: string) => {
				const val = settings[key];
				if (val !== undefined && val !== null) return String(val);
				return localStorage.getItem(key);
			};

			const apply = <T>(
				val: string | null,
				setter: (v: T) => void,
				transform: (v: string) => T
			) => {
				if (val !== null) setter(transform(val));
			};

			apply(getVal("bloom-weather-enabled"), setWeatherEnabled, readBool);
			apply(getVal("bloom-calendar-enabled"), setCalendarEnabled, readBool);
			apply(getVal("bloom-calendar-monday-first"), setCalendarMondayFirst, readBool);
			apply(getVal("bloom-notch-command-center-enabled"), setControlsPanelEnabled, readBool);
			apply(getVal("bloom-notch-devices-enabled"), setDevicesPanelEnabled, readBool);
			apply(getVal("bloom-timer-sound-enabled"), setTimerSoundEnabled, readBool);
			apply(getVal("bloom-music-mode-enabled"), setMusicModeEnabled, readBool);
			apply(getVal("bloom-notch-remember-panel") ?? getVal("bloom-notch-click-to-open"),
				setNotchRememberPanel, readBool);
			apply(getVal("bloom-notch-default-panel"), setNotchDefaultPanel, asPanelChoice);
			apply(getVal("bloom-music-compact-notch"), setMusicCompactNotch, readBool);
			apply(getVal("bloom-meeting-controls-enabled"), setMeetingControlsEnabled, readBool);
			apply(getVal("bloom-shelf-persist"), setShelfPersist, readBool);
			apply(getVal("bloom-volume-overlay-enabled"), setVolumeOverlayEnabled, readBool);
			apply(getVal("bloom-brightness-overlay-enabled"), setBrightnessOverlayEnabled, readBool);
			apply(getVal("bloom-media-ambience-enabled"), setMediaAmbienceEnabled, readBool);
			apply(getVal("bloom-media-compact-glow-enabled"), setMediaCompactGlowEnabled, readBool);
			apply(getVal("bloom-corners-enabled"), setCornersEnabled, readBool);
			setEdgeShineEnabled(getVal("bloom-edge-shine-enabled") !== "false");
			apply(getVal("bloom-time-format-24h"), setTimeFormat24h, readBool);
			apply(getVal("bloom-volume-edge-enabled"), setVolumeEdgeEnabled, readBool);
			apply(getVal("bloom-brightness-edge-enabled"), setBrightnessEdgeEnabled, readBool);
			const storedDockEnabled = settings["bloom-dock-enabled"];
			setDockEnabled(storedDockEnabled == null ? true : readBool(String(storedDockEnabled)));
			apply(getVal("bloom-dock-preview-enabled"), setDockPreviewEnabled, readBool);
			apply(getVal("bloom-dock-icon-only"), setDockIconOnly, readBool);
			apply(getVal("bloom-dock-separator-enabled"), setDockSeparatorEnabled, readBool);
			apply(getVal("bloom-start-icon"), setStartIcon, (v) => v);
			apply(getVal("bloom-start-menu-enabled"), setStartMenuEnabled, readBool);
			apply(getVal("bloom-start-menu-click-through"), setStartMenuClickThrough, readBool);
			apply(getVal("bloom-start-menu-default-page"), setStartMenuDefaultPageState, (v) => v === "apps" ? "apps" : "pinned");
			apply(getVal("bloom-start-menu-columns"), setStartMenuColumnsState, (v) => {
				const value = Number(v);
				return value === 4 || value === 5 ? value : 6;
			});
			apply(getVal("bloom-start-menu-icon-size"), setStartMenuIconSizeState, (v) =>
				v === "compact" || v === "large" ? v : "standard"
			);
			apply(getVal("bloom-start-menu-panel-size"), setStartMenuPanelSizeState, (v) =>
				v === "compact" || v === "large" ? v : "standard"
			);
			apply(getVal("bloom-start-menu-auto-focus"), setStartMenuAutoFocus, readBool);
			apply(getVal("bloom-start-menu-show-header"), setStartMenuShowHeader, readBool);
			apply(getVal("bloom-start-menu-show-footer"), setStartMenuShowFooter, readBool);
			apply(getVal("bloom-dock-adaptive"), setDockAdaptive, readBool);
			apply(getVal("bloom-dock-win-number-enabled"), setDockWinNumberEnabled, readBool);
			apply(getVal("bloom-dock-win-key-start-enabled"), setDockWinKeyStartEnabled, readBool);
			apply(getVal("bloom-dock-extras-position"), setDockExtrasPosition, (v) => v);
			apply(getVal("bloom-dock-extras-drives"), setDockExtrasDrives, readBool);
			apply(getVal("bloom-dock-extras-recycle-bin"), setDockExtrasRecycleBin, readBool);
			apply(getVal("bloom-dock-task-view"), setDockTaskView, readBool);
			apply(getVal("bloom-dock-extras-hidden-drives"), setDockExtrasHiddenDrives, (v) => v);
			apply(getVal("bloom-dock-extras-folders"), setDockExtrasFolders, (v) => v);
			apply(getVal("bloom-dock-extras-custom-folders"), setDockExtrasCustomFolders, (v) => v);

			apply(getVal("bloom-temp-unit"), setTempUnitFahrenheit, (v) => v === "fahrenheit");
			apply(getVal("bloom-scale"), setScale, parseFloat);
			apply(getVal("bloom-low-battery-threshold"), setLowBatteryThreshold, parseInt);

			apply(getVal("bloom-notch-mode"), setNotchMode, (v) => (v === "auto-hide" ? "smart" : v));
			apply(getVal("bloom-notch-edge-delay"), setNotchEdgeDelay, parseInt);
			const storedDockMode = settings["bloom-dock-mode"];
			setDockMode(
				storedDockMode == null
					? "fixed"
					: String(storedDockMode) === "auto-hide"
						? "smart"
						: String(storedDockMode)
			);
			apply(getVal("bloom-dock-edge-delay"), setDockEdgeDelay, parseInt);

			const savedCity = getVal("bloom-weather-city");
			if (savedCity) setCityName(savedCity);

			apply(getVal("bloom-theme-mode"), setThemeMode, (v) => v);
			apply(getVal("bloom-theme-color"), setThemeColor, (v) => v);
			apply(getVal("bloom-theme-opacity"), setThemeOpacity, parseFloat);
			apply(getVal("bloom-theme-saturation"), setThemeSaturation, parseFloat);
			apply(getVal("bloom-theme-brightness"), setThemeBrightness, parseFloat);

			apply(getVal("bloom-wallpaper-enabled"), setWallpaperEnabled, readBool);
			apply(getVal("bloom-wallpaper-quality"), setWallpaperQuality, asWallpaperQuality);

			const widgetsVal = getVal("bloom-status-widgets");
			if (widgetsVal) {
				try {
					const parsed = JSON.parse(widgetsVal);
					if (parsed && Array.isArray(parsed.left) && Array.isArray(parsed.right)) {
						setStatusWidgets(parsed);
					}
				} catch {}
			}
		} catch (e) {
			console.error("Failed to load settings:", e);
		}
		// Also reveal the controls on failure, so a load error cannot trap the
		// user behind the opening indicator. A stale-mirror reload returns above.
		setIsLoaded(true);
	}, []);

	// The file write is authoritative. Serialize controls that change several
	// settings, and update the local mirror only after the backend confirms the
	// write. A failed save reloads the page from persisted values and leaves a
	// visible error instead of keeping an optimistic control value on screen.
	const saveSetting = (key: string, value: string | null): Promise<boolean> => {
		const operation = saveQueue.current.then(async () => {
			if (saveFailed.current) return false;
			try {
				await invoke<void>("save_setting", { key, value });
			} catch (error) {
				console.error(`Failed to save ${key}:`, error);
				saveFailed.current = true;
				sessionStorage.setItem("bloom-settings-save-error", "true");
				sessionStorage.setItem("bloom-settings-save-error-detail", String(error));
				setSaveErrorDetail(String(error));
				setSaveError(true);
				window.setTimeout(() => window.location.reload(), 0);
				return false;
			}
			try {
				if (value === null) localStorage.removeItem(key);
				else localStorage.setItem(key, value);
				sessionStorage.removeItem("bloom-settings-save-error");
				sessionStorage.removeItem("bloom-settings-save-error-detail");
			} catch (error) {
				// The file is saved; a mirror failure must not be reported as a failed write.
				console.warn("Settings mirror update failed:", error);
			}
			setSaveError(false);
			return true;
		});
		saveQueue.current = operation.then(() => {});
		return operation;
	};

	// Coordinates only need the backend settings file. Keep them out of the
	// browser's localStorage mirror while preserving the same queued/error path.
	const saveLocation = (key: "bloom-weather-lat" | "bloom-weather-lon", value: string | null): Promise<boolean> => {
		const operation = saveQueue.current.then(async () => {
			if (saveFailed.current) return false;
			try {
				await invoke<void>("save_setting", { key, value });
			} catch (error) {
				console.error(`Failed to save ${key}:`, error);
				saveFailed.current = true;
				sessionStorage.setItem("bloom-settings-save-error", "true");
				sessionStorage.setItem("bloom-settings-save-error-detail", String(error));
				setSaveErrorDetail(String(error));
				setSaveError(true);
				window.setTimeout(() => window.location.reload(), 0);
				return false;
			}
			try {
				localStorage.removeItem(key);
				sessionStorage.removeItem("bloom-settings-save-error");
				sessionStorage.removeItem("bloom-settings-save-error-detail");
			} catch (error) {
				console.warn("Settings mirror cleanup failed:", error);
			}
			setSaveError(false);
			return true;
		});
		saveQueue.current = operation.then(() => {});
		return operation;
	};

	const dismissSaveError = () => {
		sessionStorage.removeItem("bloom-settings-save-error");
		sessionStorage.removeItem("bloom-settings-save-error-detail");
		setSaveErrorDetail("");
		setSaveError(false);
	};

	// ── Initialize on mount ──
	useEffect(() => {
		loadAllSettings();

		isEnabled()
			.then(setAutostart)
			.catch(() => {});

		getVersion()
			.then((ver) => setAppVersion(ver || "3.1.2"))
			.catch(() => setAppVersion("3.1.2"));

		void refreshWallpaperStatus();
	}, []);

	// ── Sync settings from other windows ──
	useSettingsSync({
		"bloom-dock-mode": setDockMode,
		"bloom-dock-edge-delay": setDockEdgeDelay,
		"bloom-notch-mode": setNotchMode,
		"bloom-notch-edge-delay": setNotchEdgeDelay,
		"bloom-dock-enabled": setDockEnabled,
		"bloom-dock-icon-only": setDockIconOnly,
		"bloom-dock-separator-enabled": setDockSeparatorEnabled,
		"bloom-start-icon": setStartIcon,
		"bloom-start-menu-enabled": setStartMenuEnabled,
		"bloom-start-menu-click-through": setStartMenuClickThrough,
		"bloom-start-menu-default-page": (value) => setStartMenuDefaultPageState(value === "apps" ? "apps" : "pinned"),
		"bloom-start-menu-columns": (value) => setStartMenuColumnsState(value === 4 || value === 5 ? value : 6),
		"bloom-start-menu-icon-size": (value) => setStartMenuIconSizeState(value === "compact" || value === "large" ? value : "standard"),
		"bloom-start-menu-panel-size": (value) => setStartMenuPanelSizeState(value === "compact" || value === "large" ? value : "standard"),
		"bloom-start-menu-auto-focus": setStartMenuAutoFocus,
		"bloom-start-menu-show-header": setStartMenuShowHeader,
		"bloom-start-menu-show-footer": setStartMenuShowFooter,
		"bloom-dock-preview-enabled": setDockPreviewEnabled,
		"bloom-dock-adaptive": setDockAdaptive,
		"bloom-dock-win-number-enabled": setDockWinNumberEnabled,
		"bloom-dock-win-key-start-enabled": setDockWinKeyStartEnabled,
		"bloom-dock-extras-position": setDockExtrasPosition,
		"bloom-dock-extras-drives": setDockExtrasDrives,
		"bloom-dock-extras-recycle-bin": setDockExtrasRecycleBin,
		"bloom-dock-task-view": setDockTaskView,
		"bloom-dock-extras-hidden-drives": setDockExtrasHiddenDrives,
		"bloom-dock-extras-folders": setDockExtrasFolders,
		"bloom-dock-extras-custom-folders": setDockExtrasCustomFolders,
		"bloom-weather-enabled": setWeatherEnabled,
		"bloom-calendar-enabled": setCalendarEnabled,
		"bloom-calendar-monday-first": setCalendarMondayFirst,
		"bloom-notch-command-center-enabled": setControlsPanelEnabled,
		"bloom-notch-devices-enabled": setDevicesPanelEnabled,
		"bloom-timer-sound-enabled": setTimerSoundEnabled,
		"bloom-music-mode-enabled": setMusicModeEnabled,
		"bloom-notch-remember-panel": setNotchRememberPanel,
		"bloom-notch-default-panel": (v: unknown) =>
			setNotchDefaultPanel(asPanelChoice(v)),
		"bloom-music-compact-notch": setMusicCompactNotch,
		"bloom-meeting-controls-enabled": setMeetingControlsEnabled,
		"bloom-media-ambience-enabled": setMediaAmbienceEnabled,
		"bloom-media-compact-glow-enabled": setMediaCompactGlowEnabled,
		"bloom-media-layout": setMediaLayout,
		"bloom-corners-enabled": setCornersEnabled,
		"bloom-edge-shine-enabled": setEdgeShineEnabled,
		"bloom-time-format-24h": setTimeFormat24h,
		"bloom-low-battery-threshold": setLowBatteryThreshold,
		"bloom-scale": setScale,
		"bloom-temp-unit": (v) => setTempUnitFahrenheit(v === "fahrenheit"),
		"bloom-volume-overlay-enabled": setVolumeOverlayEnabled,
		"bloom-volume-edge-enabled": setVolumeEdgeEnabled,
		"bloom-brightness-overlay-enabled": setBrightnessOverlayEnabled,
		"bloom-brightness-edge-enabled": setBrightnessEdgeEnabled,
		"bloom-theme-mode": setThemeMode,
		"bloom-theme-color": setThemeColor,
		"bloom-theme-opacity": setThemeOpacity,
		"bloom-theme-saturation": setThemeSaturation,
		"bloom-theme-brightness": setThemeBrightness,
		"bloom-wallpaper-enabled": setWallpaperEnabled,
		"bloom-wallpaper-quality": (v) => setWallpaperQuality(asWallpaperQuality(v)),
		"bloom-weather-city": (v) => setCityName(v || "")
	});

	// ── Listen for system accent changes (adaptive theme) ──
	useEffect(() => {
		const unlisten = listen<string>("system-accent-changed", (event) => {
			const mode = localStorage.getItem("bloom-theme-mode") || "dark";
			if (mode === "adaptive") {
				try {
					const hsl = hexToHsl(event.payload);
					setThemeSaturation(hsl.s / 100);
					setThemeBrightness(hsl.l / 100);
				} catch (e) {
					console.error("Failed to parse system accent color change HSL:", e);
				}
			}
		});
		return () => {
			unlisten.then((fn) => fn());
		};
	}, []);

	// ── City search debounce ──
	useEffect(() => {
		if (!weatherEnabled || cityName.trim().length < 2) {
			setCitySearchResults([]);
			setShowCityDropdown(false);
			return;
		}

		const timeout = setTimeout(async () => {
			try {
				const res = await fetch(
					`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityName)}&count=5&language=en&format=json`
				);
				const data = await res.json();
				if (data.results && data.results.length > 0) {
					setCitySearchResults(
						data.results.map((r: any) => ({
							name: r.name,
							country: r.country || "",
							latitude: r.latitude,
							longitude: r.longitude
						}))
					);
					setShowCityDropdown(true);
				} else {
					setCitySearchResults([]);
				}
			} catch {
				setCitySearchResults([]);
			}
		}, 300);

		return () => clearTimeout(timeout);
	}, [cityName, weatherEnabled]);

	// ── Autostart ──
	const toggleAutostart = async () => {
		try {
			const currentlyEnabled = await isEnabled();
			if (currentlyEnabled) {
				await disable();
				setAutostart(false);
			} else {
				await enable();
				setAutostart(true);
			}
		} catch (err) {}
	};

	// ── Simple boolean toggles ──
	const toggleWeather = () => {
		const next = !weatherEnabled;
		setWeatherEnabled(next);
		saveSetting("bloom-weather-enabled", String(next));
	};

	// The notch needs at least one panel, so the last one on can't be turned off.
	const enabledPanelCount =
		Number(calendarEnabled) + Number(controlsPanelEnabled) + Number(devicesPanelEnabled);

	const toggleCalendarMondayFirst = () => {
		const next = !calendarMondayFirst;
		setCalendarMondayFirst(next);
		saveSetting("bloom-calendar-monday-first", String(next));
	};

	const toggleCalendar = () => {
		const next = !calendarEnabled;
		if (!next && enabledPanelCount <= 1) return;
		setCalendarEnabled(next);
		saveSetting("bloom-calendar-enabled", String(next));
	};

	const toggleControlsPanel = () => {
		const next = !controlsPanelEnabled;
		if (!next && enabledPanelCount <= 1) return;
		setControlsPanelEnabled(next);
		saveSetting("bloom-notch-command-center-enabled", String(next));
	};

	const toggleDevicesPanel = () => {
		const next = !devicesPanelEnabled;
		if (!next && enabledPanelCount <= 1) return;
		setDevicesPanelEnabled(next);
		saveSetting("bloom-notch-devices-enabled", String(next));
	};

	const toggleTimerSound = () => {
		const next = !timerSoundEnabled;
		setTimerSoundEnabled(next);
		saveSetting("bloom-timer-sound-enabled", String(next));
	};

	const toggleMusicMode = () => {
		const next = !musicModeEnabled;
		setMusicModeEnabled(next);
		saveSetting("bloom-music-mode-enabled", String(next));
	};

	const toggleNotchRememberPanel = () => {
		const next = !notchRememberPanel;
		setNotchRememberPanel(next);
		saveSetting("bloom-notch-remember-panel", String(next));
	};

	const changeNotchDefaultPanel = (panel: NotchPanelChoice) => {
		setNotchDefaultPanel(panel);
		saveSetting("bloom-notch-default-panel", panel);
	};

	const toggleMusicCompactNotch = () => {
		const next = !musicCompactNotch;
		setMusicCompactNotch(next);
		saveSetting("bloom-music-compact-notch", String(next));
	};

	const toggleMeetingControls = () => {
		const next = !meetingControlsEnabled;
		setMeetingControlsEnabled(next);
		saveSetting("bloom-meeting-controls-enabled", String(next));
	};

	const refreshWallpaperStatus = useCallback(async () => {
		try {
			setWallpaperActive(await invoke<boolean>("wallpaper_is_active"));
		} catch {
			setWallpaperActive(false);
		}
	}, []);

	const applyWallpaperEnabled = async (next: boolean) => {
		setWallpaperError("");
		try {
			if (next) await invoke("wallpaper_show");
			else await invoke("wallpaper_hide");
			setWallpaperEnabled(next);
			setWallpaperActive(next);
			await saveSetting("bloom-wallpaper-enabled", String(next));
		} catch (error) {
			setWallpaperError(String(error));
			await refreshWallpaperStatus();
		}
	};

	const toggleWallpaper = () => {
		void applyWallpaperEnabled(!wallpaperEnabled);
	};

	const changeWallpaperQuality = (quality: WallpaperQuality) => {
		const next = asWallpaperQuality(quality);
		setWallpaperQuality(next);
		saveSetting("bloom-wallpaper-quality", next);
	};

	// "Return to normal wallpaper" closes and destroys the STARK-07 scene. It
	// never touches the Windows wallpaper; the desktop returns exactly as it was.
	const restoreNormalWallpaper = async () => {
		setWallpaperError("");
		try {
			await invoke("wallpaper_restore");
			setWallpaperEnabled(false);
			setWallpaperActive(false);
			await saveSetting("bloom-wallpaper-enabled", "false");
		} catch (error) {
			setWallpaperError(String(error));
			await refreshWallpaperStatus();
		}
	};

	const toggleShelfPersist = () => {
		const next = !shelfPersist;
		setShelfPersist(next);
		saveSetting("bloom-shelf-persist", String(next));
	};

	const toggleMediaLayout = (layout: "classic" | "compact") => {
		setMediaLayout(layout);
		saveSetting("bloom-media-layout", layout);
	};

	const toggleVolumeOverlay = () => {
		const next = !volumeOverlayEnabled;
		setVolumeOverlayEnabled(next);
		saveSetting("bloom-volume-overlay-enabled", String(next));
	};

	const toggleVolumeEdge = () => {
		const next = !volumeEdgeEnabled;
		setVolumeEdgeEnabled(next);
		saveSetting("bloom-volume-edge-enabled", String(next));
	};

	const toggleBrightnessOverlay = () => {
		const next = !brightnessOverlayEnabled;
		setBrightnessOverlayEnabled(next);
		saveSetting("bloom-brightness-overlay-enabled", String(next));
	};

	const toggleBrightnessEdge = () => {
		const next = !brightnessEdgeEnabled;
		setBrightnessEdgeEnabled(next);
		saveSetting("bloom-brightness-edge-enabled", String(next));
	};

	const toggleAmbience = () => {
		const next = !mediaAmbienceEnabled;
		setMediaAmbienceEnabled(next);
		saveSetting("bloom-media-ambience-enabled", String(next));
	};

	const toggleCompactGlow = () => {
		const next = !mediaCompactGlowEnabled;
		setMediaCompactGlowEnabled(next);
		saveSetting("bloom-media-compact-glow-enabled", String(next));
	};

	const toggleEdgeShine = () => {
		const next = !edgeShineEnabled;
		setEdgeShineEnabled(next);
		saveSetting("bloom-edge-shine-enabled", String(next));
	};
	const toggleCorners = () => {
		const next = !cornersEnabled;
		setCornersEnabled(next);
		saveSetting("bloom-corners-enabled", String(next));
	};

	const toggleTimeFormat24h = () => {
		const next = !timeFormat24h;
		setTimeFormat24h(next);
		saveSetting("bloom-time-format-24h", String(next));
	};

	const toggleTempUnit = () => {
		const next = !tempUnitFahrenheit;
		setTempUnitFahrenheit(next);
		saveSetting("bloom-temp-unit", next ? "fahrenheit" : "celsius");
	};

	const toggleDock = () => {
		const next = !dockEnabled;
		setDockEnabled(next);
		saveSetting("bloom-dock-enabled", String(next));
	};

	const toggleDockPreview = () => {
		const next = !dockPreviewEnabled;
		setDockPreviewEnabled(next);
		saveSetting("bloom-dock-preview-enabled", String(next));
	};

	const toggleDockIconOnly = () => {
		const next = !dockIconOnly;
		setDockIconOnly(next);
		saveSetting("bloom-dock-icon-only", String(next));
	};

	const toggleDockSeparator = () => {
		const next = !dockSeparatorEnabled;
		setDockSeparatorEnabled(next);
		saveSetting("bloom-dock-separator-enabled", String(next));
	};

	const handleStartIconChange = (icon: string) => {
		setStartIcon(icon);
		saveSetting("bloom-start-icon", icon);
	};

	const toggleDockAdaptive = () => {
		const next = !dockAdaptive;
		setDockAdaptive(next);
		saveSetting("bloom-dock-adaptive", String(next));
	};

	const toggleDockWinNumber = () => {
		const next = !dockWinNumberEnabled;
		setDockWinNumberEnabled(next);
		saveSetting("bloom-dock-win-number-enabled", String(next));
	};

	const toggleDockWinKeyStart = () => {
		const next = !dockWinKeyStartEnabled;
		setDockWinKeyStartEnabled(next);
		saveSetting("bloom-dock-win-key-start-enabled", String(next));
	};

	const toggleStartMenuEnabled = () => {
		const next = !startMenuEnabled;
		setStartMenuEnabled(next);
		saveSetting("bloom-start-menu-enabled", String(next));
	};

	const toggleStartMenuClickThrough = () => {
		const next = !startMenuClickThrough;
		setStartMenuClickThrough(next);
		saveSetting("bloom-start-menu-click-through", String(next));
	};

	const setStartMenuDefaultPage = (value: StartMenuPage) => {
		const next = value === "apps" ? "apps" : "pinned";
		setStartMenuDefaultPageState(next);
		saveSetting("bloom-start-menu-default-page", next);
	};

	const setStartMenuColumns = (value: number) => {
		const next = value === 4 || value === 5 ? value : 6;
		setStartMenuColumnsState(next);
		saveSetting("bloom-start-menu-columns", String(next));
	};

	const setStartMenuIconSize = (value: StartMenuIconSize) => {
		const next: StartMenuIconSize = value === "compact" || value === "large" ? value : "standard";
		setStartMenuIconSizeState(next);
		saveSetting("bloom-start-menu-icon-size", next);
	};

	const setStartMenuPanelSize = (value: StartMenuPanelSize) => {
		const next: StartMenuPanelSize = value === "compact" || value === "large" ? value : "standard";
		setStartMenuPanelSizeState(next);
		saveSetting("bloom-start-menu-panel-size", next);
	};

	const toggleStartMenuAutoFocus = () => {
		const next = !startMenuAutoFocus;
		setStartMenuAutoFocus(next);
		saveSetting("bloom-start-menu-auto-focus", String(next));
	};

	const toggleStartMenuShowHeader = () => {
		const next = !startMenuShowHeader;
		setStartMenuShowHeader(next);
		saveSetting("bloom-start-menu-show-header", String(next));
	};

	const toggleStartMenuShowFooter = () => {
		const next = !startMenuShowFooter;
		setStartMenuShowFooter(next);
		saveSetting("bloom-start-menu-show-footer", String(next));
	};

	const handleDockExtrasPositionChange = (position: string) => {
		setDockExtrasPosition(position);
		saveSetting("bloom-dock-extras-position", position);
	};

	const toggleDockExtrasDrives = () => {
		const next = !dockExtrasDrives;
		setDockExtrasDrives(next);
		saveSetting("bloom-dock-extras-drives", String(next));
	};

	const toggleDockExtrasDrive = (letter: string) => {
		const next = toggleHiddenDrive(dockExtrasHiddenDrives, letter);
		setDockExtrasHiddenDrives(next);
		saveSetting("bloom-dock-extras-hidden-drives", next);
	};

	const toggleDockExtrasRecycleBin = () => {
		const next = !dockExtrasRecycleBin;
		setDockExtrasRecycleBin(next);
		saveSetting("bloom-dock-extras-recycle-bin", String(next));
	};

	const toggleDockTaskView = () => {
		const next = !dockTaskView;
		setDockTaskView(next);
		saveSetting("bloom-dock-task-view", String(next));
	};

	const toggleDockExtraFolder = (id: string) => {
		const next = toggleEnabledFolder(dockExtrasFolders, id);
		setDockExtrasFolders(next);
		saveSetting("bloom-dock-extras-folders", next);
	};

	const handleAddDockExtraFolder = async () => {
		try {
			const { open: openDialog } = await import("@tauri-apps/plugin-dialog");
			const selected = await openDialog({
				title: "Add a folder to the dock",
				directory: true,
				multiple: false
			});
			if (typeof selected === "string") {
				const next = addCustomFolder(dockExtrasCustomFolders, selected);
				setDockExtrasCustomFolders(next);
				saveSetting("bloom-dock-extras-custom-folders", next);
			}
		} catch (e) {
			console.error("Folder picker failed:", e);
		}
	};

	const handleRemoveDockExtraFolder = (path: string) => {
		const next = removeCustomFolder(dockExtrasCustomFolders, path);
		setDockExtrasCustomFolders(next);
		saveSetting("bloom-dock-extras-custom-folders", next);
	};

	// ── Value setters ──
	const setDockModeValue = (newMode: string) => {
		setDockMode(newMode);
		saveSetting("bloom-dock-mode", newMode);
	};

	const setNotchModeValue = (newMode: string) => {
		setNotchMode(newMode);
		saveSetting("bloom-notch-mode", newMode);
	};

	const handleDockEdgeDelayChange = (val: number) => {
		setDockEdgeDelay(val);
		saveSetting("bloom-dock-edge-delay", val.toString());
	};

	const handleNotchEdgeDelayChange = (val: number) => {
		setNotchEdgeDelay(val);
		saveSetting("bloom-notch-edge-delay", val.toString());
	};

	const handleThresholdChange = (val: number) => {
		setLowBatteryThreshold(val);
		saveSetting("bloom-low-battery-threshold", val.toString());
	};

	const handleScaleChange = (val: number) => {
		setScale(val);
		saveSetting("bloom-scale", val.toString());
	};

	const handleWidgetsChange = (config: WidgetConfig) => {
		setStatusWidgets(config);
		saveSetting("bloom-status-widgets", JSON.stringify(config));
	};

	// ── Theme handlers ──
	const handleThemeModeChange = async (mode: string) => {
		setThemeMode(mode);
		saveSetting("bloom-theme-mode", mode);

		if (mode === "adaptive") {
			try {
				const accentHex = await invoke<string>("get_system_accent_color");
				const hsl = hexToHsl(accentHex);
				setThemeSaturation(hsl.s / 100);
				saveSetting("bloom-theme-saturation", String(hsl.s / 100));
				setThemeBrightness(hsl.l / 100);
				saveSetting("bloom-theme-brightness", String(hsl.l / 100));
			} catch (e) {
				console.error("Failed to parse adaptive accent HSL:", e);
			}
		}
	};

	const handleThemeColorChange = (color: string) => {
		setThemeColor(color);
		saveSetting("bloom-theme-color", color);

		try {
			const hsl = hexToHsl(color);
			setThemeSaturation(hsl.s / 100);
			saveSetting("bloom-theme-saturation", String(hsl.s / 100));
			setThemeBrightness(hsl.l / 100);
			saveSetting("bloom-theme-brightness", String(hsl.l / 100));
		} catch (e) {
			console.error("Failed to parse custom color HSL:", e);
		}
	};

	const handleOpacityChange = (value: number) => {
		setThemeOpacity(value);
		saveSetting("bloom-theme-opacity", String(value));
	};

	const handleSaturationChange = (value: number) => {
		setThemeSaturation(value);
		saveSetting("bloom-theme-saturation", String(value));
	};

	const handleBrightnessChange = (value: number) => {
		setThemeBrightness(value);
		saveSetting("bloom-theme-brightness", String(value));
	};

	// ── City search ──
	const selectCity = async (city: {
		name: string;
		country: string;
		latitude: number;
		longitude: number;
	}) => {
		setCityName(city.name);
		setShowCityDropdown(false);
		setCitySearchResults([]);
		const saved =
			(await saveLocation("bloom-weather-lat", city.latitude.toString())) &&
			(await saveLocation("bloom-weather-lon", city.longitude.toString())) &&
			(await saveSetting("bloom-weather-city", city.name));
		if (saved) emit("weather-refresh", { lat: city.latitude, lon: city.longitude });
	};

	const handleCityClear = async () => {
		setCityName("");
		setShowCityDropdown(false);
		setCitySearchResults([]);
		const saved =
			(await saveLocation("bloom-weather-lat", null)) &&
			(await saveLocation("bloom-weather-lon", null)) &&
			(await saveSetting("bloom-weather-city", null));
		if (saved) emit("weather-refresh", true);
	};

	// ── Reset to defaults ──
	const resetToDefaults = async () => {
		try {
			const { ask } = await import("@tauri-apps/plugin-dialog");
			const confirmed = await ask(
				"All settings return to their defaults and Bloom restarts. Pinned apps and custom icons are kept.",
				{
					title: "Reset Bloom to Defaults",
					kind: "warning",
					okLabel: "Reset and Restart",
					cancelLabel: "Cancel"
				}
			);
			if (!confirmed) return;

			await invoke("reset_settings");

			// settings.json is cleared, but every window also caches bloom keys
			// in localStorage; drop them so the restart can't resurrect values.
			// The first-run/version sentinels are lifecycle markers, not
			// preferences — keeping them avoids replaying the splash, which
			// would also re-trigger the first-run autostart enable.
			const keep = new Set(["bloom-first-run", "bloom-app-version"]);
			for (const key of Object.keys(localStorage)) {
				if (key.startsWith("bloom-") && !keep.has(key)) localStorage.removeItem(key);
			}

			await invoke("restart_bloom").catch(console.error);
		} catch (e) {
			console.error("Reset failed:", e);
		}
	};

	// ── Export / Import ──
	// The backend opens the native dialog and owns the file path, so these
	// cannot be used to read or write arbitrary files from a webview.
	const handleExportSettings = async () => {
		setExportStatus("exporting");
		try {
			const filePath = await invoke<string | null>("export_settings_to_file");
			if (filePath) {
				setExportStatus("success");
				setTimeout(() => setExportStatus("idle"), 2000);
			} else {
				setExportStatus("idle");
			}
		} catch (e) {
			console.error("Export failed:", e);
			setExportStatus("error");
			setTimeout(() => setExportStatus("idle"), 3000);
		}
	};

	const handleImportSettings = async () => {
		setImportStatus("importing");
		try {
			const filePath = await invoke<string | null>("import_settings_from_file");
			if (filePath) {
				await loadAllSettings();
				setImportStatus("success");
				setTimeout(() => setImportStatus("idle"), 2000);
			} else {
				setImportStatus("idle");
			}
		} catch (e) {
			console.error("Import failed:", e);
			setImportStatus("error");
			setTimeout(() => setImportStatus("idle"), 3000);
		}
	};

	return {
		isLoaded,
		flushPendingSaves,
		saveError,
		saveErrorDetail,
		dismissSaveError,
		// System
		autostart,
		toggleAutostart,
		lowBatteryThreshold,
		handleThresholdChange,
		timeFormat24h,
		toggleTimeFormat24h,
		scale,
		handleScaleChange,
		cornersEnabled,
		toggleCorners,
		edgeShineEnabled,
		toggleEdgeShine,

		// Theme
		themeMode,
		handleThemeModeChange,
		themeColor,
		handleThemeColorChange,
		themeOpacity,
		handleOpacityChange,
		themeSaturation,
		handleSaturationChange,
		themeBrightness,
		handleBrightnessChange,

		// Notch
		notchMode,
		setNotchModeValue,
		notchEdgeDelay,
		handleNotchEdgeDelayChange,
		calendarMondayFirst,
		toggleCalendarMondayFirst,
		calendarEnabled,
		toggleCalendar,
		controlsPanelEnabled,
		toggleControlsPanel,
		devicesPanelEnabled,
		toggleDevicesPanel,
		enabledPanelCount,
		timerSoundEnabled,
		toggleTimerSound,
		musicModeEnabled,
		toggleMusicMode,
		notchRememberPanel,
		toggleNotchRememberPanel,
		notchDefaultPanel,
		changeNotchDefaultPanel,
		musicCompactNotch,
		toggleMusicCompactNotch,
		meetingControlsEnabled,
		toggleMeetingControls,
		shelfPersist,
		toggleShelfPersist,
		mediaLayout,
		toggleMediaLayout,
		mediaAmbienceEnabled,
		toggleAmbience,
		mediaCompactGlowEnabled,
		toggleCompactGlow,

		// Weather
		weatherEnabled,
		toggleWeather,
		tempUnitFahrenheit,
		toggleTempUnit,
		cityName,
		setCityName,
		citySearchResults,
		showCityDropdown,
		setShowCityDropdown,
		selectCity,
		handleCityClear,

		// Widgets
		statusWidgets,
		handleWidgetsChange,

		// Wallpaper
		wallpaperEnabled,
		wallpaperActive,
		wallpaperQuality,
		wallpaperError,
		toggleWallpaper,
		changeWallpaperQuality,
		restoreNormalWallpaper,
		refreshWallpaperStatus,

		// Dock
		dockEnabled,
		toggleDock,
		dockMode,
		setDockModeValue,
		dockEdgeDelay,
		handleDockEdgeDelayChange,
		dockPreviewEnabled,
		toggleDockPreview,
		dockIconOnly,
		toggleDockIconOnly,
		dockSeparatorEnabled,
		toggleDockSeparator,
		startIcon,
		handleStartIconChange,
		startMenuEnabled,
		toggleStartMenuEnabled,
		startMenuClickThrough,
		toggleStartMenuClickThrough,
		startMenuDefaultPage,
		setStartMenuDefaultPage,
		startMenuColumns,
		setStartMenuColumns,
		startMenuIconSize,
		setStartMenuIconSize,
		startMenuPanelSize,
		setStartMenuPanelSize,
		startMenuAutoFocus,
		toggleStartMenuAutoFocus,
		startMenuShowHeader,
		toggleStartMenuShowHeader,
		startMenuShowFooter,
		toggleStartMenuShowFooter,
		dockAdaptive,
		toggleDockAdaptive,
		dockWinNumberEnabled,
		toggleDockWinNumber,
		dockWinKeyStartEnabled,
		toggleDockWinKeyStart,
		dockExtrasPosition,
		handleDockExtrasPositionChange,
		dockExtrasDrives,
		toggleDockExtrasDrives,
		dockExtrasHiddenDrives,
		toggleDockExtrasDrive,
		dockExtrasRecycleBin,
		toggleDockExtrasRecycleBin,
		dockTaskView,
		toggleDockTaskView,
		dockExtrasFolders,
		toggleDockExtraFolder,
		dockExtrasCustomFolders,
		handleAddDockExtraFolder,
		handleRemoveDockExtraFolder,

		// Overlays
		volumeOverlayEnabled,
		toggleVolumeOverlay,
		volumeEdgeEnabled,
		toggleVolumeEdge,
		brightnessOverlayEnabled,
		toggleBrightnessOverlay,
		brightnessEdgeEnabled,
		toggleBrightnessEdge,

		appVersion,

		// Import / Export
		exportStatus,
		importStatus,
		handleExportSettings,
		handleImportSettings,

		// Utilities
		restartBloom: () => invoke("restart_bloom"),
		resetToDefaults,
		quitBloom: () => invoke("quit_bloom")
	};
}
