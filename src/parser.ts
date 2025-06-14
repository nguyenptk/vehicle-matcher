// Normalization maps
const MAKE_MAP: Record<string,string> = { vw: 'volkswagen' };
const FUEL_MAP: Record<string,string> = { hybrid: 'hybrid-petrol' };
const DRIVE_MAP: Record<string,string> = {
  '4x4': 'Four Wheel Drive',
  '4wd': 'Four Wheel Drive',
  fwd:  'Front Wheel Drive',
  rwd:  'Rear Wheel Drive',
};

const NOISE_MARKERS = [
  ' with ',
  ' engine swap',
  ' swap engine',
  ' swap ',
  ' for sale',
  ' owned',
  ' kms'
];

export function parseDescription(raw: string) {
  let desc = raw.toLowerCase();

  // 1) Trim off noise clauses
  const noiseRegex = new RegExp(NOISE_MARKERS.join('|'), 'i');
  desc = desc.split(noiseRegex)[0];

  const tokens = desc.split(/\s+/);

  // 2) Make
  const makeToken = tokens.find(t => MAKE_MAP[t] || ['volkswagen','toyota'].includes(t));
  const make = makeToken ? (MAKE_MAP[makeToken] || makeToken) : undefined;

  // 3) Model
  const model = tokens.find(t => ['golf','amarok','tiguan','rav4','camry','kluger','86'].includes(t));

  // 4) Badge (everything between model and next known attr)
  let badge: string|undefined;
  if (model) {
    const idx = tokens.indexOf(model);
    const endIdx = tokens.findIndex((t,i) =>
      i > idx && (
        ['petrol','diesel','automatic','manual'].includes(t) ||
        DRIVE_MAP[t] != null
      )
    );
    const rawBadge = tokens
      .slice(idx+1, endIdx < 0 ? undefined : endIdx)
      .map(t => t.replace(/[\-\/]/g,' '))   // normalize slash/hyphen
      .join(' ')
      .trim();
    badge = rawBadge || undefined;
  }

  // 5) Fuel
  const fuelToken = tokens.find(t => ['petrol','diesel','hybrid'].includes(t));
  const fuelType = fuelToken ? (FUEL_MAP[fuelToken] || fuelToken) : undefined;

  // 6) Transmission
  const transmissionType = tokens.find(t => ['automatic','manual'].includes(t));

  // 7) Drive
  const driveToken = tokens.find(t => DRIVE_MAP[t]);
  const driveType = driveToken
    ? DRIVE_MAP[driveToken]
    : undefined;

  return { make, model, badge, fuelType, transmissionType, driveType };
}
