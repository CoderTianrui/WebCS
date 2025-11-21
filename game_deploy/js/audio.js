export const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let bgmOscillators = [];
let musicPlaying = false;

export function playSound(id) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const o = audioCtx.createOscillator(); const g = audioCtx.createGain();
    o.connect(g); g.connect(audioCtx.destination);
    const t = audioCtx.currentTime;

    if (id === 'pistol') { o.type = 'square'; o.frequency.setValueAtTime(600, t); g.gain.exponentialRampToValueAtTime(0.01, t + 0.1); o.start(); o.stop(t + 0.1); }
    else if (id === 'rifle') { o.type = 'sawtooth'; o.frequency.setValueAtTime(200, t); g.gain.exponentialRampToValueAtTime(0.01, t + 0.1); o.start(); o.stop(t + 0.1); }
    else if (id === 'enemy_fire') { o.type = 'square'; o.frequency.setValueAtTime(150, t); g.gain.setValueAtTime(0.1, t); g.gain.exponentialRampToValueAtTime(0.01, t + 0.1); o.start(); o.stop(t + 0.1); }
    else if (id === 'reload' || id === 'buy') { o.type = 'sine'; o.frequency.setValueAtTime(400, t); g.gain.setValueAtTime(0.1, t); g.gain.linearRampToValueAtTime(0, t + 0.3); o.start(); o.stop(t + 0.3); }
    else if (id === 'hit') { o.type = 'sawtooth'; o.frequency.setValueAtTime(800, t); g.gain.setValueAtTime(0.2, t); g.gain.exponentialRampToValueAtTime(0.01, t + 0.1); o.start(); o.stop(t + 0.1); }
    else if (id === 'click') { o.type = 'square'; o.frequency.setValueAtTime(1000, t); g.gain.setValueAtTime(0.05, t); o.start(); o.stop(t + 0.05); }
    else if (id === 'headshot') { // CRUNCH sound
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(1200, t);
        o.frequency.exponentialRampToValueAtTime(100, t + 0.1);
        g.gain.setValueAtTime(0.3, t);
        g.gain.exponentialRampToValueAtTime(0.01, t + 0.15);
        o.start(); o.stop(t + 0.15);
    }
}

export function toggleMusic() {
    if (musicPlaying) {
        bgmOscillators.forEach(o => o.stop());
        bgmOscillators = [];
        musicPlaying = false;
    } else {
        musicPlaying = true;
        playBGM();
    }
}

function playBGM() {
    if (!musicPlaying) return;
    const t = audioCtx.currentTime;
    const tempo = 0.6; // Slower for jazz feel
    // Giant Steps Key Centers (approximate bass/root movement): B, D, G, Bb, Eb, Am, D, G, Bb, Eb, F#, B
    // Frequencies: B2(123), D3(146), G2(98), Bb2(116), Eb3(155), A2(110), D3(146), G2(98)
    const notes = [123.47, 146.83, 98.00, 116.54, 155.56, 110.00, 146.83, 98.00, 116.54, 155.56, 185.00, 123.47];

    notes.forEach((freq, i) => {
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.type = 'triangle'; // Jazzier tone
        o.frequency.value = freq;
        o.connect(g);
        g.connect(audioCtx.destination);

        const start = t + i * tempo;
        g.gain.setValueAtTime(0.1, start);
        g.gain.exponentialRampToValueAtTime(0.001, start + tempo * 0.9);

        o.start(start);
        o.stop(start + tempo);
        bgmOscillators.push(o);
    });

    // Loop
    setTimeout(() => {
        if (musicPlaying) playBGM();
    }, notes.length * tempo * 1000);
}

// Expose for UI buttons if needed (though UI now imports)
window.toggleMusic = toggleMusic;
