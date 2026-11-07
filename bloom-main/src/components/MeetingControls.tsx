import { Camera, CameraOff, ExternalLink, Loader2, Mic, MicOff } from "lucide-react";
import type { MeetingReport, MeetingStatus } from "../hooks/useMeetingControls";

interface MeetingControlsProps {
	report: MeetingReport | null;
	busy: boolean;
	notice: string | null;
	onToggle: (control: "mic" | "camera") => void;
	onFocus: (appId: string | null) => void;
}

function stateLabel(
	kind: "mic" | "camera",
	available: boolean,
	value: boolean | null,
	confidence: "reported" | "inferred" | "unknown"
): string {
	if (!available) return "Not available";
	if (value === null) return "State unknown";
	const label = kind === "mic" ? (value ? "Muted" : "Live") : value ? "On" : "Off";
	return confidence === "inferred" ? `${label} (inferred)` : label;
}

export function MeetingControlsView({
	report,
	busy,
	notice,
	onToggle,
	onFocus
}: MeetingControlsProps) {
	const active: MeetingStatus | null = report?.active ?? null;

	if (!report) {
		return (
			<div className="meeting-controls empty" onClick={(event) => event.stopPropagation()}>
				<div className="meeting-controls-head">
					<span className="meeting-dot waiting" />
					<div>
						<strong>Checking meeting apps…</strong>
						<span>Reading their own accessibility controls</span>
					</div>
				</div>
			</div>
		);
	}

	if (!active) {
		const running = report.apps.filter((app) => app.running);
		return (
			<div className="meeting-controls empty" onClick={(event) => event.stopPropagation()}>
				<div className="meeting-controls-head">
					<span className="meeting-dot off" />
					<div>
						<strong>No meeting detected</strong>
						<span>
							{running.length > 0
								? `${running.map((app) => app.name).join(", ")} running`
								: "None of the supported apps is running"}
						</span>
					</div>
				</div>
				<ul className="meeting-apps-list" aria-label="Supported meeting apps">
					{report.apps.map((app) => (
						<li
							key={app.id}
							className={
								app.meeting_detected
									? "in-call"
									: app.running
										? "running"
										: "off"
							}
						>
							<span className="meeting-app-dot" aria-hidden="true" />
							<span className="meeting-app-name">{app.name}</span>
							<span className="meeting-app-state">
								{app.meeting_detected
									? "In a meeting"
									: app.running
										? app.id === "meet"
											? "Browser running"
											: "Running, no call"
										: "Not running"}
							</span>
						</li>
					))}
				</ul>
				<p className="meeting-hint">
					A meeting appears once its own microphone or camera button is visible to Windows
					accessibility. Open the call window, then check here again.
				</p>
			</div>
		);
	}

	const micMuted = active.mic_muted;
	const cameraOn = active.camera_on;
	return (
		<div className="meeting-controls" onClick={(event) => event.stopPropagation()}>
			<div className="meeting-controls-head">
				<span className="meeting-dot" />
				<div className="meeting-heading-copy">
					<strong>{active.app_name}</strong>
					<span title={active.window_title ?? undefined}>
						{active.window_title || "Meeting window"}
					</span>
				</div>
				<button
					className="meeting-open-app"
					onClick={() => onFocus(active.app_id)}
					title="Bring the meeting app to the front"
				>
					<ExternalLink size={11} />
					<span>Open</span>
				</button>
			</div>

			<div className="meeting-actions">
				<button
					className={`meeting-action ${micMuted ? "muted" : "live"}`}
					disabled={busy || !active.mic_available}
					onClick={() => onToggle("mic")}
					aria-pressed={micMuted === true}
					title={active.mic_available ? "Toggle microphone" : "No microphone control found"}
				>
					{busy ? (
						<Loader2 size={18} className="meeting-spinner" />
					) : micMuted ? (
						<MicOff size={18} />
					) : (
						<Mic size={18} />
					)}
					<span>{micMuted === null ? "Microphone" : micMuted ? "Unmute" : "Mute"}</span>
					<small>
						{stateLabel("mic", active.mic_available, micMuted, active.mic_state)}
					</small>
				</button>

				<button
					className={`meeting-action ${cameraOn ? "live" : "off"}`}
					disabled={busy || !active.camera_available}
					onClick={() => onToggle("camera")}
					aria-pressed={cameraOn === true}
					title={active.camera_available ? "Toggle camera" : "No camera control found"}
				>
					{busy ? (
						<Loader2 size={18} className="meeting-spinner" />
					) : cameraOn ? (
						<Camera size={18} />
					) : (
						<CameraOff size={18} />
					)}
					<span>{cameraOn === null ? "Camera" : cameraOn ? "Turn off" : "Turn on"}</span>
					<small>
						{stateLabel("camera", active.camera_available, cameraOn, active.camera_state)}
					</small>
				</button>
			</div>

			{(notice || active.message) && (
				<p className={`meeting-note ${notice ? "notice" : ""}`}>{notice || active.message}</p>
			)}
		</div>
	);
}
