export const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let bgmOscillators = [];
let musicPlaying = false;
let bgmTimeout = null;

// Frequency map for notes needed in the Genshin theme
const N = {
    G2: 98.00, A2: 110.00, B2: 123.47, C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, G3: 196.00,
    A3: 220.00, B3: 246.94, C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.00,
    A4: 440.00, B4: 493.88, C5: 523.25, D5: 587.33, E5: 659.25
};

export function playSound(id) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const o = audioCtx.createOscillator(); 
    const g = audioCtx.createGain();
    o.connect(g); 
    g.connect(audioCtx.destination);
    const t = audioCtx.currentTime;

    if (id === 'pistol') { 
        o.type = 'square'; o.frequency.setValueAtTime(600, t); 
        g.gain.exponentialRampToValueAtTime(0.01, t + 0.1); 
        o.start(); o.stop(t + 0.1); 
    }
    else if (id === 'rifle') { 
        o.type = 'sawtooth'; o.frequency.setValueAtTime(200, t); 
        g.gain.exponentialRampToValueAtTime(0.01, t + 0.1); 
        o.start(); o.stop(t + 0.1); 
    }
    else if (id === 'gatling') {
        o.type = 'square';
        o.frequency.setValueAtTime(250, t);
        g.gain.setValueAtTime(0.2, t);
        g.gain.exponentialRampToValueAtTime(0.01, t + 0.05);
        o.start(); o.stop(t + 0.05);
    }
    else if (id === 'enemy_fire') { 
        o.type = 'square'; o.frequency.setValueAtTime(150, t); 
        g.gain.setValueAtTime(0.1, t); g.gain.exponentialRampToValueAtTime(0.01, t + 0.1); 
        o.start(); o.stop(t + 0.1); 
    }
    else if (id === 'reload' || id === 'buy') { 
        o.type = 'sine'; o.frequency.setValueAtTime(400, t); 
        g.gain.setValueAtTime(0.1, t); g.gain.linearRampToValueAtTime(0, t + 0.3); 
        o.start(); o.stop(t + 0.3); 
    }
    else if (id === 'hit') { 
        o.type = 'sawtooth'; o.frequency.setValueAtTime(800, t); 
        g.gain.setValueAtTime(0.2, t); g.gain.exponentialRampToValueAtTime(0.01, t + 0.1); 
        o.start(); o.stop(t + 0.1); 
    }
    else if (id === 'click') { 
        o.type = 'square'; o.frequency.setValueAtTime(1000, t); 
        g.gain.setValueAtTime(0.05, t); 
        o.start(); o.stop(t + 0.05); 
    }
    else if (id === 'heavy') {
        o.type = 'square';
        o.frequency.setValueAtTime(350, t);
        g.gain.setValueAtTime(0.25, t);
        g.gain.exponentialRampToValueAtTime(0.01, t + 0.2);
        o.start(); o.stop(t + 0.2);
    }
    else if (id === 'knife') {
        o.type = 'triangle';
        o.frequency.setValueAtTime(250, t);
        g.gain.setValueAtTime(0.2, t);
        g.gain.linearRampToValueAtTime(0.001, t + 0.08);
        o.start(); o.stop(t + 0.08);
    }
    else if (id === 'snow') {
        o.type = 'sine';
        o.frequency.setValueAtTime(900, t);
        g.gain.setValueAtTime(0.15, t);
        g.gain.linearRampToValueAtTime(0.001, t + 0.12);
        o.start(); o.stop(t + 0.12);
    }
    else if (id === 'headshot') { 
        // CRUNCH sound
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(1200, t);
        o.frequency.exponentialRampToValueAtTime(100, t + 0.1);
        g.gain.setValueAtTime(0.3, t);
        g.gain.exponentialRampToValueAtTime(0.01, t + 0.15);
        o.start(); o.stop(t + 0.15);
    }
}

function stopBgmNodes() {
    bgmOscillators.forEach(node => {
        try { node.stop(); } catch (e) { /* noop */ }
    });
    bgmOscillators = [];
    if (bgmTimeout) {
        clearTimeout(bgmTimeout);
        bgmTimeout = null;
    }
}

export function toggleMusic() {
    if (musicPlaying) {
        stopBgmNodes();
        musicPlaying = false;
    } else {
        // Ensure no legacy loop keeps playing the old theme
        stopBgmNodes();
        if (audioCtx.state === 'suspended') audioCtx.resume();
        musicPlaying = true;
        playBGM();
    }
}

function playBGM() {
    if (!musicPlaying) return;
    const t = audioCtx.currentTime;
    
    // Tempo: Approx 68 BPM, but speeding slightly for game feel to 75 BPM
    // 1 beat = 0.8 seconds
    const beat = 0.6; 

    // Genshin Impact Main Theme "Daylight" (Simplified Transcription)
    // We play two voices: Melody (Sine) and Harmony/Bass (Triangle)
    
    const melody = [
        // Phrase 1: "Fa... So-La-Ti..." -> Actually key of C: G E D C
        { f: N.G4, d: 1 }, { f: N.E4, d: 1 }, { f: N.D4, d: 1 }, { f: N.C4, d: 3 },
        // Phrase 2: G C D E D
        { f: N.G3, d: 1 }, { f: N.C4, d: 1 }, { f: N.D4, d: 1 }, { f: N.E4, d: 1 }, { f: N.D4, d: 3 },
        // Phrase 3: G E D C
        { f: N.G4, d: 1 }, { f: N.E4, d: 1 }, { f: N.D4, d: 1 }, { f: N.C4, d: 3 },
        // Phrase 4: G C D E C
        { f: N.G3, d: 1 }, { f: N.C4, d: 1 }, { f: N.D4, d: 1 }, { f: N.E4, d: 1 }, { f: N.C4, d: 4 },
        
        // High Part (Climax)
        { f: N.E5, d: 1 }, { f: N.D5, d: 1 }, { f: N.C5, d: 1 }, { f: N.G4, d: 3 },
        { f: N.C5, d: 1 }, { f: N.B4, d: 1 }, { f: N.A4, d: 1 }, { f: N.G4, d: 3 },
        { f: N.E5, d: 1 }, { f: N.D5, d: 1 }, { f: N.C5, d: 1 }, { f: N.G4, d: 2 }, { f: N.C5, d: 1 },
        { f: N.B4, d: 1 }, { f: N.D5, d: 1 }, { f: N.C5, d: 4 }
    ];

    const harmony = [
        // Arpeggiated/Chords style (Bass notes)
        // C Major
        { f: N.C3, d: 6, t: 0 }, { f: N.G3, d: 4, t: 0 }, 
        // G Major / B
        { f: N.B2, d: 6, t: 6 }, 
        // A Minor
        { f: N.A2, d: 6, t: 12 }, 
        // F Major
        { f: N.F2, d: 6, t: 18 }, { f: N.C3, d: 6, t: 18 }
    ];

    // Play Melody
    let currentTime = t;
    melody.forEach((note) => {
        if (!musicPlaying) return;
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        
        o.type = 'sine'; // Flute-like sound
        o.frequency.value = note.f;
        
        o.connect(g);
        g.connect(audioCtx.destination);

        // Envelope (Soft attack, long release)
        g.gain.setValueAtTime(0, currentTime);
        g.gain.linearRampToValueAtTime(0.15, currentTime + 0.1);
        g.gain.setValueAtTime(0.15, currentTime + (note.d * beat) - 0.1);
        g.gain.linearRampToValueAtTime(0, currentTime + (note.d * beat));

        o.start(currentTime);
        o.stop(currentTime + (note.d * beat));
        
        bgmOscillators.push(o);
        currentTime += (note.d * beat);
    });

    // Play Harmony (Simple Bass/Pad)
    // We loop the harmony pattern twice to cover the melody length
    for (let loop = 0; loop < 2; loop++) {
        let loopOffset = loop * (24 * beat); // Harmony pattern is approx 24 beats
        harmony.forEach((note) => {
            if (!musicPlaying) return;
            const o = audioCtx.createOscillator();
            const g = audioCtx.createGain();
            
            o.type = 'triangle'; // Harp/String-like
            o.frequency.value = note.f;
            
            o.connect(g);
            g.connect(audioCtx.destination);

            const start = t + (note.t * beat) + loopOffset;
            const duration = note.d * beat;

            if (start < currentTime) { // Only schedule if within melody time
                g.gain.setValueAtTime(0, start);
                g.gain.linearRampToValueAtTime(0.08, start + 0.5);
                g.gain.linearRampToValueAtTime(0, start + duration);

                o.start(start);
                o.stop(start + duration);
                bgmOscillators.push(o);
            }
        });
    }

    // Calculate total duration to loop
    const totalDuration = melody.reduce((acc, n) => acc + n.d, 0) * beat;

    bgmTimeout = setTimeout(() => {
        if (musicPlaying) playBGM();
    }, totalDuration * 1000);
}