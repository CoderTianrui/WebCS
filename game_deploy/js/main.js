import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

import { state } from './state.js';
import { buildMap } from './map.js';
import { createWeaponModel, switchWeapon, fireWeapon, onKeyDown, onKeyUp } from './player.js';
import { spawnEnemy, killEnemy } from './entities.js';
import { updateHUD } from './ui.js';
import { playSound, toggleMusic } from './audio.js';
import { createTracer } from './utils.js';
import { network } from './network.js'; // Import network

// Global collision checker (moved from game.js)
function checkPlayerCollisions(currPos) {
    const dirs = [
        new THREE.Vector3(0,0,1), new THREE.Vector3(0,0,-1),
        new THREE.Vector3(1,0,0), new THREE.Vector3(-1,0,0),
        new THREE.Vector3(0.7,0,0.7), new THREE.Vector3(-0.7,0,-0.7),
        new THREE.Vector3(0.7,0,-0.7), new THREE.Vector3(-0.7,0,0.7)
    ];

    const origin = currPos.clone();
    origin.y -= 5; 

    for (let d of dirs) {
        const ray = new THREE.Raycaster(origin, d, 0, 3);
        const hits = ray.intersectObjects(state.objects);
        if (hits.length > 0) {
            const normal = hits[0].face.normal;
            if (state.velocity.dot(d) > 0) {
                return true;
            }
        }
    }
    return false;
}

function playerDie() {
    state.player.hp = 0;
    state.player.isDead = true;
    updateHUD();
    state.controls.unlock();
    document.getElementById('death-screen').style.display = 'block';
    document.getElementById('start-screen').style.display = 'none';
}

function animate() {
    requestAnimationFrame(animate);
    
    const time = performance.now();
    const delta = Math.min((time - state.prevTime) / 1000, 0.1);
    state.prevTime = time;

    if (state.player.hp > 0) {
        if (state.controls.isLocked) {
            // Recoil
            state.weaponGroup.rotation.x *= 0.9;
            state.weaponGroup.position.z = THREE.MathUtils.lerp(state.weaponGroup.position.z, -1, 0.1);

            // Physics
            state.velocity.x -= state.velocity.x * 10.0 * delta;
            state.velocity.z -= state.velocity.z * 10.0 * delta;
            state.velocity.y -= 9.8 * 100.0 * delta; 

            state.direction.z = Number(state.moveF) - Number(state.moveB);
            state.direction.x = Number(state.moveR) - Number(state.moveL);
            state.direction.normalize();

            const speed = state.crouch ? 300 : 600;
            if(state.moveF||state.moveB) state.velocity.z -= state.direction.z * speed * delta;
            if(state.moveL||state.moveR) state.velocity.x -= state.direction.x * speed * delta;

            // --- WALL COLLISION FIX ---
            // 1. Apply Vertical
            state.controls.getObject().position.y += (state.velocity.y * delta);
            
            // Ground Check
            const pHeight = state.crouch ? 6 : 10;
            if (state.controls.getObject().position.y < pHeight) {
                state.velocity.y = 0;
                state.controls.getObject().position.y = pHeight;
                state.canJump = true;
            }

            // Box Jump Collision (Roof/Floor)
            const rayDown = new THREE.Raycaster(state.controls.getObject().position, new THREE.Vector3(0,-1,0), 0, pHeight);
            if(rayDown.intersectObjects(state.objects).length > 0 && state.velocity.y <= 0) {
                state.velocity.y = 0; state.canJump = true;
            }

            // 2. Apply Horizontal with Collision Check
            const oldPos = state.controls.getObject().position.clone();
            
            state.controls.moveRight(-state.velocity.x * delta);
            state.controls.moveForward(-state.velocity.z * delta);

            // Check if new position is inside a wall
            // Bumping logic:
            const bumpRay = new THREE.Raycaster();
            const center = state.controls.getObject().position.clone();
            center.y -= pHeight/2;
            
            // Check 4 directions
            const cardinals = [new THREE.Vector3(1,0,0), new THREE.Vector3(-1,0,0), new THREE.Vector3(0,0,1), new THREE.Vector3(0,0,-1)];
            let hitWall = false;
            for(let dir of cardinals) {
                bumpRay.set(center, dir);
                const hits = bumpRay.intersectObjects(state.objects);
                if(hits.length > 0 && hits[0].distance < 2.5) {
                    hitWall = true; break;
                }
            }

            if (hitWall) {
                state.controls.getObject().position.x = oldPos.x;
                state.controls.getObject().position.z = oldPos.z;
                state.velocity.x = 0;
                state.velocity.z = 0;
            }

            // Send Network Update
            // We send current camera position and rotation (Y only for body)
            const camPos = state.controls.getObject().position;
            const camRot = state.camera.rotation;
            network.sendUpdate(camPos, camRot);
        }
    }

    // Update Particles
    for(let i=state.particles.length-1; i>=0; i--) {
        const p = state.particles[i];
        p.life -= delta;
        p.mesh.position.add(p.mesh.velocity.clone().multiplyScalar(delta));
        p.mesh.velocity.y -= 9.8 * delta; // Gravity
        p.mesh.rotation.x += delta;
        p.mesh.scale.multiplyScalar(0.95);
        if(p.life <= 0) { state.scene.remove(p.mesh); state.particles.splice(i,1); }
    }
    
    // Update Remote Players
    Object.values(state.remotePlayers).forEach(p => p.update(delta));

    // NPC Logic
    const playerPos = state.controls.getObject().position;
    state.enemies.forEach(e => {
        e.velocity.y -= 9.8 * 100 * delta;
        e.mesh.position.y += e.velocity.y * delta;
        if (e.mesh.position.y < 0) { e.mesh.position.y = 0; e.velocity.y = 0; }

        const dist = e.mesh.position.distanceTo(playerPos);
        const vecToPlayer = new THREE.Vector3().subVectors(playerPos, e.mesh.position).normalize();
        
        // Simple Line of Sight Check
        const rayLOS = new THREE.Raycaster(e.mesh.position.clone().add(new THREE.Vector3(0,8,0)), vecToPlayer, 0, dist);
        const losHits = rayLOS.intersectObjects(state.objects);
        const visible = losHits.length === 0;

        if (time > e.changeStateTime) {
            e.changeStateTime = time + 1000 + Math.random()*2000;
            e.state = (Math.random() > 0.5 && dist < 100) ? 'strafe' : 'chase';
            if(e.state === 'strafe') e.strafeDir = Math.random() > 0.5 ? 1 : -1;
            if(Math.random() > 0.8 && e.mesh.position.y === 0) e.velocity.y = 40; 
        }

        let moveDir = new THREE.Vector3();
        if (visible && e.state === 'chase' && dist > 30) moveDir.copy(vecToPlayer);
        else if (visible && e.state === 'strafe') moveDir.crossVectors(vecToPlayer, new THREE.Vector3(0,1,0)).multiplyScalar(e.strafeDir);

        const nextPos = e.mesh.position.clone().add(moveDir.clone().multiplyScalar(15 * delta));
        // Simple NPC Wall Check
        const npcRay = new THREE.Raycaster(e.mesh.position.clone().add(new THREE.Vector3(0,4,0)), moveDir, 0, 3);
        if (npcRay.intersectObjects(state.objects).length === 0) {
            e.mesh.position.copy(nextPos);
        }
        
        e.mesh.lookAt(playerPos.x, e.mesh.position.y, playerPos.z);

        if (dist < 150 && state.player.hp > 0 && time - e.lastShot > 1000 && visible) {
            e.lastShot = time + Math.random() * 500;
            const start = e.mesh.position.clone().add(new THREE.Vector3(0,7,0));
            const end = playerPos.clone().add(new THREE.Vector3((Math.random()-.5)*5, -2, (Math.random()-.5)*5));
            createTracer(start, end, 0xff0000);
            playSound('enemy_fire');
            
            if (Math.random() > (state.crouch ? 0.8 : 0.6)) { // Harder to hit if crouching
                state.player.hp -= 10;
                updateHUD();
                document.getElementById('damage-flash').style.opacity = 1;
                setTimeout(()=>document.getElementById('damage-flash').style.opacity=0, 100);
                if(state.player.hp <= 0) playerDie();
            }
        }
    });

    state.renderer.render(state.scene, state.camera);
}

function init() {
    state.scene = new THREE.Scene();
    state.scene.background = new THREE.Color(0x87CEEB);
    state.scene.fog = new THREE.Fog(0x87CEEB, 0, 500);

    // Camera setup (y=10 is eye level)
    state.camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 1000);
    state.camera.position.set(0, 10, 100); 
    state.camera.rotation.y = Math.PI;

    // Lights
    const sun = new THREE.DirectionalLight(0xffffff, 0.8);
    sun.position.set(50, 100, 50);
    state.scene.add(sun);
    state.scene.add(new THREE.AmbientLight(0xffffff, 0.5));

    // Controls
    state.controls = new PointerLockControls(state.camera, document.body);
    
    const startBtn = document.getElementById('start-btn');
    startBtn.addEventListener('click', () => {
        document.getElementById('start-screen').style.display = 'none';
        state.controls.lock();
        toggleMusic();
    });

    state.controls.addEventListener('unlock', () => {
        // Only show menu if we are logged in (have socket) and not dead
        if (state.socket && !state.player.isDead && document.getElementById('shop-menu').style.display !== 'block') {
            document.getElementById('start-screen').style.display = 'flex';
        }
    });

    state.scene.add(state.controls.getObject());

    // Inputs
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    document.addEventListener('mousedown', () => { if(state.controls.isLocked && !state.player.isDead) fireWeapon(); });

    // Map
    buildMap();
    
    // Player Weapon
    createWeaponModel();
    switchWeapon(1); // Start with Glock

    // NPCs
    spawnEnemy(0, 0, -150);
    spawnEnemy(-30, 0, -150);
    spawnEnemy(30, 0, -150);

    // Renderer
    state.renderer = new THREE.WebGLRenderer({ antialias: true });
    state.renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(state.renderer.domElement);
    
    window.addEventListener('resize', () => {
        state.camera.aspect = window.innerWidth/window.innerHeight;
        state.camera.updateProjectionMatrix();
        state.renderer.setSize(window.innerWidth, window.innerHeight);
    });
    updateHUD();
    
    // NOTE: We do NOT start animate immediately if we want to wait for login?
    // Actually, animate runs physics. We can run it, but controls are locked until login.
    // BUT, we want to show Login Modal first.
    
    animate();
    
    // Show login
    document.getElementById('start-screen').style.display = 'none'; // Hide start screen initially
    document.getElementById('login-modal').style.display = 'flex';
}

// Start Game
init();
