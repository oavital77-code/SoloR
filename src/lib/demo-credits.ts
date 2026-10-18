// Credits for the demo catalogue photos (public/demo/dNN), all from Wikimedia Commons under free licenses.
// The licenses ask for attribution, so the cut page lists these under the photos of a demo cut.
// d07 keeps its generated photos and has no entry.
import type { CutMedia } from "./types";

export type PhotoCredit = { author: string; license: string; page: string };

const C = (author: string, license: string, file: string): PhotoCredit =>
  ({ author, license, page: `https://commons.wikimedia.org/wiki/File:${file}` });

const kolfornRibeye = C("Kolforn", "Attribution", "-2020-20-22_Two_cuts_of_rib_eye_beef_steak,_Trimingham.JPG");
const angusEntrecote = C("Chianti", "Free Art License", "Angus_Organic_Entrecote.jpg");
const delmonico = C("José Manuel López Pinto", "CC BY-SA 3.0", "Lomo_Delm%C3%B3nico_-_Ribeye.JPG");
const chuckShortRibs = C("Tim Evanson", "CC BY-SA 2.0", "Bone-in_chuck_short_ribs.jpg");
const chuckSteaks = C("pete", "CC BY 2.0", "Chuck_steaks.jpg");
const twoFlanken = C("Tim Evanson", "CC BY-SA 2.0", "Two_flanken_cut_short_ribs.jpg");
const trayFlanken = C("Tim Evanson", "CC BY-SA 2.0", "Tray_of_flanken_cut_short_ribs.jpg");
const flankenSection = C("Tim Evanson", "CC BY-SA 2.0", "Flanken_cut_short_rib_and_cross-section.jpg");
const kobeHeerlien = C("Maarten Heerlien", "CC BY 2.0", "Kobe_beef_(6454124161).jpg");
const kobeWang = C("Jiashiang Wang", "CC BY 2.0", "JP-28_Kobe_Kobe-Beef.jpg");
const wagyuStrip = C("H. Alexander Talbot", "CC BY 2.0", "WagyuStripSteak_(8324549421).jpg");
const denver = C("Pannet", "CC BY-SA 4.0", "Denver_steak.jpg");
const ribEye = C("King pigeon", "Public domain", "RibEyeSteak.jpg");
const marbled = C("jit bag", "CC BY 2.0", "Marbled_beef.jpg");
const omi = C("Syced", "CC0", "%E8%BF%91%E6%B1%9F%E7%89%9B.jpg");
const stripSteak = C("Ɱ", "CC BY-SA 3.0", "StripSteak.jpg");
const kolfornSirloin = C("Kolforn", "Attribution", "-2020-11-20_Sirloin_steak,_Trimingham,_Norfolk_(1).JPG");
const fauxFilet = C("Kintaro", "CC BY-SA 4.0", "Faux-filet_de_blonde_d%27Aquitaine_1.jpg");
const picanhaKnife = C("Marcelo Träsel", "CC BY-SA 2.0", "Picanha_wagyu_(4573037873).jpg");
const picanhaBoard = C("Marcelo Träsel", "CC BY-SA 2.0", "Picanha_wagyu_(4573675968).jpg");
const picanhaCap = C("Marcelo Träsel", "CC BY-SA 2.0", "Picanha_wagyu_(4573559382).jpg");

/** demo folder -> credit of photo 1, 2, 3 */
const CREDITS: Record<string, PhotoCredit[]> = {
  d01: [delmonico, kolfornRibeye, angusEntrecote],
  d02: [picanhaCap, picanhaCap, picanhaCap],
  d03: [chuckShortRibs, chuckSteaks, chuckShortRibs],
  d04: [twoFlanken, trayFlanken, flankenSection],
  d05: [kobeHeerlien, kobeWang, wagyuStrip],
  d06: [denver, denver, denver],
  d08: [ribEye, marbled, omi],
  d09: [stripSteak, kolfornSirloin, fauxFilet],
  d10: [picanhaKnife, picanhaBoard, picanhaKnife],
};

/** Distinct credits for the demo photos among these media (empty for a butcher's own photos). */
export function demoCredits(media: Pick<CutMedia, "type" | "storage_path">[]): PhotoCredit[] {
  const out: PhotoCredit[] = [];
  for (const m of media) {
    const hit = m.type === "photo" && /^\/demo\/(d\d+)\/(\d)\.jpg$/.exec(m.storage_path);
    const credit = hit ? CREDITS[hit[1]]?.[Number(hit[2]) - 1] : undefined;
    if (credit && !out.includes(credit)) out.push(credit);
  }
  return out;
}

export const isDemoMedia = (media: Pick<CutMedia, "storage_path">[]) => media.some((m) => m.storage_path.startsWith("/demo/"));
