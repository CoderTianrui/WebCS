import * as THREE from 'three';
import { state } from './state.js';
import { createTexture } from './utils.js';

export function buildMap() {
    const tex = createTexture('#d2c295', '#b8a878'); // Sand
    const brick = createTexture('#aaa', '#777', true); // Wall
    const crate = createTexture('#654321', '#4e342e', false, true); // Box

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(800, 800), new THREE.MeshStandardMaterial({map:tex}));
    floor.rotation.x = -Math.PI/2;
    state.scene.add(floor);
    state.objects.push(floor); // Add floor for bullet holes

    function addBox(x,y,z,w,h,d,t) {
        const geo = new THREE.BoxGeometry(w,h,d);
        const mat = new THREE.MeshStandardMaterial({map:t});
        const m = new THREE.Mesh(geo, mat);
        m.position.set(x, y+h/2, z); // Pivot at bottom
        m.isWall = true; // Tag for collision
        // Simple bounding box for physics
        m.geometry.computeBoundingBox();
        
        state.scene.add(m);
        state.objects.push(m);
    }

    // Walls
    addBox(-100,0,0, 20,60,400, brick);
    addBox(100,0,0, 20,60,400, brick);
    addBox(0,0,-200, 220,60,20, brick);
    addBox(0,0,120, 220,60,20, brick);

    // Cover
    addBox(0,0,60, 60,15,5, brick); // Safe zone wall
    addBox(-30,0,-50, 12,12,12, crate);
    addBox(30,0,-50, 12,12,12, crate);
    addBox(0,0,-100, 20,10,40, crate);
}

