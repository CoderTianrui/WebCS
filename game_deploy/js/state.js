import * as THREE from 'three';

// Global State Container
export const state = {
    gameMode: 'single', // 'single' or 'multi'

    camera: null,
    scene: null,
    renderer: null,
    controls: null,

    // Network
    socket: null,
    id: null, // My Socket ID
    room: null,
    remotePlayers: {}, // { socketId: RemotePlayerObject }
    chatMessageIds: new Set(),
    chatMessageQueue: [],
    weaponDrops: [],
    playerName: 'Player',
    playerTeam: null,
    currentMode: 'classic', // classic, ai_ct, multi_ct
    modeHints: [],
    settingsOpen: false,

    bomb: {
        hasBomb: false,
        isPlanted: false,
        site: null,
        plantedAt: 0,
        explodeTime: 0,
        mesh: null,
        timerText: null
    },

    bombSites: [],

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
        slots: ['m4a1', 'glock', 'knife'], activeSlot: 1,
        ammo: { glock: 20, usp: 12, deagle: 7, m4a1: 30, ak47: 30, mp5: 30, awp: 10 },
        mags: { glock: 120, usp: 60, deagle: 35, m4a1: 90, ak47: 90, mp5: 120, awp: 30 },
        lastShot: 0, reloading: false, isDead: false,
        height: 10
    },

    // Visuals
    weaponGroup: null,

    // Mobile Flag
    isMobile: false,

    // Time
    prevTime: performance.now()
};
