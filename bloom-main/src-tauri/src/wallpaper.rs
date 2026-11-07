//! The STARK-07 interactive wallpaper is an original canvas scene in its own
//! always-on-bottom window. It never changes the Windows wallpaper. Closing or
//! disabling it simply hides/destroys this window and leaves the desktop as it
//! was.
//!
//! The window is created lazily so users who never turn the wallpaper on do
//! not pay for a second WebView2 renderer at startup.

use std::sync::Mutex;
use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize, Runtime, WebviewWindow, WebviewWindowBuilder};

const LABEL: &str = "wallpaper";
static CREATION_LOCK: Mutex<()> = Mutex::new(());

fn ensure_window<R: Runtime>(app: &AppHandle<R>) -> Result<WebviewWindow<R>, String> {
    if let Some(window) = app.get_webview_window(LABEL) {
        return Ok(window);
    }
    let config = app
        .config()
        .app
        .windows
        .iter()
        .find(|window| window.label == LABEL)
        .ok_or_else(|| "Missing wallpaper window template".to_string())?;
    let window = WebviewWindowBuilder::from_config(app, config)
        .map_err(|e| e.to_string())?
        .build()
        .map_err(|e| e.to_string())?;
    let hide_on_close = window.clone();
    window.on_window_event(move |event| {
        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            let _ = hide_on_close.hide();
        }
    });
    Ok(window)
}

fn size_to_primary_monitor<R: Runtime>(window: &WebviewWindow<R>) {
    if let Ok(Some(monitor)) = window.primary_monitor() {
        let position = monitor.position();
        let size = monitor.size();
        let _ = window.set_position(PhysicalPosition::new(position.x, position.y));
        let _ = window.set_size(PhysicalSize::new(size.width, size.height));
    }
}

pub fn show_sync(app: &AppHandle) -> Result<(), String> {
    let _guard = CREATION_LOCK.lock().map_err(|e| e.to_string())?;
    if crate::state::SHUTTING_DOWN.load(std::sync::atomic::Ordering::Relaxed) {
        return Err("STARK-07 is shutting down".into());
    }
    let window = ensure_window(app)?;
    size_to_primary_monitor(&window);
    window.show().map_err(|e| e.to_string())?;
    // Keep the canvas behind normal app windows and above the static desktop
    // background. The dock and notch are always-on-top, so they stay usable.
    window.set_always_on_bottom(true).map_err(|e| e.to_string())?;
    let _ = window.set_ignore_cursor_events(false);
    Ok(())
}

pub fn hide_sync(app: &AppHandle) -> Result<(), String> {
    let _guard = CREATION_LOCK.lock().map_err(|e| e.to_string())?;
    if let Some(window) = app.get_webview_window(LABEL) {
        window.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn destroy_sync(app: &AppHandle) -> Result<(), String> {
    let _guard = CREATION_LOCK.lock().map_err(|e| e.to_string())?;
    if let Some(window) = app.get_webview_window(LABEL) {
        window.destroy().map_err(|e| e.to_string())?;
        // Destruction is dispatched to the UI thread. Do not let a fast
        // re-enable reuse the dying label.
        let started = std::time::Instant::now();
        while app.get_webview_window(LABEL).is_some() {
            if started.elapsed() > std::time::Duration::from_secs(5) {
                return Err("Wallpaper window did not finish closing".into());
            }
            std::thread::sleep(std::time::Duration::from_millis(10));
        }
    }
    Ok(())
}

pub fn is_active_sync(app: &AppHandle) -> bool {
    app.get_webview_window(LABEL)
        .and_then(|window| window.is_visible().ok())
        .unwrap_or(false)
}

#[tauri::command]
pub async fn wallpaper_show(app: AppHandle) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || show_sync(&app))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn wallpaper_hide(app: AppHandle) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || hide_sync(&app))
        .await
        .map_err(|e| e.to_string())?
}

/// "Return to normal wallpaper": destroy the canvas renderer entirely. The
/// Windows wallpaper itself was never changed.
#[tauri::command]
pub async fn wallpaper_restore(app: AppHandle) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || destroy_sync(&app))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn wallpaper_is_active(app: AppHandle) -> bool {
    is_active_sync(&app)
}
