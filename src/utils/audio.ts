/**
 * Converts raw 16-bit PCM audio samples to a valid WAV file Blob.
 * Gemini 3.8 Flash TTS returns 24kHz, 16-bit mono PCM.
 */
export function pcmToWavBlob(
  pcmData: Uint8Array,
  sampleRate = 24000,
  numChannels = 1,
  bitsPerSample = 16
): Blob {
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const buffer = new ArrayBuffer(44 + pcmData.length);
  const view = new DataView(buffer);

  // RIFF identifier
  writeAsciiString(view, 0, 'RIFF');
  // RIFF chunk length
  view.setUint32(4, 36 + pcmData.length, true);
  // WAVE identifier
  writeAsciiString(view, 8, 'WAVE');

  // "fmt " subchunk
  writeAsciiString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true); // AudioFormat (1 = PCM)
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);

  // "data" subchunk
  writeAsciiString(view, 36, 'data');
  view.setUint32(40, pcmData.length, true);

  // Payload
  const pcmBytes = new Uint8Array(buffer, 44);
  pcmBytes.set(pcmData);

  return new Blob([buffer], { type: 'audio/wav' });
}

function writeAsciiString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

/**
 * Base64 string to Uint8Array helper
 */
export function base64ToUint8Array(base64: string): Uint8Array {
  const cleanBase64 = base64.replace(/\s/g, '');
  const binaryString = atob(cleanBase64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Fallback synthesizer using browser Web Speech API.
 * CRITICAL: Only speaks if an authentic Dutch / Flemish (nl-BE or nl-NL) voice exists in the OS.
 * Never allows English or French voices to read Dutch text, as that creates an unnatural accent.
 */
export function speakWithBrowserSynthesis(
  text: string,
  options: {
    pitch?: number;
    rate?: number;
    onEnd?: () => void;
    onError?: (err: any) => void;
  } = {}
): { success: boolean; reason?: string; voiceName?: string } {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return { success: false, reason: 'speech_synthesis_unavailable' };
  }

  // Clean tags like <laugh> or |mhm| for speech synthesis
  const cleanText = text
    .replace(/<[^>]+>/g, ' ')
    .replace(/\|([^|]+)\|/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();

  window.speechSynthesis.cancel();

  const voices = window.speechSynthesis.getVoices();
  // Find nl-BE (Belgian Dutch / Flemish) voice first, then nl-NL, then any nl
  const beVoice = voices.find((v) => v.lang.toLowerCase() === 'nl-be' || v.lang.toLowerCase().startsWith('nl-be'));
  const nlVoice = voices.find((v) => v.lang.toLowerCase().startsWith('nl'));

  const chosenVoice = beVoice || nlVoice;

  // If no Dutch voice is installed on user OS, DO NOT speak with English/French voice!
  if (!chosenVoice && voices.length > 0) {
    console.warn('Geen Nederlandse of Vlaamse stem gevonden in het besturingssysteem van de browser.');
    return {
      success: false,
      reason: 'no_dutch_voice_installed',
    };
  }

  const utterance = new SpeechSynthesisUtterance(cleanText);
  utterance.lang = chosenVoice ? chosenVoice.lang : 'nl-BE';
  utterance.pitch = options.pitch ?? 1.0;
  utterance.rate = options.rate ?? 0.95;

  if (chosenVoice) {
    utterance.voice = chosenVoice;
  }

  if (options.onEnd) {
    utterance.onend = () => options.onEnd?.();
  }
  if (options.onError) {
    utterance.onerror = (e) => options.onError?.(e);
  }

  window.speechSynthesis.speak(utterance);
  return {
    success: true,
    voiceName: chosenVoice?.name || 'Standaard nl-BE',
  };
}
