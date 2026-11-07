import { useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent, RefObject } from "react";
import { motion } from "framer-motion";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { AppInfo } from "./dockApps";
import type { StartMenuIconSize, StartMenuPage, StartMenuPanelSize } from "./settings/types";
import "./StartMenu.css";

const FAVORITES_KEY = "bloom-start-menu-apps";
const LAYOUT_KEY = "bloom-start-menu-layout";
const DRAG_TYPE = "application/x-stark-start-menu";

type AppEntry = { type: "app"; path: string };
type FolderEntry = { type: "folder"; id: string; name: string; appPaths: string[] };
type StartEntry = AppEntry | FolderEntry;
type DragPayload = { type: "app"; path: string } | { type: "folder"; id: string };
type DropHint = { id: string; mode: "before" | "after" | "folder" };

function readFavoritePaths(raw: unknown): string[] | null {
	if (typeof raw !== "string") return null;
	try {
		const value: unknown = JSON.parse(raw);
		return Array.isArray(value)
			? [...new Set(value.filter((path): path is string => typeof path === "string" && path.trim().length > 0))]
			: null;
	} catch {
		return null;
	}
}

function normalizeEntries(raw: unknown): StartEntry[] | null {
	if (!Array.isArray(raw)) return null;
	const entries: StartEntry[] = [];
	const seenPaths = new Set<string>();
	const seenFolders = new Set<string>();
	for (const item of raw) {
		if (!item || typeof item !== "object") continue;
		const value = item as Record<string, unknown>;
		if (value.type === "app" && typeof value.path === "string" && value.path.trim()) {
			const key = value.path.toLowerCase();
			if (seenPaths.has(key)) continue;
			seenPaths.add(key);
			entries.push({ type: "app", path: value.path });
		} else if (
			value.type === "folder" &&
			typeof value.id === "string" &&
			value.id.trim() &&
			Array.isArray(value.appPaths)
		) {
			const id = value.id.trim();
			if (seenFolders.has(id)) continue;
			seenFolders.add(id);
			const appPaths: string[] = [];
			for (const path of value.appPaths) {
				if (typeof path !== "string" || !path.trim()) continue;
				const key = path.toLowerCase();
				if (seenPaths.has(key)) continue;
				seenPaths.add(key);
				appPaths.push(path);
			}
			const name = typeof value.name === "string" && value.name.trim() ? value.name.trim().slice(0, 32) : "New folder";
			entries.push({ type: "folder", id, name, appPaths });
		}
	}
	return entries;
}

function readSavedLayout(raw: unknown): StartEntry[] | null {
	if (typeof raw !== "string") return null;
	try {
		const value: unknown = JSON.parse(raw);
		if (!value || typeof value !== "object") return null;
		return normalizeEntries((value as Record<string, unknown>).entries);
	} catch {
		return null;
	}
}

function favoritePathsFrom(entries: StartEntry[]): string[] {
	return entries.flatMap((entry) => entry.type === "app" ? [entry.path] : entry.appPaths);
}

function entryId(entry: StartEntry): string {
	return entry.type === "app" ? "app:" + entry.path.toLowerCase() : "folder:" + entry.id;
}

function folderId(): string {
	return typeof crypto !== "undefined" && "randomUUID" in crypto
		? crypto.randomUUID()
		: "folder-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

function removeAppPath(entries: StartEntry[], path: string): StartEntry[] {
	const key = path.toLowerCase();
	return entries.flatMap((entry): StartEntry[] => {
		if (entry.type === "app") return entry.path.toLowerCase() === key ? [] : [entry];
		const appPaths = entry.appPaths.filter((item) => item.toLowerCase() !== key);
		if (appPaths.length === entry.appPaths.length) return [entry];
		if (appPaths.length === 0) return [];
		if (appPaths.length === 1) return [{ type: "app" as const, path: appPaths[0] }];
		return [{ ...entry, appPaths }];
	});
}

function AppMark({ app, icon }: { app: AppInfo; icon?: string }) {
	return icon ? (
		<img src={icon} alt="" draggable={false} />
	) : (
		<span>{app.name.trim().slice(0, 1).toUpperCase() || "A"}</span>
	);
}

function AppTile({
	app,
	icon,
	selected,
	editing,
	draggable,
	entry,
	dropMode,
	isDragging,
	onClick,
	onDragStart,
	onDragOver,
	onDrop,
	onDragEnd
}: {
	app: AppInfo;
	icon?: string;
	selected?: boolean;
	editing?: boolean;
	draggable?: boolean;
	entry?: string;
	dropMode?: DropHint["mode"] | null;
	isDragging?: boolean;
	onClick: () => void;
	onDragStart?: (event: DragEvent<HTMLButtonElement>) => void;
	onDragOver?: (event: DragEvent<HTMLButtonElement>) => void;
	onDrop?: (event: DragEvent<HTMLButtonElement>) => void;
	onDragEnd?: () => void;
}) {
	const dropClass = dropMode ? " drop-" + dropMode : "";
	return (
		<button
			className={"start-menu-app" + (editing ? " is-editing" : "") + (isDragging ? " is-dragging" : "") + dropClass}
			data-entry-id={entry}
			data-app-icon-path={app.path}
			data-has-app-icon={icon ? "true" : undefined}
			draggable={!!draggable}
			onClick={onClick}
			onDragStart={onDragStart}
			onDragOver={onDragOver}
			onDrop={onDrop}
			onDragEnd={onDragEnd}
			title={editing ? (selected ? "Remove " + app.name + " from Pinned" : "Add " + app.name + " to Pinned") : "Open " + app.name}
		>
			<span className="start-menu-app-icon">
				<AppMark app={app} icon={icon} />
				{editing && <i className={selected ? "selected" : ""}>{selected ? "✓" : "+"}</i>}
			</span>
			<span className="start-menu-app-name">{app.name}</span>
		</button>
	);
}

function readDragPayload(dataTransfer: DataTransfer): DragPayload | null {
	const raw = dataTransfer.getData(DRAG_TYPE) || dataTransfer.getData("text/plain");
	if (!raw) return null;
	try {
		const value: unknown = JSON.parse(raw);
		if (!value || typeof value !== "object") return null;
		const item = value as Record<string, unknown>;
		if (item.type === "app" && typeof item.path === "string") return { type: "app", path: item.path };
		if (item.type === "folder" && typeof item.id === "string") return { type: "folder", id: item.id };
		return null;
	} catch {
		return null;
	}
}

export function StartMenu({
	open,
	pinnedApps,
	onClose,
	onError,
	scale,
	bottom,
	containerRef,
	clickThrough,
	defaultPage,
	columns,
	iconSize,
	panelSize,
	autoFocusSearch,
	showHeader,
	showFooter
}: {
	open: boolean;
	pinnedApps: AppInfo[];
	onClose: () => void;
	onError: (error: unknown) => void;
	scale: number;
	bottom: number;
	containerRef: RefObject<HTMLDivElement | null>;
	clickThrough: boolean;
	defaultPage: StartMenuPage;
	columns: number;
	iconSize: StartMenuIconSize;
	panelSize: StartMenuPanelSize;
	autoFocusSearch: boolean;
	showHeader: boolean;
	showFooter: boolean;
}) {
	const [apps, setApps] = useState<AppInfo[]>([]);
	const [layoutEntries, setLayoutEntries] = useState<StartEntry[]>([]);
	const [icons, setIcons] = useState<Record<string, string>>({});
	const [search, setSearch] = useState("");
	const [tab, setTab] = useState<StartMenuPage>(defaultPage);
	const [editing, setEditing] = useState(false);
	const [loading, setLoading] = useState(true);
	const [appsLoadError, setAppsLoadError] = useState(false);
	const [openFolderId, setOpenFolderId] = useState<string | null>(null);
	const [folderEditing, setFolderEditing] = useState(false);
	const [folderPickerOpen, setFolderPickerOpen] = useState(false);
	const [folderSearch, setFolderSearch] = useState("");
	const [folderNameDraft, setFolderNameDraft] = useState("");
	const [draggingId, setDraggingId] = useState<string | null>(null);
	const [dropHint, setDropHint] = useState<DropHint | null>(null);
	const [now, setNow] = useState(() => new Date());
	const searchRef = useRef<HTMLInputElement>(null);
	const listRef = useRef<HTMLDivElement>(null);
	const pinnedAppsRef = useRef(pinnedApps);
	const onErrorRef = useRef(onError);
	const iconCacheRef = useRef<Record<string, string>>({});
	const iconRequestsRef = useRef(new Set<string>());
	pinnedAppsRef.current = pinnedApps;
	onErrorRef.current = onError;
	iconCacheRef.current = icons;

	useEffect(() => {
		const timer = window.setInterval(() => setNow(new Date()), 30_000);
		return () => window.clearInterval(timer);
	}, []);

	useEffect(() => {
		let active = true;
		const refreshApps = async () => {
			try {
				const installed = await invoke<AppInfo[]>("get_installed_apps");
				if (!active) return;
				setAppsLoadError(false);
				setApps(installed.filter((app) => app.path !== "start").sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })));
			} catch (error) {
				if (!active) return;
				setAppsLoadError(true);
				onErrorRef.current(error);
			} finally {
				if (active) setLoading(false);
			}
		};
		const load = async () => {
			try {
				const settings = await invoke<Record<string, unknown>>("load_settings").catch(
					(): Record<string, unknown> => ({})
				);
				if (!active) return;
				const saved = readFavoritePaths(settings[FAVORITES_KEY]);
				const restored = readSavedLayout(settings[LAYOUT_KEY]) ?? readSavedLayout(localStorage.getItem(LAYOUT_KEY));
				const initial = restored ?? (saved ?? pinnedAppsRef.current.filter((app) => app.path !== "start").map((app) => app.path)).map((path) => ({ type: "app" as const, path }));
				setLayoutEntries(initial);
				if (restored === null && (saved !== null || initial.length > 0)) {
					const layoutValue = JSON.stringify({ version: 1, entries: initial });
					const favoritesValue = JSON.stringify(favoritePathsFrom(initial));
					localStorage.setItem(LAYOUT_KEY, layoutValue);
					localStorage.setItem(FAVORITES_KEY, favoritesValue);
					void invoke("save_setting", { key: LAYOUT_KEY, value: layoutValue }).catch(() => {});
					void invoke("save_setting", { key: FAVORITES_KEY, value: favoritesValue }).catch(() => {});
				}
			} catch (error) {
				onErrorRef.current(error);
			}
			await refreshApps();
		};
		void load();
		let stopListening: (() => void) | undefined;
		let cancelled = false;
		void listen("installed-apps-updated", () => { void refreshApps(); }).then((stop) => {
			if (cancelled) stop();
			else stopListening = stop;
		});
		return () => {
			active = false;
			cancelled = true;
			stopListening?.();
		};
	}, []);

	const retryAppLoad = () => {
		setLoading(true);
		void invoke<AppInfo[]>("get_installed_apps")
			.then((installed) => {
				setAppsLoadError(false);
				setApps(installed.filter((app) => app.path !== "start").sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })));
			})
			.catch((error) => {
				setAppsLoadError(true);
				onErrorRef.current(error);
			})
			.finally(() => setLoading(false));
	};

	const appByPath = useMemo(() => {
		const map = new Map<string, AppInfo>();
		for (const app of [...apps, ...pinnedApps]) map.set(app.path.toLowerCase(), app);
		return map;
	}, [apps, pinnedApps]);
	const favoritePaths = useMemo(() => favoritePathsFrom(layoutEntries), [layoutEntries]);
	const favoriteSet = useMemo(() => new Set(favoritePaths.map((path) => path.toLowerCase())), [favoritePaths]);
	const favoriteApps = useMemo(
		() => favoritePaths.map((path) => appByPath.get(path.toLowerCase())).filter((app): app is AppInfo => !!app),
		[appByPath, favoritePaths]
	);
	const pinnedEntries = useMemo(() => layoutEntries.map((entry) => {
		if (entry.type === "app") {
			const app = appByPath.get(entry.path.toLowerCase());
			return app ? { type: "app" as const, id: entryId(entry), app } : null;
		}
		return {
			type: "folder" as const,
			id: entry.id,
			key: entryId(entry),
			name: entry.name,
			appPaths: entry.appPaths,
			apps: entry.appPaths.map((path) => appByPath.get(path.toLowerCase())).filter((app): app is AppInfo => !!app)
		};
	}).filter((entry): entry is NonNullable<typeof entry> => !!entry), [appByPath, layoutEntries]);
	const visibleApps = useMemo(() => {
		const query = search.trim().toLowerCase();
		const source = query
			? apps
			: tab === "pinned" && !editing
				? favoriteApps
				: apps;
		return query ? source.filter((app) => app.name.toLowerCase().includes(query)) : source;
	}, [apps, editing, favoriteApps, search, tab]);
	const openFolder = useMemo(
		() => layoutEntries.find((entry): entry is FolderEntry => entry.type === "folder" && entry.id === openFolderId),
		[layoutEntries, openFolderId]
	);
	const folderApps = useMemo(
		() => openFolder?.appPaths.map((path) => appByPath.get(path.toLowerCase())).filter((app): app is AppInfo => !!app) ?? [],
		[appByPath, openFolder]
	);
	const folderCandidates = useMemo(() => {
		if (!openFolder) return [];
		const query = folderSearch.trim().toLowerCase();
		return apps
			.filter((app) => !openFolder.appPaths.some((path) => path.toLowerCase() === app.path.toLowerCase()))
			.filter((app) => !query || app.name.toLowerCase().includes(query))
			.slice(0, 10);
	}, [apps, folderSearch, openFolder]);

	useEffect(() => {
		if (!open || !autoFocusSearch) return;
		const id = window.setTimeout(() => searchRef.current?.focus(), 120);
		return () => window.clearTimeout(id);
	}, [autoFocusSearch, open]);

	useEffect(() => {
		const root = listRef.current;
		if (!open || !root || typeof IntersectionObserver === "undefined") return;
		let active = true;
		const observer = new IntersectionObserver((items) => {
			for (const item of items) {
				if (!item.isIntersecting) continue;
				const element = item.target as HTMLElement;
				observer.unobserve(element);
				if (element.dataset.hasAppIcon === "true") continue;
				const path = element.dataset.appIconPath;
				if (!path) continue;
				const key = path.toLowerCase();
				if (iconCacheRef.current[key] || iconRequestsRef.current.has(key)) continue;
				iconRequestsRef.current.add(key);
				void invoke<string | null>("get_app_icon", { path, name: null, hwnd: null })
					.then((icon) => {
						if (active && icon) setIcons((current) => ({ ...current, [key]: icon }));
					})
					.catch(() => {})
					.finally(() => iconRequestsRef.current.delete(key));
			}
		}, { root, rootMargin: "160px 0px" });
		root.querySelectorAll<HTMLElement>("[data-app-icon-path]").forEach((element) => observer.observe(element));
		return () => {
			active = false;
			observer.disconnect();
		};
	}, [layoutEntries, open, openFolderId, folderPickerOpen, folderSearch, visibleApps]);

	useEffect(() => {
		if (!open) return;
		const keydown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				event.preventDefault();
				if (folderPickerOpen) setFolderPickerOpen(false);
				else if (openFolderId) setOpenFolderId(null);
				else onClose();
			}
		};
		const outside = (event: MouseEvent) => {
			if ((event.target as Element | null)?.closest(".start-dock-button")) return;
			if (containerRef.current && !containerRef.current.contains(event.target as Node)) onClose();
		};
		window.addEventListener("keydown", keydown);
		document.addEventListener("mousedown", outside, true);
		return () => {
			window.removeEventListener("keydown", keydown);
			document.removeEventListener("mousedown", outside, true);
		};
	}, [containerRef, folderPickerOpen, onClose, open, openFolderId]);

	const persistLayout = (nextValue: StartEntry[]) => {
		const next = normalizeEntries(nextValue) ?? [];
		setLayoutEntries(next);
		const layoutValue = JSON.stringify({ version: 1, entries: next });
		const favoritesValue = JSON.stringify(favoritePathsFrom(next));
		localStorage.setItem(LAYOUT_KEY, layoutValue);
		localStorage.setItem(FAVORITES_KEY, favoritesValue);
		void Promise.all([
			invoke("save_setting", { key: LAYOUT_KEY, value: layoutValue }),
			invoke("save_setting", { key: FAVORITES_KEY, value: favoritesValue })
		]).catch(onErrorRef.current);
	};

	const toggleFavorite = (app: AppInfo) => {
		const key = app.path.toLowerCase();
		if (favoriteSet.has(key)) {
			persistLayout(removeAppPath(layoutEntries, app.path));
			return;
		}
		persistLayout([...layoutEntries, { type: "app", path: app.path }]);
	};
	const launch = async (app: AppInfo) => {
		onClose();
		try {
			await invoke("open_app", { appName: app.path });
		} catch (error) {
			onError(error);
		}
	};

	const makeFolderName = (entries: StartEntry[]) => {
		const used = new Set(entries.filter((entry): entry is FolderEntry => entry.type === "folder").map((entry) => entry.name.toLowerCase()));
		if (!used.has("new folder")) return "New folder";
		let number = 2;
		while (used.has("new folder " + number)) number += 1;
		return "New folder " + number;
	};
	const createEmptyFolder = () => {
		const folder: FolderEntry = { type: "folder", id: folderId(), name: makeFolderName(layoutEntries), appPaths: [] };
		persistLayout([...layoutEntries, folder]);
		setOpenFolderId(folder.id);
		setFolderNameDraft(folder.name);
		setFolderEditing(true);
		setFolderPickerOpen(true);
		setFolderSearch("");
	};

	const saveFolderName = () => {
		if (!openFolder) return;
		const name = folderNameDraft.trim().slice(0, 32) || "New folder";
		persistLayout(layoutEntries.map((entry) => entry.type === "folder" && entry.id === openFolder.id ? { ...entry, name } : entry));
	};

	const moveAppToFolder = (path: string, targetId: string) => {
		const target = layoutEntries.find((entry): entry is FolderEntry => entry.type === "folder" && entry.id === targetId);
		if (!target || target.appPaths.some((item) => item.toLowerCase() === path.toLowerCase())) return;
		let next = removeAppPath(layoutEntries, path);
		const targetIndex = next.findIndex((entry) => entry.type === "folder" && entry.id === targetId);
		if (targetIndex < 0) return;
		const current = next[targetIndex] as FolderEntry;
		next[targetIndex] = { ...current, appPaths: [...current.appPaths, path] };
		persistLayout(next);
	};

	const createAppFolder = (sourcePath: string, targetPath: string) => {
		if (sourcePath.toLowerCase() === targetPath.toLowerCase()) return;
		let next = removeAppPath(layoutEntries, sourcePath);
		const targetIndex = next.findIndex((entry) => entry.type === "app" && entry.path.toLowerCase() === targetPath.toLowerCase());
		next = removeAppPath(next, targetPath);
		const originalPaths = favoritePaths;
		const sourceIndex = originalPaths.findIndex((path) => path.toLowerCase() === sourcePath.toLowerCase());
		const targetOriginalIndex = originalPaths.findIndex((path) => path.toLowerCase() === targetPath.toLowerCase());
		const members = sourceIndex >= 0 && targetOriginalIndex >= 0 && sourceIndex < targetOriginalIndex
			? [sourcePath, targetPath]
			: [targetPath, sourcePath];
		const folder: FolderEntry = {
			type: "folder",
			id: folderId(),
			name: makeFolderName(layoutEntries),
			appPaths: members
		};
		next.splice(Math.max(0, Math.min(targetIndex, next.length)), 0, folder);
		persistLayout(next);
	};

	const reorderEntries = (source: DragPayload, target: string | null, after: boolean) => {
		let next = [...layoutEntries];
		let sourceKey: string;
		if (source.type === "app") {
			sourceKey = "app:" + source.path.toLowerCase();
			next = removeAppPath(next, source.path);
			const found = appByPath.get(source.path.toLowerCase());
			next.push({ type: "app", path: found?.path ?? source.path });
		} else {
			sourceKey = "folder:" + source.id;
			const folder = next.find((entry): entry is FolderEntry => entry.type === "folder" && entry.id === source.id);
			if (!folder) return;
			next = next.filter((entry) => !(entry.type === "folder" && entry.id === source.id));
			next.push(folder);
		}
		const movedIndex = next.findIndex((entry) => entryId(entry) === sourceKey);
		if (movedIndex < 0) return;
		const [moving] = next.splice(movedIndex, 1);
		const targetIndex = target ? next.findIndex((entry) => entryId(entry) === target) : -1;
		if (targetIndex < 0) next.push(moving);
		else next.splice(targetIndex + (after ? 1 : 0), 0, moving);
		persistLayout(next);
	};

	const reorderFolderApp = (sourcePath: string, targetPath: string, folderIdValue: string, after: boolean) => {
		if (sourcePath.toLowerCase() === targetPath.toLowerCase()) return;
		persistLayout(layoutEntries.map((entry) => {
			if (entry.type !== "folder" || entry.id !== folderIdValue) return entry;
			const paths = [...entry.appPaths];
			const sourceIndex = paths.findIndex((path) => path.toLowerCase() === sourcePath.toLowerCase());
			const targetIndex = paths.findIndex((path) => path.toLowerCase() === targetPath.toLowerCase());
			if (sourceIndex < 0 || targetIndex < 0) return entry;
			const [moving] = paths.splice(sourceIndex, 1);
			const nextTarget = paths.findIndex((path) => path.toLowerCase() === targetPath.toLowerCase());
			paths.splice(nextTarget + (after ? 1 : 0), 0, moving);
			return { ...entry, appPaths: paths };
		}));
	};

	const beginDrag = (event: DragEvent<HTMLButtonElement>, payload: DragPayload) => {
		const value = JSON.stringify(payload);
		event.dataTransfer.setData(DRAG_TYPE, value);
		event.dataTransfer.setData("text/plain", value);
		event.dataTransfer.effectAllowed = "move";
		setDraggingId(payload.type === "app" ? "app:" + payload.path.toLowerCase() : "folder:" + payload.id);
	};
	const dragOverItem = (event: DragEvent<HTMLButtonElement>, id: string) => {
		if (tab !== "pinned" || editing || search.trim()) return;
		event.preventDefault();
		event.stopPropagation();
		event.dataTransfer.dropEffect = "move";
		const rect = event.currentTarget.getBoundingClientRect();
		const ratio = rect.width ? (event.clientX - rect.left) / rect.width : 0.5;
		const mode = ratio < 0.23 ? "before" : ratio > 0.77 ? "after" : "folder";
		setDropHint({ id, mode });
	};
	const dropOnItem = (event: DragEvent<HTMLButtonElement>, id: string, targetPath?: string) => {
		if (tab !== "pinned" || editing || search.trim()) return;
		event.preventDefault();
		event.stopPropagation();
		const source = readDragPayload(event.dataTransfer);
		const mode = dropHint?.id === id ? dropHint.mode : "folder";
		if (source) {
			if (source.type === "folder" && "folder:" + source.id === id) {
				// Dropping a folder on itself is a no-op.
			} else if (mode === "folder" && targetPath && source.type === "app") createAppFolder(source.path, targetPath);
			else if (mode === "folder" && id.startsWith("folder:") && source.type === "app") moveAppToFolder(source.path, id.slice(7));
			else if (mode !== "folder") reorderEntries(source, id, mode === "after");
		}
		setDraggingId(null);
		setDropHint(null);
	};
	const dropOnGrid = (event: DragEvent<HTMLDivElement>) => {
		if (tab !== "pinned" || editing || search.trim() || openFolder || (event.target as Element).closest("[data-entry-id]")) return;
		event.preventDefault();
		const source = readDragPayload(event.dataTransfer);
		if (source?.type === "app") {
			const next = removeAppPath(layoutEntries, source.path);
			const app = appByPath.get(source.path.toLowerCase());
			persistLayout([...next, { type: "app", path: app?.path ?? source.path }]);
		} else if (source?.type === "folder") {
			reorderEntries(source, null, true);
		}
		setDraggingId(null);
		setDropHint(null);
	};

	const onAppDragStart = (event: DragEvent<HTMLButtonElement>, app: AppInfo) => beginDrag(event, { type: "app", path: app.path });
	const endDrag = () => {
		setDraggingId(null);
		setDropHint(null);
	};
	const openFolderView = (folder: FolderEntry) => {
		setOpenFolderId(folder.id);
		setFolderEditing(false);
		setFolderPickerOpen(false);
		setFolderSearch("");
		setFolderNameDraft(folder.name);
	};
	const addPickerApp = (app: AppInfo) => {
		if (!openFolder) return;
		moveAppToFolder(app.path, openFolder.id);
		setFolderSearch("");
		setFolderPickerOpen(false);
	};
	const removeFolderApp = (app: AppInfo) => {
		const folderIdValue = openFolder?.id;
		if (!folderIdValue) return;
		const next = layoutEntries.map((entry) => {
			if (entry.type !== "folder" || entry.id !== folderIdValue) return entry;
			const paths = entry.appPaths.filter((path) => path.toLowerCase() !== app.path.toLowerCase());
			return { ...entry, appPaths: paths };
		});
		persistLayout(next);
	};

	const greeting = now.getHours() < 12 ? "Good morning" : now.getHours() < 18 ? "Good afternoon" : "Good evening";
	const query = search.trim();
	const renderAppTile = (app: AppInfo, options: {
		editMode?: boolean;
		selected?: boolean;
		draggable?: boolean;
		id?: string;
		dropMode?: DropHint["mode"] | null;
		isDragging?: boolean;
		onClick: () => void;
		onDragOver?: (event: DragEvent<HTMLButtonElement>) => void;
		onDrop?: (event: DragEvent<HTMLButtonElement>) => void;
		onDragStart?: (event: DragEvent<HTMLButtonElement>) => void;
		onDragEnd?: () => void;
	}) => {
		const icon = icons[app.path.toLowerCase()] ?? app.icon ?? undefined;
		return (
			<AppTile
				key={(options.id ?? app.path) + ":" + app.name}
				app={app}
				icon={icon}
				editing={!!options.editMode}
				selected={options.selected}
				draggable={options.draggable}
				entry={options.id}
				dropMode={options.dropMode}
				isDragging={options.isDragging}
				onClick={options.onClick}
				onDragStart={options.onDragStart}
				onDragOver={options.onDragOver}
				onDrop={options.onDrop}
				onDragEnd={options.onDragEnd}
			/>
		);
	};

	if (!open) return null;
	return (
		<motion.div
			ref={containerRef}
			className={"start-menu-anchor start-menu-size-" + panelSize + " start-menu-columns-" + columns + " start-menu-icons-" + iconSize + (clickThrough ? " click-through" : "")}
			style={{ zoom: scale, bottom }}
			initial={{ opacity: 0, y: 16 }}
			animate={{ opacity: 1, y: 0 }}
			exit={{ opacity: 0, y: 16, transition: { duration: 0.14 } }}
			transition={{ type: "spring", stiffness: 360, damping: 30 }}
		>
			<motion.div
				className="start-menu-popup"
				initial={{ opacity: 0, y: 18, scale: 0.97 }}
				animate={{ opacity: 1, y: 0, scale: 1 }}
				exit={{ opacity: 0, y: 18, scale: 0.97, transition: { duration: 0.14 } }}
				transition={{ type: "spring", stiffness: 360, damping: 30 }}
				onMouseDown={(event) => event.stopPropagation()}
				onClick={(event) => event.stopPropagation()}
			>
				<header className="start-menu-header">
					{showHeader && (
						<div className="start-menu-brand">
							<img src="/branding/stark-07-emblem.png" alt="" draggable={false} />
							<div>
								<strong>STARK-07</strong>
								<span>{greeting}</span>
								<time>{now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} · {now.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" })}</time>
							</div>
						</div>
					)}
					<button className="start-menu-close" onClick={onClose} aria-label="Close launcher" title="Close">
						<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
					</button>
				</header>

				<div className="start-menu-search">
					<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4 4" /></svg>
					<input
						ref={searchRef}
						value={search}
						onChange={(event) => setSearch(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === "Enter" && visibleApps[0] && !editing && !openFolder) {
								event.preventDefault();
								void launch(visibleApps[0]);
							}
						}}
						placeholder="Search apps"
						aria-label="Search apps"
						autoComplete="off"
						spellCheck={false}
					/>
					{search && <button onClick={() => setSearch("")} aria-label="Clear search" title="Clear search">×</button>}
				</div>

				<div className="start-menu-tabs">
					<div className="start-menu-tab-group" role="tablist" aria-label="Launcher apps">
						<button className={tab === "pinned" ? "selected" : ""} onClick={() => { setTab("pinned"); setEditing(false); setOpenFolderId(null); }} role="tab" aria-selected={tab === "pinned"}>Pinned</button>
						<button className={tab === "apps" ? "selected" : ""} onClick={() => { setTab("apps"); setEditing(false); setOpenFolderId(null); }} role="tab" aria-selected={tab === "apps"}>All apps</button>
					</div>
					<div className="start-menu-actions">
						{tab === "pinned" && !editing && !query && (
							<button className="start-menu-new-folder" onClick={createEmptyFolder} aria-label="Create folder">+ Folder</button>
						)}
						<button className={"start-menu-edit" + (editing ? " editing" : "")} onClick={() => { setEditing((value) => !value); setTab("apps"); setOpenFolderId(null); }}>
							{editing ? "Done" : "Edit apps"}
						</button>
					</div>
				</div>

				<div
					ref={listRef}
					className={"start-menu-apps" + (openFolder ? " folder-open" : "")}
					role="tabpanel"
					onDragOver={(event) => {
						if (tab !== "pinned" || editing || query || openFolder) return;
						if ((event.target as Element).closest("[data-entry-id]")) return;
						event.preventDefault();
						setDropHint({ id: "append", mode: "after" });
					}}
					onDrop={dropOnGrid}
					onDragEnd={endDrag}
				>
					{loading ? (
						<div className="start-menu-loading">Loading your apps…</div>
					) : appsLoadError ? (
						<div className="start-menu-empty">
							<strong>Couldn’t load your apps</strong>
							<span>Check again when the app list is available.</span>
							<button className="start-menu-retry" onClick={retryAppLoad}>Try again</button>
						</div>
					) : openFolder ? (
						<div className="start-menu-folder-view">
							<div className="start-menu-folder-header">
								<button className="start-menu-folder-back" onClick={() => setOpenFolderId(null)} aria-label="Back to pinned apps">‹</button>
								<input
									value={folderNameDraft}
									maxLength={32}
									aria-label="Folder name"
									onChange={(event) => setFolderNameDraft(event.target.value)}
									onBlur={saveFolderName}
									onKeyDown={(event) => {
										if (event.key === "Enter") {
											event.preventDefault();
											event.currentTarget.blur();
										}
									}}
								/>
								<button className={"start-menu-folder-edit" + (folderEditing ? " active" : "")} onClick={() => setFolderEditing((value) => !value)}>
									{folderEditing ? "Done" : "Edit"}
								</button>
							</div>
							<div className="start-menu-folder-grid">
								{folderApps.map((app) => {
									const id = "app:" + app.path.toLowerCase();
									return (
										<div className="start-menu-folder-slot" key={app.path}>
											{renderAppTile(app, {
												draggable: folderEditing,
												id,
												onClick: () => { if (!folderEditing) void launch(app); },
												onDragStart: (event) => onAppDragStart(event, app),
												onDragOver: (event) => {
													event.preventDefault();
													event.stopPropagation();
													const rect = event.currentTarget.getBoundingClientRect();
													const after = rect.width ? (event.clientX - rect.left) / rect.width > 0.5 : false;
													event.currentTarget.dataset.dropAfter = after ? "true" : "false";
												},
												onDrop: (event) => {
													event.preventDefault();
													event.stopPropagation();
													const source = readDragPayload(event.dataTransfer);
													if (source?.type === "app" && openFolder) {
														reorderFolderApp(source.path, app.path, openFolder.id, event.currentTarget.dataset.dropAfter === "true");
													}
												},
												onDragEnd: endDrag
											})}
											{folderEditing && <button className="start-menu-folder-remove" onClick={() => removeFolderApp(app)} aria-label={"Remove " + app.name + " from folder"} title="Remove from folder">−</button>}
										</div>
									);
								})}
								{folderApps.length === 0 && <div className="start-menu-folder-empty">This folder is empty. Add apps to build your own group.</div>}
								{folderEditing && (
									<button className="start-menu-folder-add" onClick={() => { setFolderPickerOpen((value) => !value); setFolderSearch(""); }}>
										<span>+</span><strong>Add apps</strong>
									</button>
								)}
							</div>
							{folderPickerOpen && folderEditing && (
								<div className="start-menu-folder-picker">
									<input
										value={folderSearch}
										onChange={(event) => setFolderSearch(event.target.value)}
										placeholder="Find an app to add"
										aria-label="Find an app to add to this folder"
										autoComplete="off"
										spellCheck={false}
									/>
									<div className="start-menu-folder-results">
										{folderCandidates.map((app) => (
											<button key={app.path} data-app-icon-path={app.path} data-has-app-icon={icons[app.path.toLowerCase()] || app.icon ? "true" : undefined} onClick={() => addPickerApp(app)} title={"Add " + app.name + " to folder"}>
												<span className="start-menu-folder-result-icon"><AppMark app={app} icon={icons[app.path.toLowerCase()] ?? app.icon ?? undefined} /></span>
												<span>{app.name}</span>
												<strong>+</strong>
											</button>
										))}
										{folderCandidates.length === 0 && <span className="start-menu-folder-no-results">No matching apps</span>}
									</div>
								</div>
							)}
						</div>
					) : tab === "pinned" && !editing && !query ? (
						pinnedEntries.length ? pinnedEntries.map((entry) => {
							if (entry.type === "app") {
								const id = entry.id;
								const dragging = draggingId === id;
								return renderAppTile(entry.app, {
									draggable: true,
									id,
									isDragging: dragging,
									dropMode: dropHint?.id === id ? dropHint.mode : null,
									onClick: () => void launch(entry.app),
									onDragStart: (event) => onAppDragStart(event, entry.app),
									onDragOver: (event) => dragOverItem(event, id),
									onDrop: (event) => dropOnItem(event, id, entry.app.path),
									onDragEnd: endDrag
								});
							}
							const id = "folder:" + entry.id;
							const dragging = draggingId === id;
							return (
								<button
									key={id}
									className={"start-menu-folder" + (dropHint?.id === id ? " drop-" + dropHint.mode : "") + (dragging ? " is-dragging" : "")}
									data-entry-id={id}
									draggable
									onClick={() => {
										const folder = layoutEntries.find((item): item is FolderEntry => item.type === "folder" && item.id === entry.id);
										if (folder) openFolderView(folder);
									}}
									onDragStart={(event) => beginDrag(event, { type: "folder", id: entry.id })}
									onDragOver={(event) => dragOverItem(event, id)}
									onDrop={(event) => dropOnItem(event, id)}
									onDragEnd={endDrag}
									title={entry.name + " — open folder"}
								>
									<span className="start-menu-folder-icon">
										<span className="start-menu-folder-icons">
											{entry.apps.slice(0, 4).map((app) => (
												<span key={app.path}><AppMark app={app} icon={icons[app.path.toLowerCase()] ?? app.icon ?? undefined} /></span>
											))}
											{entry.apps.length === 0 && <span className="start-menu-folder-placeholder">+</span>}
										</span>
										<span className="start-menu-folder-count">{entry.apps.length}</span>
									</span>
									<span className="start-menu-app-name">{entry.name}</span>
								</button>
							);
						}) : (
							<div className="start-menu-empty">
								<strong>Your pinned space is clear</strong>
								<span>Choose Edit apps to add favorites, or create a folder.</span>
							</div>
						)
					) : visibleApps.length ? visibleApps.map((app) => {
						const selected = favoriteSet.has(app.path.toLowerCase());
						const id = "app:" + app.path.toLowerCase();
						return renderAppTile(app, {
							editMode: editing,
							selected,
							draggable: !editing,
							id,
							onClick: () => editing ? toggleFavorite(app) : void launch(app),
							onDragStart: (event) => onAppDragStart(event, app),
							onDragEnd: endDrag
						});
					}) : (
						<div className="start-menu-empty">
							<strong>{tab === "pinned" && !editing && !query ? "Your pinned space is clear" : "No apps found"}</strong>
							<span>{tab === "pinned" && !editing && !query ? "Choose Edit apps to add your favorites, or create a folder." : "Try another app name."}</span>
						</div>
					)}
				</div>

				{showFooter && (
					<footer className="start-menu-footer">
						<span>{openFolder ? folderApps.length + " apps in " + openFolder.name : editing ? "Choose apps to add or remove from Pinned." : tab === "pinned" ? favoritePaths.length + " pinned apps" : apps.length + " installed apps"}</span>
						<span className="start-menu-local"><i /> Saved on this device</span>
					</footer>
				)}
			</motion.div>
		</motion.div>
	);
}
