import fs from 'node:fs';
import { inflateSync } from 'node:zlib';

// Read-only RGBA PNG inspection; never changes approved artwork.
export function inspectPng(file) {
    const png = fs.readFileSync(file);
    if (png.readUInt32BE(0) !== 0x89504e47 || png[24] !== 8 || png[25] !== 6 || png[28] !== 0) {
        throw new Error(`${file}: expected non-interlaced 8-bit RGBA PNG`);
    }
    const width = png.readUInt32BE(16), height = png.readUInt32BE(20), chunks = [];
    for (let p = 8; p < png.length;) {
        const n = png.readUInt32BE(p), type = png.toString('ascii', p + 4, p + 8);
        if (type === 'IDAT') chunks.push(png.subarray(p + 8, p + 8 + n));
        p += n + 12;
    }
    const raw = inflateSync(Buffer.concat(chunks)), stride = width * 4;
    const pixels = Buffer.alloc(height * stride);
    function paeth(a, b, c) {
        const p = a + b - c, da = Math.abs(p - a), db = Math.abs(p - b), dc = Math.abs(p - c);
        return da <= db && da <= dc ? a : db <= dc ? b : c;
    }
    for (let y = 0; y < height; y++) {
        const filter = raw[y * (stride + 1)];
        if (filter > 4) throw new Error('Invalid PNG filter');
        for (let x = 0; x < stride; x++) {
            const i = y * stride + x, a = x >= 4 ? pixels[i - 4] : 0;
            const b = y ? pixels[i - stride] : 0, c = y && x >= 4 ? pixels[i - stride - 4] : 0;
            const predictors = [0, a, b, Math.floor((a + b) / 2), paeth(a, b, c)];
            pixels[i] = (raw[y * (stride + 1) + 1 + x] + predictors[filter]) & 255;
        }
    }
    let left = width, top = height, right = -1, bottom = -1, transparent = 0;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const a = pixels[(y * width + x) * 4 + 3];
        if (!a) transparent++;
        if (a >= 16) { left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y); }
    }
    // The lowest solid strip belongs to the oval base, even for an off-center crank.
    let baseLeft = width, baseRight = -1;
    for (let y = Math.max(top, bottom - 12); y <= bottom; y++) for (let x = left; x <= right; x++) {
        if (pixels[(y * width + x) * 4 + 3] >= 128) { baseLeft = Math.min(baseLeft, x); baseRight = Math.max(baseRight, x); }
    }
    return { width, height, crop: [left, top, right - left + 1, bottom - top + 1],
        anchor: [(baseLeft + baseRight) / 2, bottom], transparentFraction: transparent / (width * height),
        cornerAlpha: [0, width - 1, width * (height - 1), width * height - 1].map(i => pixels[i * 4 + 3]) };
}

if (process.argv[1]?.endsWith('inspect-device-png.mjs')) {
    for (const file of process.argv.slice(2)) console.log(JSON.stringify({ file, ...inspectPng(file) }));
}
