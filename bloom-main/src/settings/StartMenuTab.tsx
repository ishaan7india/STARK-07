import {
	Columns2,
	Eye,
	Keyboard,
	LayoutGrid,
	Maximize2,
	MousePointer2,
	PanelTop,
	Search
} from "lucide-react";
import { SettingRow } from "./SettingRow";
import type { StartMenuIconSize, StartMenuPage, StartMenuPanelSize } from "./types";

export interface StartMenuTabProps {
	enabled: boolean;
	toggleEnabled: () => void;
	clickThrough: boolean;
	toggleClickThrough: () => void;
	defaultPage: StartMenuPage;
	setDefaultPage: (page: StartMenuPage) => void;
	columns: number;
	setColumns: (columns: number) => void;
	iconSize: StartMenuIconSize;
	setIconSize: (size: StartMenuIconSize) => void;
	panelSize: StartMenuPanelSize;
	setPanelSize: (size: StartMenuPanelSize) => void;
	autoFocus: boolean;
	toggleAutoFocus: () => void;
	showHeader: boolean;
	toggleShowHeader: () => void;
	showFooter: boolean;
	toggleShowFooter: () => void;
}

export function StartMenuTab({
	enabled,
	toggleEnabled,
	clickThrough,
	toggleClickThrough,
	defaultPage,
	setDefaultPage,
	columns,
	setColumns,
	iconSize,
	setIconSize,
	panelSize,
	setPanelSize,
	autoFocus,
	toggleAutoFocus,
	showHeader,
	toggleShowHeader,
	showFooter,
	toggleShowFooter
}: StartMenuTabProps) {
	return (
		<>
			<div className="setting-group-label">Launcher</div>
			<div className="setting-group">
				<SettingRow
					icon={LayoutGrid}
					label="Enable STARK Start"
					desc="Use this launcher from the dock and Windows key"
				>
					<label className="toggle-switch">
						<input type="checkbox" checked={enabled} onChange={toggleEnabled} />
						<span className="slider"></span>
					</label>
				</SettingRow>

				<SettingRow
					icon={MousePointer2}
					label="Click-through mode"
					desc="Let clicks pass through; menu controls will not respond"
				>
					<label className="toggle-switch">
						<input type="checkbox" checked={clickThrough} onChange={toggleClickThrough} />
						<span className="slider"></span>
					</label>
				</SettingRow>

				<SettingRow icon={Keyboard} label="Open to" desc="Choose the first page each time it opens">
					<select
						className="settings-select"
						value={defaultPage}
						onChange={(event) => setDefaultPage(event.target.value as StartMenuPage)}
					>
						<option value="pinned">Pinned</option>
						<option value="apps">All apps</option>
					</select>
				</SettingRow>

				<SettingRow icon={Search} label="Focus search when opened" desc="Start typing to find an app">
					<label className="toggle-switch">
						<input type="checkbox" checked={autoFocus} onChange={toggleAutoFocus} />
						<span className="slider"></span>
					</label>
				</SettingRow>
			</div>

			<div className="setting-group-label setting-group-label--spaced">Appearance & layout</div>
			<div className="setting-group">
				<SettingRow icon={Maximize2} label="Menu size" desc="Set the launcher's width and height">
					<select
						className="settings-select"
						value={panelSize}
						onChange={(event) => setPanelSize(event.target.value as StartMenuPanelSize)}
					>
						<option value="compact">Compact</option>
						<option value="standard">Standard</option>
						<option value="large">Large</option>
					</select>
				</SettingRow>

				<SettingRow icon={Columns2} label="App columns" desc="Apps shown across each row">
					<select
						className="settings-select"
						value={columns}
						onChange={(event) => setColumns(Number(event.target.value))}
					>
						<option value={4}>4 columns</option>
						<option value={5}>5 columns</option>
						<option value={6}>6 columns</option>
					</select>
				</SettingRow>

				<SettingRow icon={LayoutGrid} label="App icon size" desc="Adjust the pinned and installed app tiles">
					<select
						className="settings-select"
						value={iconSize}
						onChange={(event) => setIconSize(event.target.value as StartMenuIconSize)}
					>
						<option value="compact">Compact</option>
						<option value="standard">Standard</option>
						<option value="large">Large</option>
					</select>
				</SettingRow>

				<SettingRow icon={PanelTop} label="Show greeting and time" desc="Keep the STARK-07 identity at the top">
					<label className="toggle-switch">
						<input type="checkbox" checked={showHeader} onChange={toggleShowHeader} />
						<span className="slider"></span>
					</label>
				</SettingRow>

				<SettingRow icon={Eye} label="Show app count and save status" desc="Keep the local preference indicator in the footer">
					<label className="toggle-switch">
						<input type="checkbox" checked={showFooter} onChange={toggleShowFooter} />
						<span className="slider"></span>
					</label>
				</SettingRow>
			</div>

			<div className="start-menu-settings-note">
				<span className="start-menu-settings-note-mark">i</span>
				<span>Use <strong>Edit apps</strong> inside STARK Start to add or remove pinned apps. Your choices stay on this device.</span>
			</div>
		</>
	);
}
