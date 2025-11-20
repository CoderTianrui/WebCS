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
        
        // Body
        const bodyMat = new THREE.MeshLambertMaterial({color: 0x0000ff}); // Blue for others
        const body = new THREE.Mesh(new THREE.BoxGeometry(3.5, 10, 2), bodyMat);
        body.position.y = 5; // Center is at 0,0,0
        this.mesh.add(body);

        // Head
        const head = new THREE.Mesh(new THREE.BoxGeometry(2,2,2), new THREE.MeshLambertMaterial({color:0xd2b48c}));
        head.position.y = 11;
        this.mesh.add(head);
        
        // Name Tag
        this.nameTag = this.createNameTag(name);
        this.nameTag.position.y = 14;
        this.mesh.add(this.nameTag);

        // Position
        this.mesh.position.set(startData.x || 0, startData.y || 0, startData.z || 0);
        
        state.scene.add(this.mesh);
        
        // Interpolation buffer
        this.targetPos = this.mesh.position.clone();
        this.targetRot = 0;
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
        // Simple Lerp for smoothness
        this.mesh.position.lerp(this.targetPos, 10 * delta);
        // Rotate body only on Y
        // this.mesh.rotation.y = THREE.MathUtils.lerp(this.mesh.rotation.y, this.targetRot, 10 * delta);
        // Better to just set rotation or implement quaternions if full rotation needed
        this.mesh.rotation.y = this.targetRot; 
    }

    setTarget(data) {
        this.targetPos.set(data.x, data.y, data.z);
        this.targetRot = data.ry;
        // Could also animate pitch (rx) if we had separate head/arms
    }
    
    shoot(data) {
        // Visual flash or sound coming from this player
        playSound('enemy_fire'); // Reuse existing sound
        // Maybe show a muzzle flash
    }
    
    die() {
        // Animation or ragdoll? Just hide for now
        this.mesh.visible = false;
    }
    
    respawn() {
        this.mesh.visible = true;
    }

    dispose() {
        state.scene.remove(this.mesh);
    }
}

