import { FileDown, Upload } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { GithubIcon } from "../icons";
import { SettingRow } from "./SettingRow";

interface AboutTabProps {
	appVersion: string;
	exportStatus: string;
	importStatus: string;
	handleExportSettings: () => void;
	handleImportSettings: () => void;
}

export function AboutTab({
	appVersion,
	exportStatus,
	importStatus,
	handleExportSettings,
	handleImportSettings
}: AboutTabProps) {
	const getExportLabel = () => {
		if (exportStatus === "exporting") return "Exporting...";
		if (exportStatus === "success") return "Exported!";
		if (exportStatus === "error") return "Export failed. Try again.";
		return "Export Settings";
	};

	const getImportLabel = () => {
		if (importStatus === "importing") return "Importing...";
		if (importStatus === "success") return "Imported!";
		if (importStatus === "error") return "Import failed. Check the file and try again.";
		return "Import Settings";
	};

	return (
		<div className="about-tab-container">
			<div className="about-header">
				<img
					src="/branding/stark-07-emblem.png"
					className="about-logo stark-logo-pulse"
					alt="STARK-07 emblem"
					draggable={false}
				/>
				<h1 className="about-title">STARK-07 OS</h1>
				<p className="about-version">Version {appVersion}</p>
				<p className="about-credit">
					Based on Bloom by{" "}
					<button
						className="about-author"
						onClick={() => openUrl("https://github.com/SehajveerSingh2005")}
						title="sehaz on GitHub"
					>
						<GithubIcon size={12} />
						<span>sehaz</span>
					</button>
				</p>
			</div>

			<div className="setting-group-label">Software Updates</div>
			<div className="setting-group">
				<SettingRow
					icon={FileDown}
					label="Signed update channel not configured"
					desc="Automatic and in-app updates are disabled for this custom STARK-07 build."
					divider={false}
				/>
			</div>

			<div className="setting-group-label setting-group-label--spaced">Network &amp; Privacy</div>
			<div className="setting-group">
				<p className="about-version">
					Weather is off until enabled. When you enter a place, its name goes to Open-Meteo geocoding; the selected coordinates go to its forecast API. The app does not use IP geolocation. Public Bloom announcements are fetched from bloom.sehaz.space, which receives a routine request and your network IP. Wi-Fi passwords are passed to Windows only when you choose to connect; STARK-07 does not send them to a website. Browser passwords and cookies are not read, and typed keys are not recorded.
				</p>
			</div>

			<div className="setting-group-label setting-group-label--spaced">Data</div>
			<div className="setting-group">
				<SettingRow
					icon={FileDown}
					label={getExportLabel()}
					desc="Save settings to a file"
					action
					onClick={handleExportSettings}
				/>
				<SettingRow
					icon={Upload}
					label={getImportLabel()}
					desc="Load settings from a file"
					action
					divider={false}
					onClick={handleImportSettings}
				/>
			</div>
		</div>
	);
}
