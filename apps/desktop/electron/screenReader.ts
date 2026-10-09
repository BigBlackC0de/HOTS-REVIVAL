/**
 * Lecture d'écran (opt-in) : toutes les 2 s pendant une partie, capture l'écran principal,
 * découpe trois petites zones publiques du HUD (horloge, niveau allié, niveau adverse)
 * et les lit par OCR local. Rien d'autre n'est lu (jamais la mini-carte), aucune image
 * n'est conservée, aucune touche n'est envoyée au jeu.
 */
import { app, desktopCapturer, nativeImage, NativeImage, screen } from "electron";
import fs from "node:fs";
import path from "node:path";
import { createWorker, PSM, Worker } from "tesseract.js";
import { BACKEND_URL } from "./backend";
import { binarize, DEFAULT_REGIONS, levelRule, parseClock, parseLevel, Rect, Regions, Stabilizer } from "./ocr";

export interface ScreenReaderConfig { enabled: boolean; regions: Regions }
export interface ScreenReading { clock: number | null; ally: number | null; enemy: number | null; at: number }

const INTERVAL_MS = 2000;
let config: ScreenReaderConfig = { enabled: false, regions: DEFAULT_REGIONS };
let worker: Worker | null = null;
let timer: NodeJS.Timeout | null = null;
let busy = false;
let lastGameId: number | null = null;
let lastClock: { value: number; at: number } | null = null;
let lastReading: ScreenReading | null = null;
let lastCapture: NativeImage | null = null;
const ally = new Stabilizer(levelRule);
const enemy = new Stabilizer(levelRule);

const configPath = () => path.join(app.getPath("userData"), "screen-reader.json");

export function loadConfig(): ScreenReaderConfig {
  try {
    config = { ...config, ...JSON.parse(fs.readFileSync(configPath(), "utf-8")) };
  } catch {
    /* première utilisation */
  }
  return config;
}

export function saveConfig(next: Partial<ScreenReaderConfig>): ScreenReaderConfig {
  config = { ...config, ...next, regions: { ...config.regions, ...(next.regions ?? {}) } };
  fs.writeFileSync(configPath(), JSON.stringify(config, null, 2));
  restart();
  return config;
}

function tessdataPath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, "tessdata")
    : path.join(__dirname, "..", "resources", "tessdata");
}

async function getWorker(): Promise<Worker> {
  if (worker) return worker;
  const workerPath = require.resolve("tesseract.js/src/worker-script/node/index.js").replace("app.asar", "app.asar.unpacked");
  // Dans Electron, tesseract.js traite langPath comme une URL : on dépose donc les données
  // embarquées dans son cache, qu'il lit en priorité (fonctionne hors ligne).
  const cachePath = path.join(app.getPath("userData"), "tesscache");
  const cached = path.join(cachePath, "eng.traineddata");
  if (!fs.existsSync(cached)) {
    fs.mkdirSync(cachePath, { recursive: true });
    fs.copyFileSync(path.join(tessdataPath(), "eng.traineddata.gz"), cached);
  }
  worker = await createWorker("eng", 1, {
    errorHandler: (err: unknown) => console.warn("[ocr]", err),
    langPath: tessdataPath(),
    cachePath,
    gzip: true,
    workerPath,
  });
  await worker.setParameters({
    tessedit_char_whitelist: "0123456789:",
    tessedit_pageseg_mode: PSM.SINGLE_LINE,
  });
  return worker;
}

export async function captureScreen(): Promise<NativeImage | null> {
  const display = screen.getPrimaryDisplay();
  const { width, height } = display.size;
  const sf = display.scaleFactor;
  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize: { width: Math.round(width * sf), height: Math.round(height * sf) },
  });
  const source = sources.find((s) => s.display_id === String(display.id)) ?? sources[0];
  return source && !source.thumbnail.isEmpty() ? source.thumbnail : null;
}

function cropForOcr(image: NativeImage, r: Rect): NativeImage {
  const { width, height } = image.getSize();
  const crop = image.crop({
    x: Math.round(r.x * width), y: Math.round(r.y * height),
    width: Math.max(4, Math.round(r.w * width)), height: Math.max(4, Math.round(r.h * height)),
  });
  const size = crop.getSize();
  const big = crop.resize({ width: size.width * 3, height: size.height * 3, quality: "best" });
  const bigSize = big.getSize();
  return nativeImage.createFromBitmap(binarize(big.toBitmap()), bigSize);
}

async function ocr(image: NativeImage, r: Rect): Promise<string> {
  const w = await getWorker();
  const { data } = await w.recognize(cropForOcr(image, r).toPNG());
  return data.text.trim();
}

export async function readImage(image: NativeImage, regions: Regions = config.regions): Promise<ScreenReading> {
  return {
    clock: parseClock(await ocr(image, regions.clock)),
    ally: parseLevel(await ocr(image, regions.ally)),
    enemy: parseLevel(await ocr(image, regions.enemy)),
    at: Date.now(),
  };
}

async function post(pathname: string, body: unknown): Promise<void> {
  await fetch(`${BACKEND_URL}/api/live/${pathname}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => undefined);
}

async function tick(): Promise<void> {
  if (busy) return;
  busy = true;
  try {
    const state = await fetch(`${BACKEND_URL}/api/live/state`).then((r) => r.json()).catch(() => null);
    if (!state || !["loading", "in_game"].includes(state.status)) return;
    if (state.game_id !== lastGameId) {
      lastGameId = state.game_id;
      ally.reset();
      enemy.reset();
      lastClock = null;
    }
    const image = await captureScreen();
    if (!image) return;
    lastCapture = image;
    const reading = await readImage(image);
    lastReading = reading;

    // Horloge : deux lectures cohérentes avec le temps écoulé avant de synchroniser.
    if (reading.clock !== null) {
      if (lastClock && Math.abs(reading.clock - lastClock.value - (reading.at - lastClock.at) / 1000) <= 3) {
        await post("sync", { clock_s: reading.clock, source: "écran" });
      }
      lastClock = { value: reading.clock, at: reading.at };
    }
    const a = ally.push(reading.ally);
    const e = enemy.push(reading.enemy);
    if (a !== null || e !== null) await post("levels", { ally: a ?? undefined, enemy: e ?? undefined, source: "écran" });
  } catch (err) {
    console.warn("[écran] lecture impossible", err);
  } finally {
    busy = false;
  }
}

function restart(): void {
  if (timer) clearInterval(timer);
  timer = config.enabled ? setInterval(() => void tick(), INTERVAL_MS) : null;
}

export function startScreenReader(): void {
  loadConfig();
  restart();
}

export function stopScreenReader(): void {
  if (timer) clearInterval(timer);
  timer = null;
  void worker?.terminate();
  worker = null;
}

/** Capture pour le calibrage (image réduite renvoyée à l'interface). */
export async function calibrationCapture(fresh = true): Promise<{ image: string; reading: ScreenReading } | null> {
  const image = (fresh ? await captureScreen() : null) ?? lastCapture;
  if (!image) return null;
  lastCapture = image;
  const reading = await readImage(image);
  return { image: image.resize({ width: 1280 }).toDataURL(), reading };
}

/** Raccourci en jeu : mémorise l'écran pour le calibrage (aucun fichier écrit). */
export async function rememberCapture(): Promise<boolean> {
  const image = await captureScreen();
  if (image) lastCapture = image;
  return Boolean(image);
}

/** Relit la dernière capture avec des zones candidates (aperçu en direct du calibrage). */
export async function testRegions(regions: Regions): Promise<ScreenReading | null> {
  return lastCapture ? readImage(lastCapture, regions) : null;
}

export function screenReaderStatus(): { config: ScreenReaderConfig; last: ScreenReading | null } {
  return { config, last: lastReading };
}
