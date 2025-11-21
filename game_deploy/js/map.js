import * as THREE from 'three';
import { state } from './state.js';
import { createTexture } from './utils.js';

export function buildMap() {
    // --- Textures ---
    const sand = createTexture('#d2c295', '#b8a878'); // Ground
    const brick = createTexture('#eecfa1', '#8b7355', true); // Walls (Dust colored)
    const crateTex = createTexture('#654321', '#4e342e', false, true); // Crates
    const stone = createTexture('#a0a0a0', '#707070', true); // Concrete/Stone
    const wood = createTexture('#5c4033', '#3e2723', false); // Doors

    const SCALE = 2.5; // Slightly larger to accommodate the layout
    const FLOOR_SIZE = 1000 * SCALE;

    // --- Helper: Add Box ---
    function addBox(x, y, z, w, h, d, tex, rotationY = 0) {
        const geo = new THREE.BoxGeometry(w, h, d);
        const mat = new THREE.MeshStandardMaterial({ map: tex });
        const mesh = new THREE.Mesh(geo, mat);
        // Pivot is usually center, so we lift it by h/2
        mesh.position.set(x, y + h / 2, z);
        mesh.rotation.y = rotationY;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.isWall = true; 
        mesh.geometry.computeBoundingBox();
        state.scene.add(mesh);
        state.objects.push(mesh);
    }

    // --- Helper: Add Ramp ---
    // Modified slightly to allow custom slopes if needed, but sticking to your logic
    function addRamp(x, y, z, w, h, d, tex, rotationY = 0, rotationX = Math.PI / 6) {
        const geo = new THREE.BoxGeometry(w, h, d);
        const mat = new THREE.MeshStandardMaterial({ map: tex });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(x, y + h / 2, z);
        mesh.rotation.order = 'YXZ'; // Important for ramp orientation
        mesh.rotation.y = rotationY;
        mesh.rotation.x = rotationX; 
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.isWall = true;
        mesh.geometry.computeBoundingBox();
        state.scene.add(mesh);
        state.objects.push(mesh);
    }

    // --- 1. The Floor (Sand) ---
    const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(FLOOR_SIZE, FLOOR_SIZE),
        new THREE.MeshStandardMaterial({ map: sand })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    state.scene.add(floor);
    state.objects.push(floor);

    // ==========================================
    // LAYOUT: DUST 2 (Blockout)
    // Orientation: +Z is CT Spawn, -Z is T Spawn
    // +X is A Site, -X is B Site
    // ==========================================

    const WALL_H = 60; // Height of boundary walls
    const PLAT_H = 15; // Height of elevated platforms (A-site, Catwalk)

    // --- 2. MID (Central Lane) ---
    
    // "Xbox" Crate in Mid
    addBox(0, 0, -50, 25, 20, 25, crateTex); 

    // Mid Doors (CT Side) - Two angled blocks with a gap
    addBox(-30, 0, 60, 40, WALL_H, 10, wood, -0.2);
    addBox(30, 0, 60, 40, WALL_H, 10, wood, 0.2);

    // Mid Walls (Left/Right definition)
    addBox(-45, 0, -80, 10, WALL_H, 160, brick); // Wall separating Mid/B
    addBox(45, 0, -100, 10, WALL_H, 120, brick); // Wall separating Mid/Short

    // --- 3. BOMBSITE A (Right Side / +X) ---
    
    // "Catwalk" / Short A - Elevated path
    addBox(80, 0, -40, 60, PLAT_H, 200, stone); // The Catwalk floor
    addRamp(80, 0, -150, 40, 10, 60, stone, 0, Math.PI/8); // Stairs up to Catwalk from T-mid

    // The A Site Platform
    addBox(180, 0, 50, 120, PLAT_H, 120, stone); 
    
    // Ramp from CT Spawn to A Site
    addRamp(160, 0, 120, 40, 10, 60, stone, 0, -Math.PI/8); 

    // Ramp from Long A to A Site
    addRamp(250, 0, 50, 60, 10, 40, stone, 0, 0); // Side ramp (rotation logic simplified)

    // Cover on A Site
    addBox(180, PLAT_H, 50, 15, 15, 15, crateTex); // Triple stack boxes
    addBox(195, PLAT_H, 50, 15, 15, 15, crateTex);
    addBox(188, PLAT_H+15, 50, 15, 15, 15, crateTex);
    addBox(210, PLAT_H, 80, 15, 15, 15, crateTex); // "Goose" area boxes

    // "Long A" - The long corridor on far right
    addBox(280, 0, 0, 10, WALL_H, 300, brick); // Far right boundary wall
    addBox(220, 0, -50, 10, WALL_H, 150, brick); // Wall between Long and Short
    
    // Long Doors
    addBox(250, 0, -130, 80, WALL_H, 20, brick); // The building containing doors
    // (Visual representation of doors: darker patches)
    addBox(250, 0, -130, 30, WALL_H, 22, wood); 

    // "Pit" area (We simulate pit by adding a wall to hide behind)
    addBox(250, 0, 140, 60, 10, 10, brick); 

    // --- 4. BOMBSITE B (Left Side / -X) ---

    // "Upper Tunnels" to B
    addBox(-150, 0, -50, 100, PLAT_H, 80, stone); // The tunnel floor
    addBox(-150, PLAT_H, -50, 100, 30, 10, brick); // Tunnel walls...
    addBox(-150, PLAT_H, -90, 100, 30, 10, brick);

    // B Site Platform
    addBox(-180, 0, 50, 120, PLAT_H, 100, stone);

    // B Window Wall (The wall between Mid and B-site)
    addBox(-110, 0, 50, 10, WALL_H, 100, brick);
    // Create the "Window" gap by adding two walls and leaving space
    // Actually, easier to just put a low box for the window hole
    // Let's just leave an opening
    
    // B Doors area
    addBox(-250, 0, 50, 10, WALL_H, 100, brick); // Far left wall

    // Big Box in B Site
    addBox(-180, PLAT_H, 50, 20, 20, 20, crateTex);
    addBox(-200, PLAT_H, 40, 20, 20, 20, crateTex);

    // Car position (simulated with boxes)
    addBox(-140, PLAT_H, 80, 30, 10, 15, crateTex);

    // --- 5. T SPAWN (North / -Z) ---
    // The "Top" of the map
    addBox(0, 0, -250, 400, 10, 100, sand); // Elevated T-Spawn area
    addRamp(0, 0, -190, 60, 15, 40, sand, 0, Math.PI/6); // Ramp down to suicide/mid

    // --- 6. CT SPAWN (South / +Z) ---
    // The connecting area at the bottom
    addBox(0, 0, 150, 400, 5, 80, sand); 
    
    // CT Ramp to B
    addRamp(-100, 0, 100, 40, 10, 60, stone, 0, Math.PI/8);

    // --- 7. Boundary Walls (Map containment) ---
    const BOUNDARY = 400;
    addBox(0, 0, -BOUNDARY, 800, 100, 20, brick); // North Wall
    addBox(0, 0, BOUNDARY, 800, 100, 20, brick);  // South Wall
    addBox(-BOUNDARY, 0, 0, 20, 100, 800, brick); // West Wall
    addBox(BOUNDARY, 0, 0, 20, 100, 800, brick);  // East Wall

    // --- 8. Decorative Crates (Scatter for cover) ---
    addBox(0, 0, 120, 15, 15, 15, crateTex); // CT Mid crate
    addBox(-40, 15, -50, 10, 10, 10, crateTex); // Mid crate
    addBox(250, 0, 80, 15, 15, 15, crateTex); // Long A barrel/crate

    // --- Bomb Sites metadata & markers ---
    state.bombSites = [
        { name: 'A', position: new THREE.Vector3(180, 0, 50), radius: 60 },
        { name: 'B', position: new THREE.Vector3(-180, 0, 50), radius: 60 }
    ];

    state.bombSites.forEach(site => {
        const markerGeo = new THREE.CylinderGeometry(site.radius, site.radius, 2, 24);
        const markerMat = new THREE.MeshBasicMaterial({ color: site.name === 'A' ? 0xff7043 : 0x64ffda, transparent: true, opacity: 0.25 });
        const marker = new THREE.Mesh(markerGeo, markerMat);
        marker.position.set(site.position.x, 1, site.position.z);
        marker.rotation.x = Math.PI / 2;
        marker.name = `bomb-site-${site.name}`;
        state.scene.add(marker);
    });
}