// Which camera the butcher's recording uses (founders 28.10.2026: an OBSBOT on a cable to the shop's Android tablet).
// The choice is kept on the device; with none yet, a camera plugged in by cable is taken over the tablet's own.

const KEY = "bp.camera";

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
