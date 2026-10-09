/**
 * Lecture d'écran (activée par défaut, désactivable) : pendant une partie, un flux vidéo
 * léger de l'écran du jeu (2 images/s) fournit trois petites zones publiques du HUD
 * (horloge, niveau allié, niveau adverse), lues par OCR local. L'OCR n'est relancé que si
 * une zone a changé. Les zones sont repérées automatiquement. Rien d'autre n'est lu (jamais
 * la mini-carte), aucune image n'est conservée, aucune touche n'est envoyée au jeu.
 */
import { app, desktopCapturer, nativeImage, NativeImage } from "electron";
import fs from "node:fs";
import path from "node:path";
import { createWorker, PSM, Worker } from "tesseract.js";
import { BACKEND_URL } from "./backend";
import { captureError, gameDisplay, grab, startCapture, stopCapture, type Crop } from "./capture";
import {
  allyOnRight, binarize, blueness, DEFAULT_REGIONS, HUD_BAND, LEGACY_DEFAULT_REGIONS, levelRule, locateHud, parseClock, parseLevel, Rect, Regions, signature, Stabilizer,
} from "./ocr";

export type RegionsSource = "défaut" | "auto" | "manuel";
export interface ScreenReaderConfig { enabled: boolean; regions: Regions; regionsSource: RegionsSource; version?: number }
export interface ScreenReading { clock: number | null; ally: number | null; enemy: number | null; at: number }
export type ReaderState = "off" | "idle" | "starting" | "searching" | "partial" | "ok" | "black" | "error";

const CONFIG_VERSION = 4;
const DEBUG = Boolean(process.env.HOTS_SCREEN_DEBUG);
const INTERVAL_MS = 1000;
const CLOCK_EVERY_TICKS = 3; // horloge déjà calée : vérification toutes les 3 s suffit
const LOCATE_AFTER_MISSES = 4;
const LOCATE_COOLDOWN_MS = 8000;
let config: ScreenReaderConfig = { enabled: true, regions: DEFAULT_REGIONS, regionsSource: "défaut", version: CONFIG_VERSION };
let worker: Worker | null = null;
let timer: NodeJS.Timeout | null = null;
let busy = false;
let state: ReaderState = "off";
let lastGameId: number | null = null;
let lastClock: { value: number; at: number } | null = null;
let clockSyncedAt = 0;
let tickCount = 0;
let misses = 0;
let blackCount = 0;
let lastLocateAt = 0;
let lastReading: ScreenReading | null = null;
let lastOkAt: number | null = null;
let lastCapture: NativeImage | null = null;
const cache = new Map<string, { sig: string; value: number | null }>();
const ally = new Stabilizer(levelRule);
const enemy = new Stabilizer(levelRule);
let allySide: boolean | null = null; // true = votre équipe (bleue) à droite du HUD
let sideVote: boolean | null = null;
let sideVotes = 0;

const configPath = () => path.join(app.getPath("userData"), "screen-reader.json");

export function loadConfig(): ScreenReaderConfig {
  try {
    const saved = JSON.parse(fs.readFileSync(configPath(), "utf-8"));
    config = { ...config, ...saved };
    if (saved.version !== CONFIG_VERSION) {
      // passage à la lecture automatique : activée, seules les zones vraiment placées à la main sont conservées
      // (v4 : les zones « auto » d'avant pouvaient viser les portraits -> retour aux zones par défaut)
      const manual = saved.regionsSource === "manuel"
        || (!saved.regionsSource && saved.regions && JSON.stringify(saved.regions) !== JSON.stringify(LEGACY_DEFAULT_REGIONS));
      config.enabled = true;
      config.regionsSource = manual ? "manuel" : "défaut";
      if (!manual) config.regions = DEFAULT_REGIONS;
      config.version = CONFIG_VERSION;
      persist();
    }
  } catch {
    /* première utilisation */
  }
  return config;
}

function persist(): void {
  try {
    fs.writeFileSync(configPath(), JSON.stringify(config, null, 2));
  } catch (err) {
    console.warn("[écran] configuration non enregistrée", err);
  }
}

export function saveConfig(next: Partial<ScreenReaderConfig>): ScreenReaderConfig {
  config = { ...config, ...next, regions: { ...config.regions, ...(next.regions ?? {}) } };
  if (next.regions) config.regionsSource = next.regionsSource ?? "manuel";
  persist();
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

/** Capture complète ponctuelle (calibrage manuel uniquement). */
/** Second moteur OCR (lettres) pour l'écran de chargement, libéré dès la partie lancée. */
let textWorker: Worker | null = null;
async function getTextWorker(): Promise<Worker> {
  if (textWorker) return textWorker;
  await getWorker(); // prépare les données de langue
  const workerPath = require.resolve("tesseract.js/src/worker-script/node/index.js").replace("app.asar", "app.asar.unpacked");
  textWorker = await createWorker("eng", 1, {
    errorHandler: (err: unknown) => console.warn("[ocr]", err),
    langPath: tessdataPath(), cachePath: path.join(app.getPath("userData"), "tesscache"), gzip: true, workerPath,
  });
  await textWorker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
  return textWorker;
}

function releaseTextWorker(): void {
  void textWorker?.terminate();
  textWorker = null;
}

const LOADING_SCREEN_WINDOW_MS = 150_000;
let loadingSeenAt = 0;

/** Écran de chargement : lit les pseudos et les héros des deux équipes (info publique). */
async function readLoadingScreen(): Promise<void> {
  const g = await grab([{ x: 0, y: 0, w: 1, h: 1 }], 1);
  if (!g || g.black) return;
  const frame = g.crops[0];
  const w = await getTextWorker();
  const words = [];
  for (const threshold of [150, 200]) {
    const png = nativeImage.createFromBitmap(binarize(frame.data, threshold), { width: frame.width, height: frame.height }).toPNG();
    const { data } = await w.recognize(png, {}, { blocks: true, text: true });
    for (const x of data.words ?? []) {
      if (x.text.trim().length < 2) continue;
      words.push({
        text: x.text.trim().slice(0, 64),
        x: (x.bbox.x0 + x.bbox.x1) / 2 / frame.width, y: (x.bbox.y0 + x.bbox.y1) / 2 / frame.height,
        h: (x.bbox.y1 - x.bbox.y0) / frame.height,
      });
    }
  }
  if (DEBUG) console.log("[écran] chargement", JSON.stringify(words.map((x) => x.text)));
  if (words.length) await post("loading-screen", { words: words.slice(0, 2000) });
}

export async function captureScreen(): Promise<NativeImage | null> {
  const display = gameDisplay();
  const { width, height } = display.size;
  const sf = display.scaleFactor;
  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize: { width: Math.round(width * sf), height: Math.round(height * sf) },
  });
  const source = sources.find((s) => s.display_id === String(display.id)) ?? sources[0];
  return source && !source.thumbnail.isEmpty() ? source.thumbnail : null;
}

function binarizedCrop(crop: Crop, threshold = 150): { bin: Buffer; png: () => Buffer } {
  const bin = binarize(crop.data, threshold);
  return { bin, png: () => nativeImage.createFromBitmap(bin, { width: crop.width, height: crop.height }).toPNG() };
}

function cropImage(image: NativeImage, r: Rect): Crop {
  const { width, height } = image.getSize();
  const crop = image.crop({
    x: Math.round(r.x * width), y: Math.round(r.y * height),
    width: Math.max(4, Math.round(r.w * width)), height: Math.max(4, Math.round(r.h * height)),
  });
  const size = crop.getSize();
  const big = crop.resize({ width: size.width * 3, height: size.height * 3, quality: "best" });
  return { ...big.getSize(), data: big.toBitmap() };
}

async function ocrPng(png: Buffer): Promise<string> {
  const w = await getWorker();
  const { data } = await w.recognize(png);
  return data.text.trim();
}

export async function readImage(image: NativeImage, regions: Regions = config.regions): Promise<ScreenReading> {
  const read = (r: Rect) => ocrPng(binarizedCrop(cropImage(image, r)).png());
  return {
    clock: parseClock(await read(regions.clock)),
    ally: parseLevel(await read(regions.ally)),
    enemy: parseLevel(await read(regions.enemy)),
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

/** Lit une zone ; l'OCR n'est relancé que si son contenu a changé. */
async function readCrop(key: string, crop: Crop, parse: (t: string) => number | null): Promise<number | null> {
  const { bin, png } = binarizedCrop(crop);
  const sig = signature(bin);
  const hit = cache.get(key);
  if (hit && hit.sig === sig) return hit.value;
  const value = parse(await ocrPng(png()));
  cache.set(key, { sig, value });
  return value;
}

/** Repérage automatique de l'horloge et des niveaux dans la bande du haut de l'écran. */
async function locate(): Promise<boolean> {
  lastLocateAt = Date.now();
  const g = await grab([HUD_BAND], 2);
  if (!g || g.black) return false;
  const band = g.crops[0];
  const w = await getWorker();
  for (const threshold of [150, 200, 110]) {
    const { png } = binarizedCrop(band, threshold);
    await w.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
    let found: Partial<Regions> = {};
    try {
      const { data } = await w.recognize(png(), {}, { blocks: true, text: true });
      if (DEBUG) {
        console.log("[écran] repérage", threshold, JSON.stringify((data.words ?? []).map((x) => [x.text, x.bbox])));
        fs.writeFileSync(path.join(app.getPath("userData"), `band${threshold}.png`), png());
      }
      found = locateHud(data.words ?? [], band.width, band.height);
    } finally {
      await w.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_LINE });
    }
    if (found.clock) {
      config = { ...config, regions: { ...config.regions, ...found }, regionsSource: "auto" };
      persist();
      cache.clear();
      console.log("[écran] HUD repéré", JSON.stringify(found));
      return true;
    }
  }
  return false;
}

async function tick(): Promise<void> {
  if (busy) return;
  busy = true;
  try {
    const live = await fetch(`${BACKEND_URL}/api/live/state`).then((r) => r.json()).catch(() => null);
    if (!live || !["loading", "in_game"].includes(live.status)) {
      if (state !== "idle") stopCapture();
      releaseTextWorker();
      state = "idle";
      return;
    }
    if (live.game_id !== lastGameId) {
      lastGameId = live.game_id;
      ally.reset();
      enemy.reset();
      cache.clear();
      allySide = sideVote = null;
      sideVotes = 0;
      lastClock = null;
      clockSyncedAt = 0;
      misses = blackCount = 0;
      loadingSeenAt = Date.now();
    }
    if (live.levels?.source === "manuel") {
      // correction du joueur : elle fait foi, les lectures suivantes partent de là
      ally.sync(live.levels.ally);
      enemy.sync(live.levels.enemy);
    }
    if (!(await startCapture())) {
      state = "error";
      return;
    }
    if (state === "idle" || state === "error") state = "starting";
    tickCount++;
    // Compositions : seulement pendant l'écran de chargement (jamais en pleine partie)
    if (live.status === "loading" && !live.teams?.complete && Date.now() - loadingSeenAt < LOADING_SCREEN_WINDOW_MS) {
      if (tickCount % 3 === 0) await readLoadingScreen();
    } else if (textWorker) {
      releaseTextWorker();
    }
    const g = await grab([config.regions.clock, config.regions.ally, config.regions.enemy]);
    if (!g) return;
    if (g.black) {
      if (++blackCount >= 3) state = "black";
      return;
    }
    blackCount = 0;

    const clockFresh = Date.now() - clockSyncedAt < 15000;
    const readClock = !clockFresh || tickCount % CLOCK_EVERY_TICKS === 0;
    // Votre équipe n'est pas toujours à gauche : son niveau est bleu, celui de l'adversaire rose.
    const side = allyOnRight(blueness(g.crops[1].data), blueness(g.crops[2].data));
    if (side !== null) {
      sideVotes = side === sideVote ? sideVotes + 1 : 1;
      sideVote = side;
      if (sideVotes >= 3 && side !== allySide) {
        if (allySide !== null) console.log("[écran] côté de l'équipe corrigé", side ? "droite" : "gauche");
        allySide = side;
        ally.reset();
        enemy.reset();
      }
    }
    const left = await readCrop("left", g.crops[1], parseLevel);
    const right = await readCrop("right", g.crops[2], parseLevel);
    const reading: ScreenReading = {
      clock: readClock ? await readCrop("clock", g.crops[0], parseClock) : null,
      ally: allySide === null ? null : allySide ? right : left,
      enemy: allySide === null ? null : allySide ? left : right,
      at: Date.now(),
    };
    lastReading = reading;
    if (DEBUG) {
      console.log("[écran]", state, JSON.stringify(reading), config.regionsSource);
      g.crops.forEach((c, i) => fs.writeFileSync(path.join(app.getPath("userData"), `crop${i}.png`), binarizedCrop(c).png()));
    }

    // Horloge : deux lectures cohérentes avec le temps écoulé avant de synchroniser.
    if (reading.clock !== null) {
      if (lastClock && Math.abs(reading.clock - lastClock.value - (reading.at - lastClock.at) / 1000) <= 3) {
        await post("sync", { clock_s: reading.clock, source: "écran" });
        clockSyncedAt = reading.at;
      }
      lastClock = { value: reading.clock, at: reading.at };
    }
    const a = ally.push(reading.ally);
    const e = enemy.push(reading.enemy);
    if (a !== null || e !== null) {
      await post("levels", { ally: a ?? undefined, enemy: e ?? undefined, source: "écran" });
    } else if (!live.levels && (ally.value !== null || enemy.value !== null) && tickCount % 5 === 0) {
      // lecture stable mais pas encore retenue (horloge pas encore lue) : on la renvoie
      await post("levels", { ally: ally.value ?? undefined, enemy: enemy.value ?? undefined, source: "écran" });
    }

    // Zones à retrouver si l'horloge OU les niveaux restent illisibles quelques secondes.
    const clockOk = reading.clock !== null || clockFresh;
    const levelsOk = left !== null && right !== null;
    misses = clockOk && levelsOk ? 0 : misses + 1;
    if (clockOk) {
      lastOkAt = reading.at;
      state = levelsOk || (ally.value !== null && enemy.value !== null) ? "ok" : "partial";
    } else if (misses >= LOCATE_AFTER_MISSES) {
      state = "searching";
    }
    if (misses >= LOCATE_AFTER_MISSES && config.regionsSource !== "manuel"
        && Date.now() - lastLocateAt > LOCATE_COOLDOWN_MS * (clockOk ? 3 : 1)) {
      if (await locate()) misses = 0;
    }
  } catch (err) {
    console.warn("[écran] lecture impossible", err);
  } finally {
    busy = false;
  }
}

function restart(): void {
  if (timer) clearInterval(timer);
  timer = config.enabled ? setInterval(() => void tick(), INTERVAL_MS) : null;
  if (!config.enabled) {
    stopCapture();
    state = "off";
  } else if (state === "off") {
    state = "idle";
  }
}

export function startScreenReader(): void {
  loadConfig();
  restart();
}

export function stopScreenReader(): void {
  if (timer) clearInterval(timer);
  timer = null;
  stopCapture();
  releaseTextWorker();
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
export async function rememberCapture(): Promise<"ok" | "black" | "none"> {
  const image = await captureScreen();
  if (!image) return "none";
  lastCapture = image;
  // Capture quasi noire : le plein écran exclusif empêche souvent la capture.
  const small = image.resize({ width: 64 }).toBitmap();
  let sum = 0;
  for (let i = 0; i < small.length; i += 4) sum += Math.max(small[i], small[i + 1], small[i + 2]);
  return sum / (small.length / 4) < 8 ? "black" : "ok";
}

/** Relit la dernière capture avec des zones candidates (aperçu en direct du calibrage). */
export async function testRegions(regions: Regions): Promise<ScreenReading | null> {
  return lastCapture ? readImage(lastCapture, regions) : null;
}

export interface ScreenReaderStatus {
  config: ScreenReaderConfig; last: ScreenReading | null; state: ReaderState; lastOkAt: number | null; error: string | null;
}

export function screenReaderStatus(): ScreenReaderStatus {
  return { config, last: lastReading, state, lastOkAt, error: state === "error" ? captureError() : null };
}
