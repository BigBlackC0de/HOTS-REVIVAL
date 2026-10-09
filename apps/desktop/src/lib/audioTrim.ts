/**
 * Coupe le silence au début et à la fin d'un enregistrement, puis le réencode en WAV mono 16 bits.
 * Renvoie null si le décodage échoue ou si tout est silencieux (on garde alors le fichier d'origine).
 */
const THRESHOLD = 0.02; // amplitude considérée comme de la voix
const PAD_S = 0.08; // marge conservée autour de la voix

export async function trimSilence(input: Blob): Promise<Blob | null> {
  let ctx: AudioContext | null = null;
  try {
    ctx = new AudioContext();
    const buf = await ctx.decodeAudioData(await input.arrayBuffer());
    const mono = new Float32Array(buf.length);
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const data = buf.getChannelData(c);
      for (let i = 0; i < data.length; i++) mono[i] += data[i] / buf.numberOfChannels;
    }
    let start = mono.findIndex((v) => Math.abs(v) > THRESHOLD);
    if (start < 0) return null;
    let end = mono.length - 1;
    while (end > start && Math.abs(mono[end]) <= THRESHOLD) end--;
    const pad = Math.round(PAD_S * buf.sampleRate);
    start = Math.max(0, start - pad);
    end = Math.min(mono.length, end + pad);
    return wav(mono.subarray(start, end), buf.sampleRate);
  } catch {
    return null;
  } finally {
    void ctx?.close();
  }
}

function wav(samples: Float32Array, rate: number): Blob {
  const out = new DataView(new ArrayBuffer(44 + samples.length * 2));
  const str = (o: number, s: string) => [...s].forEach((ch, i) => out.setUint8(o + i, ch.charCodeAt(0)));
  str(0, "RIFF");
  out.setUint32(4, 36 + samples.length * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  out.setUint32(16, 16, true);
  out.setUint16(20, 1, true); // PCM
  out.setUint16(22, 1, true); // mono
  out.setUint32(24, rate, true);
  out.setUint32(28, rate * 2, true);
  out.setUint16(32, 2, true);
  out.setUint16(34, 16, true);
  str(36, "data");
  out.setUint32(40, samples.length * 2, true);
  samples.forEach((v, i) => out.setInt16(44 + i * 2, Math.max(-1, Math.min(1, v)) * 0x7fff, true));
  return new Blob([out.buffer], { type: "audio/wav" });
}
