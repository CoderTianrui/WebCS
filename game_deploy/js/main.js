import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

import { state } from './state.js';
import { buildMap } from './map.js';
import { createWeaponModel, switchWeapon, onKeyDown, onKeyUp, handleMouseDown, handleMouseUp, processHeldFire } from './player.js';
import { spawnEnemy, killEnemy, clearEnemies, updateWeaponDrops } from './entities.js';
import { updateHUD } from './ui.js';
import { playSound, toggleMusic } from './audio.js';
import { createTracer } from './utils.js';
import { network } from './network.js';
import { initLoginUI } from './ui.js';
const setModeHints = window.setModeHints;
const updateBombIndicator = window.updateBombIndicator;
import rendererInstance from './renderer.js';
import { updateProjectiles } from './projectiles.js';

const BOMB_TIMER_SECONDS = 40;
const tempBox = new THREE.Box3();
const tempVec = new THREE.Vector3();

function resetBombState() {
    if (!state.bomb) return;
    state.bomb.hasBomb = false;
    state.bomb.isPlanted = false;
    state.bomb.site = null;
    state.bomb.plantedAt = 0;
    state.bomb.explodeTime = 0;
    updateBombIndicator('');
}

function getBombSiteAtPosition(position) {
    if (!state.bombSites || !state.bombSites.length || !position) return null;
    return state.bombSites.find(site => site.position.distanceTo(position) <= site.radius) || null;
}

function updateBombTimers() {
    if (!state.bomb) return;
    if (state.bomb.isPlanted && state.bomb.explodeTime) {
        const now = performance.now();
        const msLeft = state.bomb.explodeTime - now;
        if (msLeft <= 0) {
            state.bomb.isPlanted = false;
            state.bomb.explodeTime = 0;
            if (state.gameMode === 'ai_ct') {
                updateBombIndicator('Bomb exploded! Terrorists win.', 'rgba(255,64,64,0.9)');
            } else {
                updateBombIndicator('');
            }
            return;
        }
        const seconds = Math.ceil(msLeft / 1000);
        updateBombIndicator(`Bomb ${state.bomb.site || ''}: ${seconds}s`, 'rgba(255,64,64,0.8)');
    } else if (state.bomb.hasBomb) {
        updateBombIndicator('You have the bomb. Plant with G.', 'rgba(255,152,0,0.85)');
    } else {
        updateBombIndicator('');
    }
}

function resolvePlayerCollisions(position) {
    if (!state.objects || !position) return;
    const radius = 5;
    const playerHeight = state.crouch ? 6 : 10;
    const stepAllowance = 6;
    state.objects.forEach(obj => {
        if (!obj.geometry || !obj.geometry.boundingBox || !obj.isWall) return;
        tempBox.copy(obj.geometry.boundingBox).applyMatrix4(obj.matrixWorld);
        if (position.y < tempBox.min.y - 10 || position.y > tempBox.max.y + 20) return;
        if (position.x < tempBox.min.x - radius || position.x > tempBox.max.x + radius) return;
        if (position.z < tempBox.min.z - radius || position.z > tempBox.max.z + radius) return;

        const feetY = position.y - playerHeight;
        if (feetY > tempBox.max.y - stepAllowance && feetY < tempBox.max.y + stepAllowance && state.velocity.y <= 0) {
            position.y = tempBox.max.y + playerHeight;
            state.velocity.y = 0;
            state.canJump = true;
            return;
        }

        const dx = Math.min(position.x - (tempBox.min.x - radius), (tempBox.max.x + radius) - position.x);
        const dz = Math.min(position.z - (tempBox.min.z - radius), (tempBox.max.z + radius) - position.z);
        if (dx > 0 && dz > 0) {
            if (dx < dz) {
                position.x += position.x > tempBox.getCenter(tempVec).x ? dx : -dx;
                state.velocity.x = 0;
            } else {
                position.z += position.z > tempBox.getCenter(tempVec).z ? dz : -dz;
                state.velocity.z = 0;
            }
        }
    });
}

function disconnectMultiplayer() {
    if (state.socket) {
        state.socket.removeAllListeners();
        state.socket.disconnect();
        state.socket = null;
    }
    state.remotePlayers = {};
}

// Global collision checker (moved from game.js)
function checkPlayerCollisions(currPos) {
    // ... (Keep existing logic if needed, but currently mostly unused in favor of simple wall checks inside animate)
    // Actually, we'll leave it as is or remove if not used. 
    // The wall logic is inline in animate.
    return false;
}

function playerDie() {
    state.player.hp = 0;
    state.player.isDead = true;
    state.triggerHeld = false;
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
            if (state.moveF || state.moveB) state.velocity.z -= state.direction.z * speed * delta;
            if (state.moveL || state.moveR) state.velocity.x -= state.direction.x * speed * delta;

            // --- WALL COLLISION FIX ---
            const playerObj = state.controls.getObject();

            // 1. Apply Vertical + precise ground snap
            playerObj.position.y += (state.velocity.y * delta);

            const pHeight = state.crouch ? 6 : 10;
            const downRay = new THREE.Raycaster(playerObj.position.clone(), new THREE.Vector3(0, -1, 0), 0, pHeight + 20);
            const groundHits = downRay.intersectObjects(state.objects, true);
            let grounded = false;
            if (groundHits.length > 0) {
                const targetY = groundHits[0].point.y + pHeight;
                if (playerObj.position.y <= targetY + 0.05 && state.velocity.y <= 0) {
                    playerObj.position.y = targetY;
                    state.velocity.y = 0;
                    state.canJump = true;
                    grounded = true;
                }
            }
            if (!grounded && playerObj.position.y < pHeight) {
                playerObj.position.y = pHeight;
                state.velocity.y = 0;
                state.canJump = true;
            }

            // 2. Apply Horizontal with Collision Check
            const oldPos = playerObj.position.clone();

            state.controls.moveRight(-state.velocity.x * delta);
            state.controls.moveForward(-state.velocity.z * delta);

            // Check if new position is inside a wall
            // Bumping logic:
            const bumpRay = new THREE.Raycaster();
            const center = playerObj.position.clone();
            center.y -= pHeight / 2;

            // Check 4 directions
            const cardinals = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1)];
            let blockedX = false;
            let blockedZ = false;
            for (let dir of cardinals) {
                bumpRay.set(center, dir);
                const hits = bumpRay.intersectObjects(state.objects);
                if (hits.length > 0 && hits[0].distance < 2.5) {
                    if (dir.x !== 0) blockedX = true;
                    if (dir.z !== 0) blockedZ = true;
                }
            }

            const attemptedPos = playerObj.position.clone();
            if (blockedX) {
                playerObj.position.x = oldPos.x;
                state.velocity.x = 0;
            }
            if (blockedZ) {
                playerObj.position.z = oldPos.z;
                state.velocity.z = 0;
            }

            resolvePlayerCollisions(playerObj.position);
            processHeldFire();

            // Send Network Update if Multiplayer
            if (state.gameMode === 'multi' || state.gameMode === 'multi_ct') {
                const camPos = state.controls.getObject().position;
                const camRot = state.camera.rotation;
                network.sendUpdate(camPos, camRot);
            }
        }
    }

    // Update Particles
    for (let i = state.particles.length - 1; i >= 0; i--) {
        const p = state.particles[i];
        p.life -= delta;
        p.mesh.position.add(p.mesh.velocity.clone().multiplyScalar(delta));
        p.mesh.velocity.y -= 9.8 * delta; // Gravity
        p.mesh.rotation.x += delta;
        p.mesh.scale.multiplyScalar(0.95);
        if (p.life <= 0) { state.scene.remove(p.mesh); state.particles.splice(i, 1); }
    }

    // Update Remote Players
    Object.values(state.remotePlayers).forEach(p => p.update(delta));

    // Weapon drop animation/pickup
    updateWeaponDrops(delta);
    updateProjectiles(delta, {
        onRemotePlayerHit: (targetId, impulse) => {
            network.sendSnowballImpulse(targetId, impulse);
        },
        onLocalPlayerHit: (_projectile, impulse) => {
            state.velocity.x += impulse.x;
            state.velocity.y += impulse.y;
            state.velocity.z += impulse.z;
            playSound('hit');
        }
    });
    updateBombTimers();

    // NPC Logic (Only in Single Player / AI CT)
    if (state.gameMode === 'single' || state.gameMode === 'ai_ct') {
        const playerPos = state.controls.getObject().position;
        state.enemies.forEach(e => {
            e.velocity.y -= 9.8 * 100 * delta;
            e.mesh.position.y += e.velocity.y * delta;
            if (e.mesh.position.y < 0) { e.mesh.position.y = 0; e.velocity.y = 0; }

            const dist = e.mesh.position.distanceTo(playerPos);
            const vecToPlayer = new THREE.Vector3().subVectors(playerPos, e.mesh.position).normalize();

            // Simple Line of Sight Check
            const rayLOS = new THREE.Raycaster(e.mesh.position.clone().add(new THREE.Vector3(0, 8, 0)), vecToPlayer, 0, dist);
            const losHits = rayLOS.intersectObjects(state.objects);
            const visible = losHits.length === 0;

            if (time > e.changeStateTime) {
                e.changeStateTime = time + 1000 + Math.random() * 2000;
                e.state = (Math.random() > 0.5 && dist < 100) ? 'strafe' : 'chase';
                if (e.state === 'strafe') e.strafeDir = Math.random() > 0.5 ? 1 : -1;
                if (Math.random() > 0.8 && e.mesh.position.y === 0) e.velocity.y = 40;
            }

            let moveDir = new THREE.Vector3();
            if (visible && e.state === 'chase' && dist > 30) moveDir.copy(vecToPlayer);
            else if (visible && e.state === 'strafe') moveDir.crossVectors(vecToPlayer, new THREE.Vector3(0, 1, 0)).multiplyScalar(e.strafeDir);

            const nextPos = e.mesh.position.clone().add(moveDir.clone().multiplyScalar(15 * delta));
            // Simple NPC Wall Check
            const npcRay = new THREE.Raycaster(e.mesh.position.clone().add(new THREE.Vector3(0, 4, 0)), moveDir, 0, 3);
            if (npcRay.intersectObjects(state.objects).length === 0) {
                e.mesh.position.copy(nextPos);
            }

            e.mesh.lookAt(playerPos.x, e.mesh.position.y, playerPos.z);

            if (dist < 150 && state.player.hp > 0 && time - e.lastShot > 1000 && visible) {
                e.lastShot = time + Math.random() * 500;
                const start = e.mesh.position.clone().add(new THREE.Vector3(0, 7, 0));
                const intendedEnd = playerPos.clone().add(new THREE.Vector3((Math.random() - .5) * 5, -2, (Math.random() - .5) * 5));
                const shotVector = intendedEnd.clone().sub(start);
                const shotDistance = shotVector.length();
                const bulletRay = new THREE.Raycaster(start, shotVector.clone().normalize(), 0, shotDistance);
                const blockers = bulletRay.intersectObjects(state.objects, true);
                const hitWall = blockers.length > 0;
                const tracerEnd = hitWall ? blockers[0].point : intendedEnd;
                createTracer(start, tracerEnd, 0xff0000);
                playSound('enemy_fire');

                if (!hitWall && Math.random() > (state.crouch ? 0.8 : 0.6)) { // Harder to hit if crouching
                    state.player.hp -= 10;
                    updateHUD();
                    document.getElementById('damage-flash').style.opacity = 1;
                    setTimeout(() => document.getElementById('damage-flash').style.opacity = 0, 100);
                    if (state.player.hp <= 0) playerDie();
                }
            }
        });
    }

    // Update Renderer Manager (Disposables)
    rendererInstance.update();

    state.renderer.render(state.scene, state.camera);
}

export function startSinglePlayer() {
    state.gameMode = 'single';
    state.currentMode = 'classic';
    state.playerTeam = null;
    resetBombState();
    setModeHints('classic');
    disconnectMultiplayer();
    clearEnemies();
    if (state.weaponDrops.length) {
        state.weaponDrops.forEach(drop => {
            if (drop.mesh?.parent) state.scene.remove(drop.mesh);
        });
        state.weaponDrops = [];
    }
    // Spawn NPCs
    spawnEnemy(0, 0, -200);
    spawnEnemy(-150, 0, -120);
    spawnEnemy(150, 0, -120);
    spawnEnemy(0, 0, 80);

    document.getElementById('login-modal').style.display = 'none';
    document.getElementById('start-screen').style.display = 'flex';
}

export function startAICTMode(team = 'CT') {
    state.gameMode = 'ai_ct';
    state.currentMode = 'ai_ct';
    state.playerTeam = team;
    resetBombState();
    state.bomb.hasBomb = team === 'T';
    setModeHints('ai_ct', team);
    disconnectMultiplayer();
    clearEnemies();
    if (state.weaponDrops.length) {
        state.weaponDrops.forEach(drop => {
            if (drop.mesh?.parent) state.scene.remove(drop.mesh);
        });
        state.weaponDrops = [];
    }
    const ctSpawns = [
        [80, 0, 150], [-80, 0, 160], [0, 0, 200], [150, 0, 120], [-150, 0, 120]
    ];
    const tSpawns = [
        [0, 0, -220], [120, 0, -220], [-120, 0, -220], [60, 0, -170], [-60, 0, -170]
    ];
    const enemySpawns = team === 'CT' ? tSpawns : ctSpawns;
    enemySpawns.forEach(pos => spawnEnemy(pos[0], pos[1], pos[2]));

    document.getElementById('login-modal').style.display = 'none';
    document.getElementById('start-screen').style.display = 'flex';
}

function init() {
    state.scene = new THREE.Scene();
    state.scene.background = new THREE.Color(0x87CEEB);
    state.scene.fog = new THREE.Fog(0x87CEEB, 0, 500);

    // Camera setup (y=10 is eye level)
    state.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
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
        state.triggerHeld = false;
        const chatVisible = document.getElementById('chat-input').style.display === 'block';
        if (!state.player.isDead &&
            document.getElementById('shop-menu').style.display !== 'block' &&
            !chatVisible) {
            document.getElementById('start-screen').style.display = 'flex';
        }
    });

    state.scene.add(state.controls.getObject());

    // Inputs
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('pointerup', handleMouseUp);

    // Map
    buildMap();

    // Player Weapon
    createWeaponModel();
    switchWeapon(1); // Start with Glock

    // Renderer
    state.renderer = rendererInstance.getRenderer();

    window.addEventListener('resize', () => {
        state.camera.aspect = window.innerWidth / window.innerHeight;
        state.camera.updateProjectionMatrix();
        // renderer resize handled by singleton
    });
    updateHUD();

    animate();

    // Init UI listeners
    initLoginUI();

    // Show login
    document.getElementById('start-screen').style.display = 'none'; // Hide start screen initially
    document.getElementById('login-modal').style.display = 'flex';
}

// Start Game
init();
