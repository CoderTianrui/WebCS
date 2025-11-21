import * as THREE from 'three';
import { state } from './state.js';
import { createTexture } from './utils.js';

export function buildMap() {
    const sand = createTexture('#d2c295', '#b8a878'); // Sand
    const brick = createTexture('#aaa', '#777', true); // Wall
    const crateTex = createTexture('#654321', '#4e342e', false, true); // Box
    const steel = createTexture('#7a7a7a', '#4a4a4a'); // Metal panels
    const stone = createTexture('#c6c6c6', '#939393', true); // Plaza

    const SCALE = 2; // 4x area increase (double width/length)
    const FLOOR_SIZE = 800 * SCALE;

    const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(FLOOR_SIZE, FLOOR_SIZE),
        new THREE.MeshStandardMaterial({ map: sand })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    state.scene.add(floor);
    state.objects.push(floor);

    function addBox(x, y, z, w, h, d, tex, rotationY = 0) {
        const geo = new THREE.BoxGeometry(w, h, d);
        const mat = new THREE.MeshStandardMaterial({ map: tex });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(x, y + h / 2, z);
        mesh.rotation.y = rotationY;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.isWall = true;
        mesh.geometry.computeBoundingBox();
        state.scene.add(mesh);
        state.objects.push(mesh);
    }

    function addCylinder(x, y, z, radius, height, tex) {
        const geo = new THREE.CylinderGeometry(radius, radius, height, 16);
        const mat = new THREE.MeshStandardMaterial({ map: tex });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(x, y + height / 2, z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.isWall = true;
        mesh.geometry.computeBoundingBox();
        state.scene.add(mesh);
        state.objects.push(mesh);
    }

    function addRamp(x, z, length, height, width, tex, rotationY = 0) {
        const geo = new THREE.BoxGeometry(width, height, length);
        const mat = new THREE.MeshStandardMaterial({ map: tex });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(x, height / 2, z);
        mesh.rotation.x = Math.PI / 6;
        mesh.rotation.y = rotationY;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.isWall = true;
        mesh.geometry.computeBoundingBox();
        state.scene.add(mesh);
        state.objects.push(mesh);
    }

    const boundary = FLOOR_SIZE / 2 - 40;

    // Tall perimeter walls
    addBox(0, 0, -boundary, FLOOR_SIZE, 80, 20, brick);
    addBox(0, 0, boundary, FLOOR_SIZE, 80, 20, brick);
    addBox(-boundary, 0, 0, 20, 80, FLOOR_SIZE, brick);
    addBox(boundary, 0, 0, 20, 80, FLOOR_SIZE, brick);

    // Central plaza
    addBox(0, 0, 0, 200, 5, 200, stone);
    addBox(0, 0, 0, 40, 15, 260, brick);
    addBox(0, 0, 0, 260, 15, 40, brick);

    // Safe spawn courtyard
    addBox(0, 0, 200, 180, 25, 10, brick);
    addBox(0, 0, 230, 60, 25, 10, brick);
    addBox(-90, 0, 215, 10, 25, 70, brick);
    addBox(90, 0, 215, 10, 25, 70, brick);

    // Crate clusters
    for (let i = -2; i <= 2; i++) {
        addBox(-200 + i * 30, 0, -60, 18, 16, 18, crateTex);
        addBox(220, 0, -100 + i * 40, 18, 22, 18, crateTex);
    }

    // Elevated sniper nest near north
    addBox(0, 15, -250, 200, 10, 50, stone);
    addRamp(-80, -210, 80, 30, 20, stone, Math.PI);
    addRamp(80, -210, 80, 30, 20, stone, Math.PI);
    addBox(-90, 0, -260, 10, 40, 60, brick);
    addBox(90, 0, -260, 10, 40, 60, brick);

    // Industrial zone with pillars
    addBox(-300, 0, -100, 180, 15, 120, steel);
    addCylinder(-360, 0, -40, 12, 50, steel);
    addCylinder(-240, 0, -40, 12, 50, steel);
    addCylinder(-360, 0, -160, 12, 50, steel);
    addCylinder(-240, 0, -160, 12, 50, steel);

    // Market stalls
    for (let i = -2; i <= 2; i++) {
        addBox(i * 60, 0, 80, 40, 14, 18, crateTex);
        addBox(i * 60, 14, 80, 40, 3, 18, brick);
    }

    // Observation towers
    addCylinder(280, 0, 280, 18, 70, brick);
    addCylinder(-280, 0, 280, 18, 70, brick);
    addBox(280, 70, 280, 60, 6, 60, stone);
    addBox(-280, 70, 280, 60, 6, 60, stone);

    // Outer dunes / barriers
    addBox(-200, 0, boundary - 80, 150, 20, 30, sand);
    addBox(200, 0, -boundary + 80, 150, 20, 30, sand);
    addBox(boundary - 60, 0, -200, 30, 20, 150, sand);
    addBox(-boundary + 60, 0, 200, 30, 20, 150, sand);

    // Scatter some tall covers
    addBox(-120, 0, 40, 30, 30, 30, stone);
    addBox(140, 0, -40, 30, 30, 30, stone);
    addBox(-40, 0, -140, 30, 30, 30, stone);
    addBox(40, 0, 140, 30, 30, 30, stone);
}

