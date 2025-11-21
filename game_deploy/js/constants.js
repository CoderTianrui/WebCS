export const WEAPONS = {
    knife: { name: "KNIFE", type: "melee", dmg: 35, rate: 400, range: 8, sound: 'knife', price: 0 },
    katana: { name: "KATANA", type: "melee", dmg: 55, rate: 350, range: 9, sound: 'knife', price: 2000 },

    glock: { name: "GLOCK", type: "pistol", dmg: 15, rate: 200, clip: 20, spread: 0.03, sound: 'pistol', price: 400 },
    usp: { name: "USP", type: "pistol", dmg: 20, rate: 180, clip: 12, spread: 0.02, sound: 'pistol', price: 500 },
    deagle: { name: "DEAGLE", type: "pistol", dmg: 55, rate: 500, clip: 7, spread: 0.01, sound: 'heavy', price: 700 },

    m4a1: { name: "M4A1", type: 'rifle', dmg: 30, rate: 100, clip: 30, mag: 90, spread: 0.02, price: 3100, sound: 'rifle' },
    ak47: { name: "AK47", type: 'rifle', dmg: 35, rate: 110, clip: 30, mag: 90, spread: 0.03, price: 2700, sound: 'rifle' },
    mp5: { name: "MP5", type: 'rifle', dmg: 27, rate: 90, clip: 30, mag: 120, spread: 0.025, price: 2250, sound: 'rifle' },
    awp: { name: "AWP", type: 'sniper', dmg: 100, rate: 1500, clip: 10, mag: 30, spread: 0.001, price: 4750, sound: 'rifle' }
};
