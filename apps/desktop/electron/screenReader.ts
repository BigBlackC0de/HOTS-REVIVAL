/**
 * Lecture d'écran (activée par défaut, désactivable) : pendant une partie, un flux vidéo
 * léger de l'écran du jeu (720 lignes, 1 image/s) fournit trois petites zones publiques du HUD
 * (horloge, niveau allié, niveau adverse), lues par OCR local : niveaux toutes les 2 s,
 * horloge seulement toutes les 15 s une fois calée (l'application la fait avancer seule).
 * L'OCR n'est relancé que si une zone a changé. L'horloge est repérée automatiquement ; les niveaux suivent la géométrie
 * fixe du HUD et l'équipe se déduit de leur couleur (bleu = la vôtre, rose = l'adversaire). Rien d'autre n'est lu (jamais
 * la mini-carte), aucune image n'est conservée, aucune touche n'est envoyée au jeu.
 */
import { app, desktopCapturer, nativeImage, NativeImage } from "electron";
import fs from "node:fs";
import path from "node:path";
import { createWorker, PSM, Worker } from "tesseract.js";
import { BACKEND_URL } from "./backend";
import { captureError, gameDisplay, grab, startCapture, stopCapture, type Crop } from "./capture";
import {
  allyOnRight, assignLevels, binarize, DEFAULT_REGIONS, HUD_BAND, hudRegions, LEGACY_DEFAULT_REGIONS, levelImage, levelMask, levelRule, levelTint, locateClock,
  parseClock, parseLevel, Rect, Regions, signature, Stabilizer, teamColor, type LevelRead, type TeamColor,
} from "./ocr";

export type RegionsSource = "défaut" | "auto" | "manuel";
export interface ScreenReaderConfig { enabled: boolean; regions: Regions; regionsSource: RegionsSource; version?: number }
export interface ScreenReading { clock: number | null; ally: number | null; enemy: number | null; at: number }
export type ReaderState = "off" | "idle" | "starting" | "searching" | "partial" | "ok" | "black" | "error";

const CONFIG_VERSION = 5;
const DEBUG = Boolean(process.env.HOTS_SCREEN_DEBUG);
const INTERVAL_MS = 2000; // une lecture des niveaux par tick (ils changent rarement)
const CLOCK_VERIFY_MS = 15_000; // horloge calée : simple vérification toutes les 15 s
const CLOCK_FRESH_MS = 30_000; // calage récent : une lecture ratée ne compte pas comme un échec
const LOCATE_AFTER_MISSES = 4; // ticks sans horloge (~8 s) avant de la rechercher
const LOCATE_COOLDOWN_MS = 10_000; // doublé après chaque recherche vaine (max 2 min)
const LOCATE_COOLDOWN_MAX_MS = 120_000;
// Côté de votre équipe : un vote par lecture (un chiffre bleu ET l'autre rose), soit un toutes les 2 s.
// 3 votes concordants (~6 s) pour le fixer, puis verrouillé pour la partie (l'animation de montée
// de niveau change la couleur des chiffres) : 10 votes contraires d'affilée (~20 s) pour le corriger.
const SIDE_VOTES_TO_SET = 3;
const SIDE_VOTES_TO_FLIP = 10;
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
let locateCooldown = LOCATE_COOLDOWN_MS;
let hudSeen = false; // HUD de partie vu (horloge lue ou niveaux bleu/rose) : fin de l'écran de chargement
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
      // (v5 : les zones de niveau « auto » d'avant étaient mal placées ou trop étroites -> géométrie fixe du HUD)
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

/**
 * Zones lues : celles placées à la main, sinon la géométrie fixe du HUD pour les niveaux
 * (jamais déplacées par le repérage, qui ne retrouve que l'horloge).
 */
function activeRegions(aspect: number): Regions {
  if (config.regionsSource === "manuel") return config.regions;
  return { ...hudRegions(aspect), clock: config.regions.clock };
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
const LOADING_SCREEN_EVERY_MS = 6000;
// Écran entier ramené à 1080 lignes (flux « chargement ») : à 900 lignes ou moins, l'OCR perd
// déjà une bonne part du petit texte (essai hors ligne) ; ~35 % de calcul en moins qu'en 1440.
const LOADING_SCREEN_SCALE = 1080 / 1440;
let loadingSeenAt = 0;
let loadingReadAt = 0;

/** Écran de chargement : lit les pseudos et les héros des deux équipes (info publique). */
async function readLoadingScreen(): Promise<void> {
  loadingReadAt = Date.now();
  const g = await grab([{ x: 0, y: 0, w: 1, h: 1 }], LOADING_SCREEN_SCALE);
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

/** Chiffre de niveau isolé (sans halo ni décor) et sa couleur d'équipe. */
function levelCrop(crop: Crop): { bin: Buffer; png: () => Buffer; color: TeamColor | null } {
  const mask = levelMask(crop.data, crop.width, crop.height);
  const img = levelImage(mask, crop.width, crop.height);
  return {
    bin: img.data, color: teamColor(levelTint(crop.data, mask)),
    png: () => nativeImage.createFromBitmap(img.data, { width: img.width, height: img.height }).toPNG(),
  };
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

export async function readImage(image: NativeImage, regions?: Regions): Promise<ScreenReading> {
  const { width, height } = image.getSize();
  const r = regions ?? activeRegions(width / height);
  const level = async (rect: Rect): Promise<LevelRead> => {
    const c = levelCrop(cropImage(image, rect));
    return { value: parseLevel(await ocrPng(c.png())), color: c.color };
  };
  const left = await level(r.ally), right = await level(r.enemy);
  return {
    clock: parseClock(await ocrPng(binarizedCrop(cropImage(image, r.clock)).png())),
    ...assignLevels(allyOnRight(left.color, right.color), left, right),
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

/** Lit une zone (déjà binarisée) ; l'OCR n'est relancé que si son contenu a changé. */
async function readCrop(key: string, { bin, png }: { bin: Buffer; png: () => Buffer }, parse: (t: string) => number | null): Promise<number | null> {
  const sig = signature(bin);
  const hit = cache.get(key);
  if (hit && hit.sig === sig) return hit.value;
  const value = parse(await ocrPng(png()));
  cache.set(key, { sig, value });
  return value;
}

/** Repérage automatique de l'horloge dans la bande du haut de l'écran. */
async function locate(): Promise<boolean> {
  lastLocateAt = Date.now();
  const g = await grab([HUD_BAND], 2);
  if (!g || g.black) return false;
  const band = g.crops[0];
  const w = await getWorker();
  for (const threshold of [150, 200, 110]) {
    const { png } = binarizedCrop(band, threshold);
    await w.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
    let found: Rect | null = null;
    try {
      const { data } = await w.recognize(png(), {}, { blocks: true, text: true });
      if (DEBUG) {
        console.log("[écran] repérage", threshold, JSON.stringify((data.words ?? []).map((x) => [x.text, x.bbox])));
        fs.writeFileSync(path.join(app.getPath("userData"), `band${threshold}.png`), png());
      }
      found = locateClock(data.words ?? [], band.width, band.height);
    } finally {
      await w.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_LINE });
    }
    if (found) {
      locateCooldown = LOCATE_COOLDOWN_MS;
      config = { ...config, regions: { ...config.regions, clock: found }, regionsSource: "auto" };
      persist();
      cache.clear();
      console.log("[écran] horloge repérée", JSON.stringify(found));
      return true;
    }
  }
  // horloge introuvable (menu, mort, interface différente) : on espace les recherches, coûteuses
  locateCooldown = Math.min(locateCooldown * 2, LOCATE_COOLDOWN_MAX_MS);
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
      loadingReadAt = 0;
      hudSeen = false;
      locateCooldown = LOCATE_COOLDOWN_MS;
    }
    if (live.levels?.source === "manuel") {
      // correction du joueur : elle fait foi, les lectures suivantes partent de là
      ally.sync(live.levels.ally);
      enemy.sync(live.levels.enemy);
    }
    // Compositions : seulement pendant l'écran de chargement, jamais une fois le HUD de partie vu
    // (le statut reste « loading » tant que l'horloge n'est pas calée).
    const loadingScreen = live.status === "loading" && !hudSeen && !live.teams?.complete
      && Date.now() - loadingSeenAt < LOADING_SCREEN_WINDOW_MS;
    if (!loadingScreen && textWorker) releaseTextWorker();
    if (!(await startCapture(loadingScreen ? "chargement" : "hud"))) {
      state = "error";
      return;
    }
    if (state === "idle" || state === "error") state = "starting";
    tickCount++;
    const sinceSync = Date.now() - clockSyncedAt;
    const clockFresh = sinceSync < CLOCK_FRESH_MS;
    const readClock = sinceSync >= CLOCK_VERIFY_MS; // pas encore calée, ou vérification périodique
    const { width: sw, height: sh } = gameDisplay().size;
    const regions = activeRegions(sw / sh);
    const g = await grab(readClock ? [regions.ally, regions.enemy, regions.clock] : [regions.ally, regions.enemy]);
    if (!g) return;
    if (g.black) {
      if (++blackCount >= 3) state = "black";
      return;
    }
    blackCount = 0;

    // Votre équipe n'est pas toujours à gauche : son niveau est bleu, celui de l'adversaire rose.
    const lc = levelCrop(g.crops[0]), rc = levelCrop(g.crops[1]);
    const side = allyOnRight(lc.color, rc.color);
    if (side !== null) {
      sideVotes = side === sideVote ? sideVotes + 1 : 1;
      sideVote = side;
      if (side !== allySide && sideVotes >= (allySide === null ? SIDE_VOTES_TO_SET : SIDE_VOTES_TO_FLIP)) {
        if (allySide !== null) console.log("[écran] côté de l'équipe corrigé", side ? "droite" : "gauche");
        allySide = side;
        ally.reset();
        enemy.reset();
      }
    }
    const left = await readCrop("left", lc, parseLevel);
    const right = await readCrop("right", rc, parseLevel);
    const reading: ScreenReading = {
      clock: readClock ? await readCrop("clock", binarizedCrop(g.crops[2]), parseClock) : null,
      ...assignLevels(allySide, { value: left, color: lc.color }, { value: right, color: rc.color }),
      at: Date.now(),
    };
    lastReading = reading;
    if (DEBUG) {
      console.log("[écran]", state, JSON.stringify(reading), config.regionsSource, lc.color, rc.color, allySide);
      [lc, rc, ...(readClock ? [binarizedCrop(g.crops[2])] : [])].forEach((c, i) => fs.writeFileSync(path.join(app.getPath("userData"), `crop${i}.png`), c.png()));
    }
    if (reading.clock !== null || side !== null) hudSeen = true;
    if (loadingScreen && !hudSeen && Date.now() - loadingReadAt >= LOADING_SCREEN_EVERY_MS) await readLoadingScreen();

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

    // Horloge à retrouver si elle reste illisible quelques secondes (les zones de niveau sont fixes).
    const clockOk = reading.clock !== null || clockFresh;
    const levelsOk = left !== null && right !== null;
    misses = clockOk ? 0 : misses + 1;
    if (clockOk) {
      lastOkAt = reading.at;
      state = levelsOk || (ally.value !== null && enemy.value !== null) ? "ok" : "partial";
    } else if (misses >= LOCATE_AFTER_MISSES) {
      state = "searching";
    }
    // (pas pendant l'écran de chargement : il n'y a pas encore d'horloge à trouver)
    if (misses >= LOCATE_AFTER_MISSES && !loadingScreen && config.regionsSource !== "manuel" && Date.now() - lastLocateAt > locateCooldown) {
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
