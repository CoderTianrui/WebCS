import * as THREE from 'three';
import { state } from './state.js';
import { spawnParticles } from './utils.js';
import { playSound } from './audio.js';

// Simple class to render other players
export class RemotePlayer {
    constructor(id, name, startData) {
        this.id = id;
        this.name = name;
        this.mesh = new THREE.Group();
        this.isDead = false;
        this.hp = startData.hp ?? 100;
        const initialY = typeof startData.y === 'number' ? startData.y : 10;
        this.lastServerState = {
            x: startData.x ?? 0,
            y: initialY,
            z: startData.z ?? 0,
            ry: startData.ry ?? 0
        };
        
        // Body (Split into Torso and Legs for better visual grounding)
        const bodyMat = new THREE.MeshLambertMaterial({color: 0x0000ff}); 
        
        // Legs
        const legs = new THREE.Mesh(new THREE.BoxGeometry(3.5, 5, 2), new THREE.MeshLambertMaterial({color: 0x0000aa}));
        legs.position.y = 2.5;
        this.mesh.add(legs);

        // Torso
        const torso = new THREE.Mesh(new THREE.BoxGeometry(3.5, 5, 2), bodyMat);
        torso.position.y = 7.5;
        this.mesh.add(torso);

        // Head
        const head = new THREE.Mesh(new THREE.BoxGeometry(2,2,2), new THREE.MeshLambertMaterial({color:0xd2b48c}));
        head.position.y = 11;
        this.mesh.add(head);
        
        // Name Tag
        this.nameTag = this.createNameTag(name);
        this.nameTag.position.y = 14;
        this.mesh.add(this.nameTag);

        // Position
        // FIX: StartData.y is camera height (10), so feet should be at y-10.
        this.mesh.position.set(this.lastServerState.x, this.lastServerState.y - 10, this.lastServerState.z);
        
        state.scene.add(this.mesh);
        
        // Handle initial dead state
        if (startData.isDead || (startData.hp !== undefined && startData.hp <= 0)) {
            this.isDead = true;
            state.scene.remove(this.mesh);
            this.mesh.visible = false;
        }
        
        // Interpolation buffer
        this.targetPos = this.mesh.position.clone();
        this.targetRot = this.lastServerState.ry;
    }

    createNameTag(text) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = 256; canvas.height = 64;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(0,0,256,64);
        ctx.fillStyle = 'white';
        ctx.font = 'bold 30px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, 128, 32);
        
        const tex = new THREE.CanvasTexture(canvas);
        const mat = new THREE.SpriteMaterial({ map: tex });
        const sprite = new THREE.Sprite(mat);
        sprite.scale.set(10, 2.5, 1);
        return sprite;
    }

    update(delta) {
        if (this.isDead) return;
        // Simple Lerp for smoothness
        this.mesh.position.lerp(this.targetPos, 10 * delta);
        // Rotate body only on Y
        this.mesh.rotation.y = this.targetRot; 
    }

    setTarget(data) {
        this.updateLastServerState(data);
        // FIX: data.y is camera height, offset by -10 for feet
        this.targetPos.set(this.lastServerState.x, this.lastServerState.y - 10, this.lastServerState.z);
        this.targetRot = this.lastServerState.ry;
    }
    
    shoot(data) {
        if (this.isDead) return;
        // Visual flash or sound coming from this player
        playSound('enemy_fire'); 
    }
    
    syncFromServer(data) {
        this.setTarget(data);
        const shouldBeDead = data.isDead || (typeof data.hp === 'number' ? data.hp <= 0 : this.hp <= 0);
        if (shouldBeDead) {
            this.die();
            return;
        }
        if (this.isDead) {
            this.respawn(data);
        }
    }
    
    die() {
        if (this.isDead) return;
        this.isDead = true;
        const deathPos = this.mesh.position.clone().add(new THREE.Vector3(0, 6, 0));
        spawnParticles(deathPos, 0x880000, 6);
        if (this.mesh.parent) {
            state.scene.remove(this.mesh);
        }
        this.mesh.visible = false;
    }
    
    respawn(spawnData) {
        this.isDead = false;
        if (spawnData) {
            this.setTarget(spawnData);
            this.mesh.position.copy(this.targetPos);
        } else {
            this.mesh.position.copy(this.targetPos);
        }
        this.mesh.visible = true;
        if (!this.mesh.parent) {
            state.scene.add(this.mesh);
        }
    }

    dispose() {
        state.scene.remove(this.mesh);
        this.mesh.traverse(child => {
            if (child.geometry && child.geometry.dispose) {
                child.geometry.dispose();
            }
            if (child.material) {
                if (child.material.map && child.material.map.dispose) {
                    child.material.map.dispose();
                }
                if (Array.isArray(child.material)) {
                    child.material.forEach(mat => mat.dispose && mat.dispose());
                } else if (child.material.dispose) {
                    child.material.dispose();
                }
            }
        });
    }

    updateLastServerState(data) {
        if (!data) return;
        if (typeof data.x === 'number') this.lastServerState.x = data.x;
        if (typeof data.y === 'number') this.lastServerState.y = data.y;
        if (typeof data.z === 'number') this.lastServerState.z = data.z;
        if (typeof data.ry === 'number') this.lastServerState.ry = data.ry;
        if (typeof data.hp === 'number') this.hp = data.hp;
    }
}
