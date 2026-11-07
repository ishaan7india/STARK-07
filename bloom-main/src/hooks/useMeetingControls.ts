import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface MeetingAppPresence {
	id: string;
	name: string;
	running: boolean;
	meeting_detected: boolean;
}

export interface MeetingStatus {
	available: boolean;
	app_id: string | null;
	app_name: string | null;
	window_title: string | null;
	mic_available: boolean;
	camera_available: boolean;
	mic_muted: boolean | null;
	camera_on: boolean | null;
	mic_state: "reported" | "inferred" | "unknown";
	camera_state: "reported" | "inferred" | "unknown";
	message: string;
}

export interface MeetingReport {
	apps: MeetingAppPresence[];
	active: MeetingStatus | null;
	message: string;
}

interface MeetingToggleResult {
	action_sent: boolean;
	changed: boolean;
	message: string;
	report: MeetingReport;
}

/**
 * Polls the backend for a live meeting window only while the setting is on.
 * UI Automation runs in the Rust command; no keyboard hooks or private app
 * APIs are involved.
 */
export function useMeetingControls(enabled: boolean) {
	const [report, setReport] = useState<MeetingReport | null>(null);
	const [busy, setBusy] = useState(false);
	const [notice, setNotice] = useState<string | null>(null);
	const mounted = useRef(true);

	useEffect(() => {
		mounted.current = true;
		return () => {
			mounted.current = false;
		};
	}, []);

	const refresh = useCallback(async () => {
		try {
			const next = await invoke<MeetingReport>("meeting_get_status");
			if (mounted.current) setReport(next);
			return next;
		} catch {
			if (mounted.current) {
				setReport({
					apps: [],
					active: null,
					message: "Meeting detection is unavailable in this build."
				});
			}
			return null;
		}
	}, []);

	useEffect(() => {
		if (!enabled) {
			setReport(null);
			setNotice(null);
			return;
		}
		let cancelled = false;
		const tick = async () => {
			if (cancelled) return;
			await refresh();
		};
		void tick();
		const interval = setInterval(tick, 5000);
		return () => {
			cancelled = true;
			clearInterval(interval);
		};
	}, [enabled, refresh]);

	const toggle = useCallback(async (control: "mic" | "camera") => {
		setBusy(true);
		setNotice(null);
		try {
			const result = await invoke<MeetingToggleResult>("meeting_toggle", { control });
			if (mounted.current) {
				setReport(result.report);
				setNotice(result.message);
			}
		} catch (error) {
			if (mounted.current) {
				setNotice(String(error));
			}
		} finally {
			if (mounted.current) setBusy(false);
		}
	}, []);

	const focus = useCallback(async (appId: string | null) => {
		if (!appId) return;
		try {
			await invoke("meeting_focus_app", { appId });
		} catch (error) {
			setNotice(String(error));
		}
	}, []);

	return { report, busy, notice, refresh, toggle, focus };
}
