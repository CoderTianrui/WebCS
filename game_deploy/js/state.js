import * as THREE from 'three';

// Global State Container
export const state = {
    camera: null,
    scene: null,
    renderer: null,
    controls: null,
    
    // Network
    socket: null,
    id: null, // My Socket ID
    room: null,
    remotePlayers: {}, // { socketId: RemotePlayerObject }
    
    // Input
    moveF: false,
    moveB: false,
    moveL: false,
    moveR: false,
    crouch: false,
    canJump: false,

    // Physics
    velocity: new THREE.Vector3(),
    direction: new THREE.Vector3(),
    
    // Game Objects
    objects: [], // Walls
    enemies: [], // NPCs
    particles: [], // Effects
    
    // Player
    player: {
        hp: 100, money: 800,
        // Slot 0: Primary, Slot 1: Secondary, Slot 2: Melee
        slots: [null, 'glock', 'knife'], activeSlot: 1,
        ammo: { glock:20, deagle:7, m4a1:30, awp:10 },
        mags: { glock:120, deagle:35, m4a1:90, awp:30 },
        lastShot: 0, reloading: false, isDead: false,
        height: 10
    },

    // Visuals
    weaponGroup: null,

    // Time
    prevTime: performance.now()
};
