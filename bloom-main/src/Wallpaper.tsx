import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import * as THREE from "three";

type Quality = "low" | "balanced" | "high";
type SceneMode = "drive" | "sky" | "rocket" | "space" | "underwater" | "ambient";
const SCENES: SceneMode[] = ["drive", "sky", "rocket", "space", "underwater", "ambient"];
const readScene = (v: unknown): SceneMode => SCENES.includes(v as SceneMode) ? v as SceneMode : "drive";
const readQuality = (v: unknown): Quality => v === "low" || v === "high" ? v : "balanced";

function Wallpaper() {
	const host = useRef<HTMLDivElement>(null);
	const [quality, setQuality] = useState<Quality>(() => readQuality(localStorage.getItem("bloom-wallpaper-quality")));
	const [mode, setMode] = useState<SceneMode>(() => readScene(localStorage.getItem("bloom-wallpaper-scene")));
	const [reduced, setReduced] = useState(() => matchMedia("(prefers-reduced-motion: reduce)").matches);

	useEffect(() => {
		invoke<Record<string, string>>("load_settings").then((s) => {
			if (s["bloom-wallpaper-quality"]) setQuality(readQuality(s["bloom-wallpaper-quality"]));
			if (s["bloom-wallpaper-scene"]) setMode(readScene(s["bloom-wallpaper-scene"]));
		}).catch(() => {});
		const unlisten = listen<{ key: string; value: unknown }>("settings-changed", ({ payload }) => {
			if (payload.key === "bloom-wallpaper-quality") setQuality(readQuality(payload.value));
			if (payload.key === "bloom-wallpaper-scene") setMode(readScene(payload.value));
			if (payload.key === "bloom-wallpaper-enabled" && String(payload.value) !== "true") void invoke("wallpaper_hide").catch(() => {});
		});
		const media = matchMedia("(prefers-reduced-motion: reduce)");
		const motion = () => setReduced(media.matches);
		media.addEventListener("change", motion);
		return () => { unlisten.then((f) => f()); media.removeEventListener("change", motion); };
	}, []);

	useEffect(() => {
		const root = host.current;
		if (!root) return;
		const caps = { low: [0.8, 40, 18], balanced: [1.25, 100, 36], high: [1.7, 190, 56] } as const;
		const [dpr, count] = caps[quality];
		let renderer: THREE.WebGLRenderer;
		try { renderer = new THREE.WebGLRenderer({ antialias: quality !== "low", powerPreference: "low-power" }); }
		catch { root.dataset.error = "WebGL unavailable"; return; }
		root.dataset.error = "";
		renderer.setPixelRatio(Math.min(devicePixelRatio || 1, dpr));
		renderer.setSize(innerWidth, innerHeight);
		renderer.outputColorSpace = THREE.SRGBColorSpace;
		renderer.toneMapping = THREE.ACESFilmicToneMapping;
		root.appendChild(renderer.domElement);
		const scene = new THREE.Scene();
		const bg: Record<SceneMode, number> = { drive: 0x9bb9c6, sky: 0x83b6d4, rocket: 0x10152a, space: 0x050713, underwater: 0x034454, ambient: 0x443c55 };
		scene.background = new THREE.Color(bg[mode]);
		scene.fog = new THREE.Fog(bg[mode], 36, mode === "space" ? 180 : 125);
		const camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.1, 500);
		const hemi = new THREE.HemisphereLight(0xcceaff, mode === "underwater" ? 0x063544 : 0x26302b, 2.1);
		scene.add(hemi);
		const sun = new THREE.DirectionalLight(0xffe5bf, 3.0); sun.position.set(-20, 35, 8); scene.add(sun);
		const mats = {
			ground: new THREE.MeshStandardMaterial({ color: mode === "underwater" ? 0x12626a : mode === "space" ? 0x151a33 : 0x45534a, roughness: 0.95 }),
			road: new THREE.MeshStandardMaterial({ color: 0x30383c, roughness: 0.86 }),
			line: new THREE.MeshStandardMaterial({ color: 0xe0c889, roughness: 0.7 }),
			white: new THREE.MeshStandardMaterial({ color: 0xdbe6ea, metalness: 0.48, roughness: 0.36 }),
			accent: new THREE.MeshStandardMaterial({ color: 0x88c7cf, metalness: 0.35, roughness: 0.32 }),
			red: new THREE.MeshStandardMaterial({ color: 0xc85342, metalness: 0.35, roughness: 0.32 })
		};
		const dark = new THREE.MeshStandardMaterial({ color: 0x10171b, metalness: .38, roughness: .42 });
		const glass = new THREE.MeshStandardMaterial({ color: 0x284958, metalness: .48, roughness: .2 });
		const add = (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, sx=1, sy=1, sz=1) => {
			const mesh = new THREE.Mesh(geometry, material); mesh.position.set(x,y,z); mesh.scale.set(sx,sy,sz); scene.add(mesh); return mesh;
		};
		const box = new THREE.BoxGeometry(1,1,1);
		const sph = new THREE.SphereGeometry(1, 16, 12);
		const dynamic: THREE.Object3D[] = [];
		const roadSegments: THREE.Object3D[] = [];
		const ground = add(new THREE.PlaneGeometry(400,400), mats.ground, 0,-1.3,-90); ground.rotation.x=-Math.PI/2;
		let craft: THREE.Group | null = null;
		if (mode === "drive") {
			for (let i=0;i<24;i++) {
				const z=-i*8;
				roadSegments.push(add(box,mats.road,0,-0.62,z,8,0.18,8.1));
				roadSegments.push(add(box,mats.line,0,-0.515,z,0.12,0.015,3.0));
				roadSegments.push(add(box,mats.line,-4.1,-0.50,z,0.08,0.025,8.1),add(box,mats.line,4.1,-0.50,z,0.08,0.025,8.1));
			}
			for(let i=0;i<28;i++){ const side=i%2?1:-1,z=-24-Math.floor(i/2)*13,x=side*(14+Math.random()*24),h=5+Math.random()*8; add(new THREE.ConeGeometry(2.6+Math.random()*2.1,h,7),mats.ground,x,h/2-1.25,z); }
			add(box,mats.red,0,-.38,5.45,2.45,.38,2.5);
			add(new THREE.BoxGeometry(1.62,.62,1.18),glass,0,-.02,6.18);
			add(box,dark,0,-.66,5.9,2.5,.1,.78);
			camera.position.set(0,2.3,8); camera.lookAt(0,1,-20);
		} else if (mode === "sky" || mode === "rocket") {
			for(let i=0;i<40;i++){const z=-10-i*7; add(sph,new THREE.MeshStandardMaterial({color:0xe1e4d9,roughness:1}), (Math.random()-.5)*75, 12+Math.random()*14,z, 2+Math.random()*4, .6+Math.random()*1.3, 2+Math.random()*3);}
			craft = new THREE.Group(); scene.add(craft);
			const fuselage=add(new THREE.CylinderGeometry(mode==="rocket"?.24:.34,mode==="rocket"?.42:.55,mode==="rocket"?5:6,12), mode==="rocket"?mats.white:mats.accent,0,0,0); fuselage.rotation.x=Math.PI/2; craft.add(fuselage);
			if(mode==="sky"){
				const wing=add(box,mats.white,0,0,0,7,.15,1.2); craft.add(wing);
				const tail=add(box,mats.white,0,.15,2.1,2,.12,.75); craft.add(tail);
				const fin=add(box,mats.accent,0,.62,2.1,.12,1,.7); craft.add(fin);
				camera.position.set(0,5,13); camera.lookAt(0,0,-12);
			} else {
				const nose=add(new THREE.ConeGeometry(.38,1.35,16),mats.white,0,0,-3.05);nose.rotation.x=Math.PI/2;craft.add(nose);
				for(const side of [-1,1]){const fin=add(box,mats.red,side*.5,-1.35,1.85,.16,1.05,.78);craft.add(fin);}
				const flame=add(new THREE.ConeGeometry(.32,1.8,12),new THREE.MeshBasicMaterial({color:0xffa33d}),0,0,3.6); flame.rotation.x=-Math.PI/2;craft.add(flame);dynamic.push(flame);
				camera.position.set(0,5,14); camera.lookAt(0,0,-5);
			}
			craft.position.set(0,mode==="rocket"?1:0,mode==="rocket"?1:0);
		} else if(mode === "space") {
			for(let i=0;i<count*3;i++){const star=add(sph,new THREE.MeshBasicMaterial({color:0xffffff}), (Math.random()-.5)*220,(Math.random()-.5)*130,-20-Math.random()*170,.06,.06,.06);dynamic.push(star);}
			const planet=add(sph,new THREE.MeshStandardMaterial({color:0x41678e,roughness:.85}),-28,4,-100,20,20,20);
			add(new THREE.TorusGeometry(28,1.2,8,100),mats.accent,-28,4,-100).rotation.x=.28;
			camera.position.set(0,2,16);camera.lookAt(0,1,-60);void planet;
		} else if(mode === "underwater") {
			for(let i=0;i<count;i++){
				const fish=new THREE.Group();scene.add(fish);fish.position.set((Math.random()-.5)*40,(Math.random()-.5)*18,-8-Math.random()*90);
				const color=new THREE.MeshStandardMaterial({color:i%2?0x35bbc1:0xd2a65b,roughness:.55});
				const body=new THREE.Mesh(new THREE.SphereGeometry(.62,12,9),color);body.scale.set(1.45,.66,.62);fish.add(body);
				const tail=new THREE.Mesh(new THREE.ConeGeometry(.42,.78,5),color);tail.position.x=-1.05;tail.rotation.z=-Math.PI/2;fish.add(tail);
				const eye=new THREE.Mesh(new THREE.SphereGeometry(.075,8,6),new THREE.MeshBasicMaterial({color:0x081318}));eye.position.set(.45,.12,-.39);fish.add(eye);dynamic.push(fish);
			}
			for(let i=0;i<18;i++) add(new THREE.CylinderGeometry(.2,.35,5,6),mats.ground,(Math.random()-.5)*46,1,-20-i*4,.7,1,.7);
			camera.position.set(0,1,10);camera.lookAt(0,0,-20);
		} else { camera.position.set(0,3,11);camera.lookAt(0,1,-30); }
		const pointer={x:0,y:0}; const move=(e:PointerEvent)=>{pointer.x=(e.clientX/innerWidth-.5)*2;pointer.y=(e.clientY/innerHeight-.5)*2;};
		const keys=new Set<string>();let throttle=.6;let steer=0;
		const keyDown=(e:KeyboardEvent)=>{const k=e.key.toLowerCase();if(["arrowup","arrowdown","arrowleft","arrowright"," "].includes(k))e.preventDefault();keys.add(k);};
		const keyUp=(e:KeyboardEvent)=>keys.delete(e.key.toLowerCase());
		const clearKeys=()=>keys.clear();
		const focus=()=>{renderer.domElement.tabIndex=0;renderer.domElement.focus({preventScroll:true});};
		renderer.domElement.addEventListener("pointerdown",focus);
		window.addEventListener("keydown",keyDown);window.addEventListener("keyup",keyUp);window.addEventListener("blur",clearKeys);
		const resize=()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);};
		window.addEventListener("pointermove",move,{passive:true});window.addEventListener("resize",resize);
		let raf=0; const start=performance.now(); let active=true;
		const animate=(now:number)=>{if(!active)return;raf=requestAnimationFrame(animate);const t=(now-start)*.001;const speed=reduced?.35:1;
			if(craft){craft.position.x+=(pointer.x*3-craft.position.x)*.018;craft.rotation.z+=( -pointer.x*.13-craft.rotation.z)*.025;craft.rotation.x+=(pointer.y*.08-craft.rotation.x)*.02;if(mode==="rocket")craft.position.y=1+((t*1.6)%16);}
			if(mode==="drive"){
				if(keys.has("arrowup")||keys.has("w"))throttle=Math.min(1,throttle+.006);else if(keys.has("arrowdown")||keys.has("s"))throttle=Math.max(.12,throttle-.012);else throttle+=(.55-throttle)*.002;
				steer+=(Number(keys.has("arrowright")||keys.has("d"))-Number(keys.has("arrowleft")||keys.has("a")))*.018;steer*=.985;
				const rate=(keys.has(" ")?.12:throttle)*speed;
				camera.position.x+=(steer*3-camera.position.x)*.02;camera.position.y=2.3+Math.sin(t*speed*.65)*.045;
				for(const o of roadSegments){o.position.z+=rate;if(o.position.z>8)o.position.z-=192;}
			}
			if(mode==="sky"){camera.position.x+=(pointer.x*4+(Number(keys.has("d")||keys.has("arrowright"))-Number(keys.has("a")||keys.has("arrowleft")))*3-camera.position.x)*.015;camera.position.y=5+pointer.y*1.1+Math.sin(t*.4)*.12;if(craft){craft.rotation.z+=(pointer.x*.13+(Number(keys.has("a"))-Number(keys.has("d")))*.2-craft.rotation.z)*.025;craft.position.y+=(pointer.y*1.5+(Number(keys.has("w"))-Number(keys.has("s")))*2-craft.position.y)*.02;}}
			if(mode==="rocket"){camera.position.y=5+craft!.position.y*.65;camera.lookAt(craft!.position.x*.5,craft!.position.y-2,-12);}
			if(mode==="underwater")dynamic.forEach((o,i)=>{o.position.x+=Math.sin(t*.4+i)*.004;o.position.y+=Math.sin(t*.8+i)*.003;});
			if(mode==="space")scene.rotation.y=Math.sin(t*.035)*.035;
			renderer.render(scene,camera);};
		raf=requestAnimationFrame(animate);
		return()=>{active=false;cancelAnimationFrame(raf);window.removeEventListener("pointermove",move);window.removeEventListener("resize",resize);window.removeEventListener("keydown",keyDown);window.removeEventListener("keyup",keyUp);window.removeEventListener("blur",clearKeys);renderer.domElement.removeEventListener("pointerdown",focus);scene.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();const m=o.material;if(Array.isArray(m))m.forEach(x=>x.dispose());else m.dispose();}});renderer.dispose();renderer.domElement.remove();};
	},[quality,mode,reduced]);
	return <div ref={host} aria-label={`STARK-07 ${mode} 3D interactive wallpaper`} style={{width:"100vw",height:"100vh",overflow:"hidden",position:"relative"}}><div style={{position:"absolute",left:22,bottom:18,padding:"9px 13px",borderRadius:10,color:"#eef4f4",background:"rgba(8,13,18,.55)",font:"12px Segoe UI, sans-serif",pointerEvents:"none",textShadow:"0 1px 4px #000"}}>{mode==="drive"?"W / ↑ accelerate · S / ↓ brake · A D / ← → steer · Space handbrake":mode==="sky"?"W / S climb · A / D bank · Pointer to steer":"Move pointer to explore · Wallpaper scene"}</div></div>;
}

createRoot(document.getElementById("root") as HTMLElement).render(<StrictMode><Wallpaper /></StrictMode>);
