/**
 * Préchargement de la fenêtre de capture (invisible). Elle ouvre UN flux vidéo réduit de l'écran
 * du jeu (720 lignes en jeu, 1 image/s) et n'en extrait, à la demande, que de petites zones du HUD.
 * Bien moins coûteux que de recapturer tout l'écran à chaque lecture : pas de lag en jeu.
 */
import { ipcRenderer } from "electron";

interface Rect { x: number; y: number; w: number; h: number }
interface GrabRequest { id: number; rects: Rect[]; scale: number; refHeight: number }
declare class ImageCapture {
  constructor(track: MediaStreamTrack);
  grabFrame(): Promise<ImageBitmap>;
}

let stream: MediaStream | null = null;
let capture: ImageCapture | null = null;

function stop(): void {
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  capture = null;
}

ipcRenderer.on("capture:start", async (_e, { sourceId, width, height, fps }: { sourceId: string; width: number; height: number; fps: number }) => {
  stop();
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: "desktop",
          chromeMediaSourceId: sourceId,
          minWidth: width, maxWidth: width, minHeight: height, maxHeight: height,
          maxFrameRate: fps,
        },
      } as unknown as MediaTrackConstraints,
    });
    capture = new ImageCapture(stream.getVideoTracks()[0]);
    ipcRenderer.send("capture:started", { ok: true });
  } catch (err) {
    stop();
    ipcRenderer.send("capture:started", { ok: false, error: String(err) });
  }
});

ipcRenderer.on("capture:stop", () => stop());

ipcRenderer.on("capture:grab", async (_e, req: GrabRequest) => {
  if (!capture) {
    ipcRenderer.send("capture:frame", { id: req.id, ok: false });
    return;
  }
  let frame: ImageBitmap | null = null;
  try {
    frame = await capture.grabFrame();
    const W = frame.width, H = frame.height;
    // agrandissement demandé pour un écran de refHeight lignes -> facteur réel pour cette image
    const k = (req.scale * req.refHeight) / H;
    // écran noir (plein écran non capturable) : moyenne de luminosité d'une vignette
    const thumb = new OffscreenCanvas(48, 27).getContext("2d")!;
    thumb.drawImage(frame, 0, 0, 48, 27);
    const px = thumb.getImageData(0, 0, 48, 27).data;
    let sum = 0;
    for (let i = 0; i < px.length; i += 4) sum += Math.max(px[i], px[i + 1], px[i + 2]);
    const black = sum / (px.length / 4) < 8;

    const crops = req.rects.map((r) => {
      const sx = Math.round(r.x * W), sy = Math.round(r.y * H);
      const sw = Math.max(4, Math.round(r.w * W)), sh = Math.max(4, Math.round(r.h * H));
      const dw = Math.max(1, Math.round(sw * k)), dh = Math.max(1, Math.round(sh * k));
      const ctx = new OffscreenCanvas(dw, dh).getContext("2d")!;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(frame!, sx, sy, sw, sh, 0, 0, dw, dh);
      return { width: dw, height: dh, data: ctx.getImageData(0, 0, dw, dh).data };
    });
    ipcRenderer.send("capture:frame", { id: req.id, ok: true, black, width: W, height: H, crops });
  } catch (err) {
    ipcRenderer.send("capture:frame", { id: req.id, ok: false, error: String(err) });
  } finally {
    frame?.close();
  }
});
