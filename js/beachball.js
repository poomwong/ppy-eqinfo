// Renders a focal mechanism beachball onto a <canvas>, from a moment
// tensor's two nodal planes (strike/dip only - rake isn't needed here since
// both planes' normals fully determine the compressional/dilatational
// pattern). Lower-hemisphere equal-area projection, rasterized per-pixel.

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

function nodalPlaneNormal(strikeDeg, dipDeg) {
  const strike = toRad(strikeDeg);
  const dip = toRad(dipDeg);
  return {
    n: -Math.sin(dip) * Math.sin(strike),
    e: Math.sin(dip) * Math.cos(strike),
    d: -Math.cos(dip),
  };
}

function dot(a, b) {
  return a.n * b.n + a.e * b.e + a.d * b.d;
}

function drawBeachball(canvas, np1Strike, np1Dip, np2Strike, np2Dip) {
  const ctx = canvas.getContext("2d");
  const size = canvas.width;
  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2 - 2;

  const n1 = nodalPlaneNormal(np1Strike, np1Dip);
  const n2 = nodalPlaneNormal(np2Strike, np2Dip);

  const img = ctx.createImageData(size, size);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const idx = (py * size + px) * 4;
      const x = (px - cx) / radius;
      const y = (py - cy) / radius;
      const r = Math.sqrt(x * x + y * y);

      if (r > 1) {
        img.data[idx + 3] = 0;
        continue;
      }

      const east = x;
      const north = -y;
      const azimuth = Math.atan2(east, north);
      const theta = 2 * Math.asin(Math.min(r, 1) / Math.SQRT2);
      const down = Math.cos(theta);
      const horiz = Math.sin(theta);
      const v = { n: horiz * Math.cos(azimuth), e: horiz * Math.sin(azimuth), d: down };

      const compressional = dot(n1, v) * dot(n2, v) > 0;
      const [red, green, blue] = compressional ? [26, 26, 30] : [255, 255, 255];

      img.data[idx] = red;
      img.data[idx + 1] = green;
      img.data[idx + 2] = blue;
      img.data[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.strokeStyle = "#555";
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

window.Beachball = { drawBeachball };
