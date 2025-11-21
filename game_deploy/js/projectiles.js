import * as THREE from 'three';
import { state } from './state.js';
import { WEAPONS } from './constants.js';
import { spawnParticles, createTracer } from './utils.js';
import { killEnemy } from './entities.js';

const tempRay = new THREE.Raycaster();
const cryptoApi = typeof globalThis !== 'undefined' ? globalThis.crypto : null;
const hasCryptoUUID = !!(cryptoApi && typeof cryptoApi.randomUUID === 'function');

function makeId() {
    return hasCryptoUUID ? cryptoApi.randomUUID() : `${Date.now()}-${Math.random()}`;
}

function toVector3(value) {
    if (value instanceof THREE.Vector3) return value.clone();
    if (!value || typeof value !== 'object') return new THREE.Vector3();
    return new THREE.Vector3(value.x || 0, value.y || 0, value.z || 0);
}

function getProjectileConfig(weaponName) {
    const weapon = WEAPONS[weaponName];
    if (!weapon || !weapon.projectile) return null;
    return weapon.projectile;
}

function buildProjectile(weaponName, opts) {
    const config = getProjectileConfig(weaponName);
    if (!config) return null;

    const direction = toVector3(opts.direction || { x: 0, y: 0, z: -1 }).normalize();
    if (direction.lengthSq() === 0) direction.set(0, 0, -1);

    const radius = config.radius ?? 3;
    const color = config.color ?? 0xffffff;
    const geom = new THREE.SphereGeometry(radius, 16, 16);
    const mat = new THREE.MeshStandardMaterial({
        color,
        emissive: config.emissive ?? color,
        emissiveIntensity: 0.4,
        metalness: 0.1,
        roughness: 0.4
    });
    const mesh = new THREE.Mesh(geom, mat);
    const start = toVector3(opts.position || state.camera?.position || { x: 0, y: 10, z: 0 });
    mesh.position.copy(start);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    state.scene.add(mesh);

    const projectile = {
        id: makeId(),
        weaponName,
        mesh,
        ownerId: opts.ownerId || state.id || 'local',
        velocity: direction.clone().multiplyScalar(opts.speed || config.speed || 400),
        gravity: config.gravity ?? -9.8 * 40,
        knockback: config.knockback ?? 120,
        damage: config.damage ?? 0,
        radius,
        wakeColor: config.wakeColor ?? 0xffffff,
        life: config.life ?? 4,
        lastTrail: 0,
        pierce: !!config.pierce,
        config
    };
    state.projectiles.push(projectile);
    return projectile;
}

export function createProjectile(weaponName, options = {}) {
    return buildProjectile(weaponName, options);
}

export function spawnProjectileFromNetwork(data = {}) {
    if (!data.weaponName) return null;
    return buildProjectile(data.weaponName, {
        position: data.position,
        direction: data.direction,
        ownerId: data.ownerId,
        speed: data.speed
    });
}

function destroyProjectile(projectile, explodeColor = 0xffffff) {
    const idx = state.projectiles.indexOf(projectile);
    if (idx > -1) state.projectiles.splice(idx, 1);
    if (projectile.mesh?.parent) {
        spawnParticles(projectile.mesh.position.clone(), explodeColor, 4);
        state.scene.remove(projectile.mesh);
        projectile.mesh.geometry?.dispose();
        if (projectile.mesh.material) {
            if (Array.isArray(projectile.mesh.material)) {
                projectile.mesh.material.forEach(mat => mat.dispose && mat.dispose());
            } else if (projectile.mesh.material.dispose) {
                projectile.mesh.material.dispose();
            }
        }
    }
}

function tryHitEnemies(projectile, nextPos, direction) {
    if (!state.enemies?.length) return false;
    for (const enemy of state.enemies) {
        if (!enemy?.mesh) continue;
        const enemyPos = enemy.mesh.position.clone();
        enemyPos.y += 6;
        const distance = enemyPos.distanceTo(nextPos);
        if (distance <= projectile.radius + 4) {
            const impulse = direction.clone().setY(direction.y + 0.2).normalize().multiplyScalar(projectile.knockback);
            enemy.velocity.add(impulse);
            if (projectile.damage > 0) {
                enemy.hp -= projectile.damage;
                if (enemy.hp <= 0) {
                    killEnemy(enemy);
                }
            }
            return true;
        }
    }
    return false;
}

function tryHitRemotePlayers(projectile, nextPos, direction, onRemotePlayerHit) {
    if (projectile.ownerId !== state.id) return false;
    if (!state.remotePlayers) return false;
    for (const [id, remote] of Object.entries(state.remotePlayers)) {
        if (!remote?.mesh || remote.isDead) continue;
        const remotePos = remote.mesh.position.clone();
        remotePos.y += 6;
        if (remotePos.distanceTo(nextPos) <= projectile.radius + 4) {
            if (typeof onRemotePlayerHit === 'function') {
                const impulse = direction.clone().setY(direction.y + 0.2).normalize().multiplyScalar(projectile.knockback);
                onRemotePlayerHit(id, impulse, projectile);
            }
            return true;
        }
    }
    return false;
}

function tryHitLocalPlayer(projectile, nextPos, direction, onLocalPlayerHit) {
    if (projectile.ownerId === state.id) return false;
    if (!state.controls) return false;
    const playerObj = state.controls.getObject();
    if (!playerObj) return false;
    const playerPos = playerObj.position.clone();
    if (playerPos.distanceTo(nextPos) <= projectile.radius + 4) {
        if (typeof onLocalPlayerHit === 'function') {
            const impulse = direction.clone().setY(Math.abs(direction.y) + 0.2).normalize().multiplyScalar(projectile.knockback);
            onLocalPlayerHit(projectile, impulse);
        }
        return true;
    }
    return false;
}

function checkMapCollision(projectile, startPos, deltaMove) {
    if (!state.objects?.length) return false;
    const distance = deltaMove.length();
    if (distance <= 0.0001) return false;
    const dir = deltaMove.clone().normalize();
    tempRay.set(startPos, dir, 0, distance + projectile.radius);
    const hits = tempRay.intersectObjects(state.objects, true);
    if (hits.length && hits[0].distance <= distance + projectile.radius) {
        destroyProjectile(projectile, projectile.wakeColor);
        return true;
    }
    return false;
}

export function updateProjectiles(delta, callbacks = {}) {
    if (!state.projectiles?.length) return;
    const { onRemotePlayerHit, onLocalPlayerHit } = callbacks;
    for (let i = state.projectiles.length - 1; i >= 0; i--) {
        const projectile = state.projectiles[i];
        const mesh = projectile.mesh;
        if (!mesh) {
            state.projectiles.splice(i, 1);
            continue;
        }

        projectile.life -= delta;
        if (projectile.life <= 0) {
            destroyProjectile(projectile, projectile.wakeColor);
            continue;
        }

        projectile.velocity.y += projectile.gravity * delta;
        const startPos = mesh.position.clone();
        const deltaMove = projectile.velocity.clone().multiplyScalar(delta);

        if (checkMapCollision(projectile, startPos, deltaMove)) continue;

        mesh.position.add(deltaMove);
        const direction = deltaMove.lengthSq() > 0 ? deltaMove.clone().normalize() : projectile.velocity.clone().normalize();

        projectile.lastTrail += delta;
        if (projectile.lastTrail > 0.025) {
            projectile.lastTrail = 0;
            createTracer(startPos.clone(), mesh.position.clone(), projectile.wakeColor);
            spawnParticles(mesh.position.clone(), projectile.wakeColor, 1);
        }

        if (tryHitEnemies(projectile, mesh.position, direction)) {
            destroyProjectile(projectile, projectile.wakeColor);
            continue;
        }

        if (tryHitRemotePlayers(projectile, mesh.position, direction, onRemotePlayerHit)) {
            destroyProjectile(projectile, projectile.wakeColor);
            continue;
        }

        if (tryHitLocalPlayer(projectile, mesh.position, direction, onLocalPlayerHit)) {
            destroyProjectile(projectile, projectile.wakeColor);
            continue;
        }
    }
}

