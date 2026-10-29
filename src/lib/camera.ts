// Which camera the butcher's recording uses (founders 28.10.2026: an OBSBOT on a cable to the shop's Android tablet).
// The choice is kept on the device; with none yet, a camera plugged in by cable is taken over the tablet's own.

const KEY = "bp.camera";
const APP_KEY = "bp.camera.app";

/** the shop records in the camera's own app (a camera on a cable that only its app can read): the screen asks for
 * the video file instead of opening a camera */
export function recordsInApp(): boolean {
  try { return window.localStorage.getItem(APP_KEY) === "1"; } catch { return false; }
}

export function setRecordsInApp(on: boolean) {
  try { if (on) window.localStorage.setItem(APP_KEY, "1"); else window.localStorage.removeItem(APP_KEY); } catch { /* ignore */ }
}

export function savedCamera(): string | null {
  try { return window.localStorage.getItem(KEY); } catch { return null; }
}

export function saveCamera(id: string | null) {
  try { if (id) window.localStorage.setItem(KEY, id); else window.localStorage.removeItem(KEY); } catch { /* ignore */ }
}

/** a camera on a cable (an OBSBOT, any USB webcam) rather than the tablet's own front or back one */
export function externalCamera(cams: Pick<MediaDeviceInfo, "deviceId" | "label">[]): string | null {
  const own = /front|back|rear|facing|integrated|built-in|פנימית|קדמית|אחורית/i;
  const plugged = /obsbot|usb|uvc|external|webcam|meet/i;
  return cams.find((c) => plugged.test(c.label) && !own.test(c.label))?.deviceId ?? null;
}

/** what to ask the browser for: the chosen camera in full HD if it can, else the back camera */
export function cameraConstraints(id: string | null): MediaTrackConstraints {
  return id
    ? { deviceId: { exact: id }, width: { ideal: 1920 }, height: { ideal: 1080 } }
    : { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } };
}
