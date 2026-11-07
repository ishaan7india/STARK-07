import type { ComponentType, SVGProps } from "react";

export interface WidgetConfig {
	left: string[];
	right: string[];
}

export type SettingsTab =
	| "general"
	| "appearance"
	| "notch"
	| "wallpaper"
	| "dock"
	| "start-menu"
	| "overlays"
	| "about";
export type StartMenuPage = "pinned" | "apps";
export type StartMenuIconSize = "compact" | "standard" | "large";
export type StartMenuPanelSize = "compact" | "standard" | "large";

export interface SettingRowProps {
	icon: ComponentType<SVGProps<SVGSVGElement> & { size?: number; strokeWidth?: number }>;
	label: string;
	desc?: string;
	action?: boolean;
	danger?: boolean;
	divider?: boolean;
	onClick?: () => void;
	children?: React.ReactNode;
}
