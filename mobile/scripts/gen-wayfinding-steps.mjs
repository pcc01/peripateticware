// gen-wayfinding-steps.mjs
//
// Regenerates the `setLocation` stepping blocks for a wayfinding Maestro flow
// from a list of stop coordinates. Use it after nudging a stop to match a real
// trail location: paste the output over the corresponding block in
// maestro/flows-prod/wayfinding-prod.yaml (or the local 11-wayfinding.yaml).
//
// Each stop gets 5 fixes spiralling in from ~40 m out to dead centre, all
// inside a 60 m arrival radius — enough distinct in-radius updates for
// useWayfinding's 2-fix arrival confirmation, on any emulator.
//
// Usage:
//   node scripts/gen-wayfinding-steps.mjs \
//     47.99790,-122.43850  47.99900,-122.43720  47.99680,-122.43680
//
//   # optional: --radius <m> (default 60), --start <lat,lon> for the pre-login fix
//
// Prints YAML to stdout.

const args = process.argv.slice(2);
let radius = 60;
let start = null;
const stops = [];

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--radius') { radius = Number(args[++i]); continue; }
  if (a === '--start')  { start = args[++i]; continue; }
  const m = a.match(/^(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)$/);
  if (!m) { console.error(`skipping unparseable arg: ${a}`); continue; }
  stops.push({ lat: Number(m[1]), lon: Number(m[2]) });
}

if (stops.length < 1) {
  console.error('need at least one "lat,lon" stop argument');
  process.exit(1);
}

// metres per degree, good enough at these latitudes
const M_PER_DEG_LAT = 111320;
const mPerDegLon = (lat) => 111320 * Math.cos((lat * Math.PI) / 180);

// Approach offsets as a fraction of the radius, SW -> centre.
const fracs = [0.66, 0.42, 0.24, 0.10, 0];

const f = (n) => n.toFixed(5);

const stepFor = (stop) => {
  const dLat = radius / M_PER_DEG_LAT;
  const dLon = radius / mPerDegLon(stop.lat);
  return fracs
    .map((fr) => {
      const lat = stop.lat + dLat * fr * 0.9;
      const lon = stop.lon + dLon * fr * 1.1; // bias E so the track isn't a straight diagonal
      return `- setLocation: { latitude: ${f(lat)}, longitude: ${f(lon)} }`;
    })
    .join('\n');
};

const out = [];
if (start) {
  const m = start.match(/^(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)$/);
  if (m) out.push(`- setLocation:\n    latitude: ${f(Number(m[1]))}\n    longitude: ${f(Number(m[2]))}`);
}
stops.forEach((stop, idx) => {
  out.push(`# Stop ${idx + 1} — into ${f(stop.lat)},${f(stop.lon)} (radius ${radius} m).`);
  out.push(stepFor(stop));
  out.push(
    `- extendedWaitUntil:\n    visible: "${idx + 1} of ${stops.length} stops"\n    timeout: 45000`
  );
});

console.log(out.join('\n'));
