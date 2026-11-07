//! Meeting controls for Microsoft Teams, Zoom, Discord and Google Meet.
//!
//! This module only uses documented Windows UI Automation: it finds a visible
//! meeting window, looks for the app's own microphone/camera button, and asks
//! that button to toggle. It never sends guessed keyboard shortcuts, reads
//! chat content, or keeps any data after the command returns.
//!
//! An app only counts as "in a meeting" when its window exposes microphone or
//! camera controls through UI Automation. State is read from the control's
//! accessible name first (for example "Unmute" means the microphone is
//! currently muted). If an app exposes only a toggle pattern, the state is
//! reported as inferred rather than as a confirmed reading.

use serde::Serialize;
use std::collections::HashSet;
use windows::core::{Interface, BOOL};
use windows::Win32::Foundation::{CloseHandle, HWND, LPARAM};
use windows::Win32::Graphics::Dwm::{DwmGetWindowAttribute, DWMWA_CLOAKED};
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_INPROC_SERVER,
    COINIT_MULTITHREADED,
};
use windows::Win32::System::Diagnostics::ToolHelp::{
    CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W,
    TH32CS_SNAPPROCESS,
};
use windows::Win32::UI::Accessibility::{
    CUIAutomation8, IUIAutomation, IUIAutomation2, IUIAutomationElement,
    IUIAutomationInvokePattern, IUIAutomationTogglePattern, TreeScope_Descendants,
    UIA_ButtonControlTypeId, UIA_CustomControlTypeId, UIA_InvokePatternId,
    UIA_TogglePatternId, ToggleState_Off, ToggleState_On,
};
use windows::Win32::UI::WindowsAndMessaging::{
    EnumWindows, GetWindowLongW, GetWindowTextW, GetWindowThreadProcessId, IsIconic,
    IsWindowVisible, SetForegroundWindow, ShowWindow, GWL_EXSTYLE, SW_RESTORE, WS_EX_TOOLWINDOW,
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum AppKind {
    Teams,
    Zoom,
    Discord,
    Meet,
}

impl AppKind {
    fn id(self) -> &'static str {
        match self {
            Self::Teams => "teams",
            Self::Zoom => "zoom",
            Self::Discord => "discord",
            Self::Meet => "meet",
        }
    }

    fn name(self) -> &'static str {
        match self {
            Self::Teams => "Microsoft Teams",
            Self::Zoom => "Zoom",
            Self::Discord => "Discord",
            Self::Meet => "Google Meet",
        }
    }

    fn all() -> [Self; 4] {
        [Self::Teams, Self::Zoom, Self::Discord, Self::Meet]
    }
}

fn classify(path: &str, title: &str) -> Option<AppKind> {
    let exe = path
        .rsplit(['\\', '/'])
        .next()
        .unwrap_or(path)
        .to_ascii_lowercase();
    let title = title.to_ascii_lowercase();
    if exe.contains("teams") {
        return Some(AppKind::Teams);
    }
    if exe == "zoom.exe" {
        return Some(AppKind::Zoom);
    }
    if exe.contains("discord") {
        return Some(AppKind::Discord);
    }
    const BROWSERS: [&str; 8] = [
        "chrome.exe",
        "msedge.exe",
        "brave.exe",
        "firefox.exe",
        "opera.exe",
        "vivaldi.exe",
        "arc.exe",
        "zen.exe",
    ];
    // A browser is only a Meet candidate when its window title looks like a
    // Meet call, so ordinary YouTube/Google tabs are never treated as meetings.
    if BROWSERS.contains(&exe.as_str())
        && (title.contains("meet.google.com")
            || title.contains("google meet")
            || title.starts_with("meet -")
            || title.starts_with("meet –"))
    {
        return Some(AppKind::Meet);
    }
    None
}

#[derive(Serialize, Clone)]
pub struct MeetingAppPresence {
    pub id: String,
    pub name: String,
    /// The desktop app is running (or, for Meet, a supported browser is).
    pub running: bool,
    /// A meeting window with microphone or camera controls was found.
    pub meeting_detected: bool,
}

#[derive(Serialize, Clone)]
pub struct MeetingStatus {
    pub available: bool,
    pub app_id: Option<String>,
    pub app_name: Option<String>,
    pub window_title: Option<String>,
    pub mic_available: bool,
    pub camera_available: bool,
    /// `true` means the microphone is muted.
    pub mic_muted: Option<bool>,
    /// `true` means the camera is on.
    pub camera_on: Option<bool>,
    /// "reported" (accessible name), "inferred" (toggle pattern) or "unknown".
    pub mic_state: String,
    pub camera_state: String,
    pub message: String,
}

#[derive(Serialize, Clone)]
pub struct MeetingReport {
    pub apps: Vec<MeetingAppPresence>,
    pub active: Option<MeetingStatus>,
    /// A short, non-sensitive explanation of any limitation.
    pub message: String,
}

#[derive(Serialize, Clone)]
pub struct MeetingToggleResult {
    pub action_sent: bool,
    pub changed: bool,
    pub message: String,
    pub report: MeetingReport,
}

struct WindowInfo {
    hwnd: HWND,
    title: String,
    path: String,
}

unsafe extern "system" fn collect_window(hwnd: HWND, lparam: LPARAM) -> BOOL {
    let windows = &mut *(lparam.0 as *mut Vec<WindowInfo>);
    if !IsWindowVisible(hwnd).as_bool() || IsIconic(hwnd).as_bool() {
        return true.into();
    }
    let ex_style = GetWindowLongW(hwnd, GWL_EXSTYLE) as u32;
    if ex_style & WS_EX_TOOLWINDOW.0 != 0 {
        return true.into();
    }
    let mut cloaked = 0u32;
    if DwmGetWindowAttribute(
        hwnd,
        DWMWA_CLOAKED,
        &mut cloaked as *mut _ as *mut _,
        std::mem::size_of::<u32>() as u32,
    )
    .is_ok()
        && cloaked != 0
    {
        return true.into();
    }

    let mut title_buf = [0u16; 512];
    let title_len = GetWindowTextW(hwnd, &mut title_buf);
    if title_len == 0 {
        return true.into();
    }
    let title = String::from_utf16_lossy(&title_buf[..title_len as usize]);
    let mut pid = 0u32;
    GetWindowThreadProcessId(hwnd, Some(&mut pid));
    if pid == 0 {
        return true.into();
    }
    if let Some(path) = crate::commands::process_image_path(pid) {
        windows.push(WindowInfo { hwnd, title, path });
    }
    true.into()
}

unsafe fn visible_windows() -> Vec<WindowInfo> {
    let mut windows = Vec::new();
    let _ = EnumWindows(
        Some(collect_window),
        LPARAM(&mut windows as *mut Vec<WindowInfo> as isize),
    );
    windows
}

/// Every executable name currently running, from the OS process list. Used
/// only to tell the Settings tab which supported apps are present.
unsafe fn running_processes() -> HashSet<String> {
    let mut names = HashSet::new();
    let Ok(snapshot) = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) else {
        return names;
    };
    let mut entry = PROCESSENTRY32W {
        dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32,
        ..Default::default()
    };
    let mut more = Process32FirstW(snapshot, &mut entry).is_ok();
    while more {
        let len = entry
            .szExeFile
            .iter()
            .position(|&c| c == 0)
            .unwrap_or(entry.szExeFile.len());
        names.insert(String::from_utf16_lossy(&entry.szExeFile[..len]).to_ascii_lowercase());
        more = Process32NextW(snapshot, &mut entry).is_ok();
    }
    let _ = CloseHandle(snapshot);
    names
}

fn browser_running(processes: &HashSet<String>) -> bool {
    [
        "chrome.exe",
        "msedge.exe",
        "brave.exe",
        "firefox.exe",
        "opera.exe",
        "vivaldi.exe",
        "arc.exe",
        "zen.exe",
    ]
    .iter()
    .any(|exe| processes.contains(*exe))
}

#[derive(Clone)]
struct ControlInfo {
    name: String,
    automation_id: String,
    toggle_state: Option<bool>,
    has_toggle: bool,
    has_invoke: bool,
}

struct WindowProbe {
    mic: Option<ControlInfo>,
    camera: Option<ControlInfo>,
    call_indicator: bool,
}

fn lower(value: windows::core::BSTR) -> String {
    value.to_string().to_ascii_lowercase()
}

fn mic_score(name: &str, automation_id: &str) -> i32 {
    let text = format!("{name} {automation_id}");
    let mut score = 0;
    if text.contains("unmute") || text.contains("turn on mic") || text.contains("start mic") {
        score += 60;
    }
    if text.contains("mute") || text.contains("turn off mic") || text.contains("stop mic") {
        score += 45;
    }
    if text.contains("microphone") || text.contains("mic-button") || text.contains("micbutton") {
        score += 35;
    }
    if text.contains("camera")
        || text.contains("video")
        || text.contains("speaker")
        || text.contains("headphone")
        || text.contains("deafen")
    {
        score -= 120;
    }
    score
}

fn camera_score(name: &str, automation_id: &str) -> i32 {
    let text = format!("{name} {automation_id}");
    let mut score = 0;
    if text.contains("turn off camera")
        || text.contains("stop video")
        || text.contains("turn off video")
        || text.contains("camera off")
    {
        score += 60;
    }
    if text.contains("turn on camera")
        || text.contains("start video")
        || text.contains("turn on video")
        || text.contains("camera on")
    {
        score += 55;
    }
    if text.contains("camera")
        || text.contains("video-button")
        || text.contains("videobutton")
        || text.contains("video")
    {
        score += 40;
    }
    if text.contains("microphone")
        || text.contains("mute")
        || text.contains("speaker")
        || text.contains("headphone")
        || text.contains("screen share")
        || text.contains("deafen")
    {
        score -= 120;
    }
    score
}

unsafe fn control_from_element(element: &IUIAutomationElement) -> Option<ControlInfo> {
    let control_type = element.CurrentControlType().ok()?;
    if control_type != UIA_ButtonControlTypeId && control_type != UIA_CustomControlTypeId {
        return None;
    }
    if element
        .CurrentIsOffscreen()
        .is_ok_and(|offscreen| offscreen.as_bool())
    {
        return None;
    }
    if element
        .CurrentIsEnabled()
        .is_ok_and(|enabled| !enabled.as_bool())
    {
        return None;
    }
    let name = element.CurrentName().map(lower).unwrap_or_default();
    let automation_id = element.CurrentAutomationId().map(lower).unwrap_or_default();
    if name.is_empty() && automation_id.is_empty() {
        return None;
    }
    let toggle = element
        .GetCurrentPatternAs::<IUIAutomationTogglePattern>(UIA_TogglePatternId)
        .ok();
    let toggle_state = toggle
        .as_ref()
        .and_then(|pattern| pattern.CurrentToggleState().ok())
        .and_then(|state| {
            if state == ToggleState_On {
                Some(true)
            } else if state == ToggleState_Off {
                Some(false)
            } else {
                None
            }
        });
    let has_invoke = element
        .GetCurrentPatternAs::<IUIAutomationInvokePattern>(UIA_InvokePatternId)
        .is_ok();
    Some(ControlInfo {
        name,
        automation_id,
        toggle_state,
        has_toggle: toggle.is_some(),
        has_invoke,
    })
}

unsafe fn probe_window(automation: &IUIAutomation, info: &WindowInfo) -> Option<WindowProbe> {
    let root = automation.ElementFromHandle(info.hwnd).ok()?;
    let condition = automation.CreateTrueCondition().ok()?;
    let elements = root.FindAll(TreeScope_Descendants, &condition).ok()?;
    let count = elements.Length().unwrap_or(0).min(1400);

    let mut probe = WindowProbe {
        mic: None,
        camera: None,
        call_indicator: false,
    };
    let mut mic_best = 0;
    let mut camera_best = 0;

    for index in 0..count {
        let Ok(element) = elements.GetElement(index) else {
            continue;
        };
        let Some(control) = control_from_element(&element) else {
            continue;
        };

        // Discord's microphone button is always in its user panel, even
        // outside a call. Its call-only "Disconnect" button tells us a voice
        // call is actually connected.
        if control.name.contains("disconnect") || control.name.contains("voice connected") {
            probe.call_indicator = true;
        }

        let mic = mic_score(&control.name, &control.automation_id);
        if mic > mic_best {
            mic_best = mic;
            probe.mic = Some(control.clone());
        }
        let camera = camera_score(&control.name, &control.automation_id);
        if camera > camera_best {
            camera_best = camera;
            probe.camera = Some(control.clone());
        }
        if probe.mic.is_some() && probe.camera.is_some() && probe.call_indicator {
            break;
        }
    }

    if probe.mic.is_none() && probe.camera.is_none() {
        return None;
    }
    Some(probe)
}

fn mic_state(control: &ControlInfo) -> (Option<bool>, &'static str) {
    let name = &control.name;
    if name.contains("unmute") || name.contains("turn on mic") || name.contains("start mic") {
        return (Some(true), "reported");
    }
    if name.contains("mute") || name.contains("turn off mic") || name.contains("stop mic") {
        return (Some(false), "reported");
    }
    if let Some(on) = control.toggle_state {
        // A lit/active microphone button conventionally means muted in the
        // meeting apps that expose a toggle instead of a changing name.
        return (Some(on), "inferred");
    }
    (None, "unknown")
}

fn camera_state(control: &ControlInfo) -> (Option<bool>, &'static str) {
    let name = &control.name;
    if name.contains("turn off camera")
        || name.contains("stop video")
        || name.contains("turn off video")
        || name.contains("camera off")
    {
        return (Some(true), "reported");
    }
    if name.contains("turn on camera")
        || name.contains("start video")
        || name.contains("turn on video")
        || name.contains("camera on")
    {
        return (Some(false), "reported");
    }
    if let Some(on) = control.toggle_state {
        return (Some(on), "inferred");
    }
    (None, "unknown")
}

fn status_from_probe(info: &WindowInfo, kind: AppKind, probe: &WindowProbe) -> MeetingStatus {
    let (mic_muted, mic_confidence) = probe
        .mic
        .as_ref()
        .map(mic_state)
        .unwrap_or((None, "unknown"));
    let (camera_on, camera_confidence) = probe
        .camera
        .as_ref()
        .map(camera_state)
        .unwrap_or((None, "unknown"));
    let mut message = format!("{} meeting controls found.", kind.name());
    if kind == AppKind::Discord && !probe.call_indicator {
        message = "Discord is running, but no connected voice call was found.".into();
    }
    if probe.mic.is_none() {
        message.push_str(" Microphone is not exposed by this window.");
    }
    if probe.camera.is_none() {
        message.push_str(" Camera is not exposed by this window.");
    }
    MeetingStatus {
        available: true,
        app_id: Some(kind.id().into()),
        app_name: Some(kind.name().into()),
        window_title: Some(info.title.clone()),
        mic_available: probe.mic.is_some(),
        camera_available: probe.camera.is_some(),
        mic_muted,
        camera_on,
        mic_state: mic_confidence.into(),
        camera_state: camera_confidence.into(),
        message,
    }
}

fn presence_all(
    processes: &HashSet<String>,
    detected: &HashSet<&'static str>,
) -> Vec<MeetingAppPresence> {
    AppKind::all()
        .into_iter()
        .map(|kind| {
            let running = match kind {
                AppKind::Teams => processes.iter().any(|exe| exe.contains("teams")),
                AppKind::Zoom => processes.contains("zoom.exe"),
                AppKind::Discord => processes.iter().any(|exe| exe.contains("discord")),
                AppKind::Meet => browser_running(processes),
            };
            MeetingAppPresence {
                id: kind.id().into(),
                name: kind.name().into(),
                running,
                meeting_detected: detected.contains(kind.id()),
            }
        })
        .collect()
}

/// Read the current meeting state without changing anything.
pub fn scan() -> MeetingReport {
    unsafe {
        let processes = running_processes();
        let windows = visible_windows();
        let candidates: Vec<(WindowInfo, AppKind)> = windows
            .into_iter()
            .filter_map(|info| classify(&info.path, &info.title).map(|kind| (info, kind)))
            .collect();

        let com_initialized = CoInitializeEx(None, COINIT_MULTITHREADED).is_ok();
        let automation: Option<IUIAutomation> =
            CoCreateInstance(&CUIAutomation8, None, CLSCTX_INPROC_SERVER).ok();
        if let Some(automation) = automation.as_ref() {
            if let Ok(options) = automation.cast::<IUIAutomation2>() {
                let _ = options.SetConnectionTimeout(1000);
                let _ = options.SetTransactionTimeout(2000);
            }
        }

        let mut detected: HashSet<&'static str> = HashSet::new();
        let mut active = None;
        for (info, kind) in &candidates {
            let Some(automation) = automation.as_ref() else {
                break;
            };
            let Some(probe) = probe_window(automation, info) else {
                continue;
            };
            // Discord always exposes a mute button; require its call-only
            // disconnect indicator before calling it a meeting.
            if *kind == AppKind::Discord && !probe.call_indicator {
                continue;
            }
            if probe.mic.is_none() && probe.camera.is_none() {
                continue;
            }
            detected.insert(kind.id());
            if active.is_none() {
                active = Some(status_from_probe(info, *kind, &probe));
            }
        }

        if com_initialized {
            CoUninitialize();
        }

        let apps = presence_all(&processes, &detected);
        let message = if active.is_some() {
            "Controls are available for the meeting window in front. Use the notch buttons or open the app."
                .into()
        } else if apps.iter().any(|app| app.running) {
            "No meeting window with microphone or camera controls was found. Open the meeting app's call window."
                .into()
        } else {
            "None of the supported meeting apps is running.".into()
        };

        MeetingReport {
            apps,
            active,
            message,
        }
    }
}

unsafe fn choose_control<'a>(
    automation: &IUIAutomation,
    info: &WindowInfo,
    kind: AppKind,
    which: &str,
) -> Option<IUIAutomationElement> {
    let root = automation.ElementFromHandle(info.hwnd).ok()?;
    let condition = automation.CreateTrueCondition().ok()?;
    let elements = root.FindAll(TreeScope_Descendants, &condition).ok()?;
    let count = elements.Length().unwrap_or(0).min(1400);
    let mut best_score = 0;
    let mut best = None;
    let mut call_indicator = false;
    for index in 0..count {
        let Ok(element) = elements.GetElement(index) else {
            continue;
        };
        let Some(control) = control_from_element(&element) else {
            continue;
        };
        if control.name.contains("disconnect") || control.name.contains("voice connected") {
            call_indicator = true;
        }
        let score = if which == "mic" {
            mic_score(&control.name, &control.automation_id)
        } else {
            camera_score(&control.name, &control.automation_id)
        };
        if score > best_score {
            best_score = score;
            best = Some(element);
        }
    }
    if kind == AppKind::Discord && !call_indicator {
        return None;
    }
    best
}

/// Activate the microphone or camera button in the active meeting window.
pub fn toggle(which: &str) -> MeetingToggleResult {
    let which = if which == "camera" { "camera" } else { "mic" };
    let before = scan();
    let Some(active) = before.active.as_ref() else {
        return MeetingToggleResult {
            action_sent: false,
            changed: false,
            message: "No meeting window with controls is available. Open the call and try again."
                .into(),
            report: before,
        };
    };
    let Some(kind) = AppKind::all()
        .into_iter()
        .find(|kind| Some(kind.id()) == active.app_id.as_deref())
    else {
        return MeetingToggleResult {
            action_sent: false,
            changed: false,
            message: "The meeting app could not be identified.".into(),
            report: before,
        };
    };
    let available = if which == "mic" {
        active.mic_available
    } else {
        active.camera_available
    };
    if !available {
        return MeetingToggleResult {
            action_sent: false,
            changed: false,
            message: format!(
                "{} does not expose a {} control to Windows accessibility.",
                kind.name(),
                which
            ),
            report: before,
        };
    }

    unsafe {
        let com_initialized = CoInitializeEx(None, COINIT_MULTITHREADED).is_ok();
        let result = (|| -> Result<(), String> {
            let automation: IUIAutomation =
                CoCreateInstance(&CUIAutomation8, None, CLSCTX_INPROC_SERVER)
                    .map_err(|e| e.to_string())?;
            if let Ok(options) = automation.cast::<IUIAutomation2>() {
                let _ = options.SetConnectionTimeout(1000);
                let _ = options.SetTransactionTimeout(2000);
            }
            let windows = visible_windows();
            let candidate = windows.into_iter().find(|info| {
                classify(&info.path, &info.title) == Some(kind)
                    && Some(info.title.as_str()) == active.window_title.as_deref()
            });
            let Some(info) = candidate else {
                return Err("The meeting window moved or closed. Reopen the notch.".into());
            };
            let element = choose_control(&automation, &info, kind, which)
                .ok_or_else(|| format!("The {} control is no longer available.", which))?;
            if let Ok(pattern) =
                element.GetCurrentPatternAs::<IUIAutomationTogglePattern>(UIA_TogglePatternId)
            {
                pattern.Toggle().map_err(|e| e.to_string())?;
            } else if let Ok(pattern) =
                element.GetCurrentPatternAs::<IUIAutomationInvokePattern>(UIA_InvokePatternId)
            {
                pattern.Invoke().map_err(|e| e.to_string())?;
            } else {
                return Err(format!(
                    "The {} control cannot be activated through Windows accessibility.",
                    which
                ));
            }
            Ok(())
        })();

        if com_initialized {
            CoUninitialize();
        }

        match result {
            Ok(_) => {
                // Give the app a moment to update its own accessible name/state.
                std::thread::sleep(std::time::Duration::from_millis(450));
                let after = scan();
                let changed = if which == "mic" {
                    active.mic_muted.is_some()
                        && after.active.as_ref().and_then(|s| s.mic_muted) != active.mic_muted
                } else {
                    active.camera_on.is_some()
                        && after.active.as_ref().and_then(|s| s.camera_on) != active.camera_on
                };
                let message = if changed {
                    if which == "mic" {
                        match after.active.as_ref().and_then(|s| s.mic_muted) {
                            Some(true) => "Microphone muted. The app reported the new state.".into(),
                            Some(false) => {
                                "Microphone unmuted. The app reported the new state.".into()
                            }
                            None => "Microphone toggled.".into(),
                        }
                    } else {
                        match after.active.as_ref().and_then(|s| s.camera_on) {
                            Some(true) => "Camera turned on. The app reported the new state.".into(),
                            Some(false) => {
                                "Camera turned off. The app reported the new state.".into()
                            }
                            None => "Camera toggled.".into(),
                        }
                    }
                } else {
                    format!(
                        "The {} toggle was sent, but the app did not report a changed state. Check the app window.",
                        which
                    )
                };
                MeetingToggleResult {
                    action_sent: true,
                    changed,
                    message,
                    report: after,
                }
            }
            Err(message) => MeetingToggleResult {
                action_sent: false,
                changed: false,
                message,
                report: before,
            },
        }
    }
}

/// Bring a supported app's meeting window to the front as a fallback when the
/// app does not expose its controls to accessibility.
pub fn focus(app_id: &str) -> Result<(), String> {
    let kind = AppKind::all()
        .into_iter()
        .find(|kind| kind.id() == app_id)
        .ok_or_else(|| "Unknown meeting app.".to_string())?;
    unsafe {
        let windows = visible_windows();
        let found = windows
            .into_iter()
            .find(|info| classify(&info.path, &info.title) == Some(kind))
            .ok_or_else(|| format!("{} is not running or has no visible window.", kind.name()))?;
        if IsIconic(found.hwnd).as_bool() {
            let _ = ShowWindow(found.hwnd, SW_RESTORE);
        }
        if SetForegroundWindow(found.hwnd).as_bool() {
            Ok(())
        } else {
            Err(format!(
                "Windows did not let STARK-07 focus {}. Click its taskbar button.",
                kind.name()
            ))
        }
    }
}

#[tauri::command]
pub async fn meeting_get_status() -> MeetingReport {
    tauri::async_runtime::spawn_blocking(scan)
        .await
        .unwrap_or_else(|error| MeetingReport {
            apps: AppKind::all()
                .into_iter()
                .map(|kind| MeetingAppPresence {
                    id: kind.id().into(),
                    name: kind.name().into(),
                    running: false,
                    meeting_detected: false,
                })
                .collect(),
            active: None,
            message: format!("Meeting detection failed: {error}"),
        })
}

#[tauri::command]
pub async fn meeting_toggle(control: String) -> MeetingToggleResult {
    tauri::async_runtime::spawn_blocking(move || toggle(&control))
        .await
        .unwrap_or_else(|error| MeetingToggleResult {
            action_sent: false,
            changed: false,
            message: format!("Meeting control failed: {error}"),
            report: MeetingReport {
                apps: Vec::new(),
                active: None,
                message: "Meeting detection is unavailable.".into(),
            },
        })
}

#[tauri::command]
pub async fn meeting_focus_app(app_id: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || focus(&app_id))
        .await
        .map_err(|error| error.to_string())?
}
