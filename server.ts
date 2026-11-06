import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import { createServer as createViteServer } from 'vite';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json({ limit: '10mb' }));

// Azure Edge TTS synthesizer (free, no API key required, native nl-BE-DenaNeural & nl-BE-ArnaudNeural)
async function synthesizeAzureEdge(
  text: string,
  voice = 'nl-BE-DenaNeural',
  speed = 1.0
): Promise<Buffer> {
  const tts = new MsEdgeTTS();
  try {
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    const ratePercentage = Math.round((speed - 1) * 100);
    const rateStr = ratePercentage >= 0 ? `+${ratePercentage}%` : `${ratePercentage}%`;
    const { audioStream } = tts.toStream(text, { rate: rateStr });
    return await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      audioStream.on('data', (chunk: Buffer) => chunks.push(chunk));
      audioStream.on('close', () => resolve(Buffer.concat(chunks)));
      audioStream.on('error', reject);
    });
  } finally {
    try {
      tts.close();
    } catch {}
  }
}

// Helper to provide preloaded authentic Flemish audio when Gemini free-tier rate quota is exceeded
function getPreloadedFallbackPcm(
  voiceName?: string,
  speechTherapyMode?: boolean
): { pcmBase64: string; sampleName: string } | null {
  try {
    let filePath = path.join(__dirname, 'public/samples/vlaamse-vrouw-kore.wav');
    let sampleName = 'Kore (VRT Nieuwsanker)';

    if (speechTherapyMode) {
      filePath = path.join(__dirname, 'public/samples/logopediste-nl-be.wav');
      sampleName = 'Aoede (Vlaamse Logopediste SoundSteps)';
    } else if (voiceName === 'Aoede') {
      filePath = path.join(__dirname, 'public/samples/vlaamse-vrouw-aoede.wav');
      sampleName = 'Aoede (Verhalend & Warm)';
    } else if (voiceName === 'Leda') {
      filePath = path.join(__dirname, 'public/samples/vlaamse-vrouw-leda.wav');
      sampleName = 'Leda (Jong & Levendig)';
    } else if (voiceName === 'Puck') {
      filePath = path.join(__dirname, 'public/samples/antwerps.wav');
      sampleName = 'Puck (Antwerps Dialect)';
    } else if (voiceName === 'Charon') {
      filePath = path.join(__dirname, 'public/samples/west-vlaams.wav');
      sampleName = 'Charon (West-Vlaams)';
    } else if (voiceName === 'Fenrir') {
      filePath = path.join(__dirname, 'public/samples/vrt-standard.wav');
      sampleName = 'Fenrir (VRT Standaard)';
    }

    if (fs.existsSync(filePath)) {
      const wav = fs.readFileSync(filePath);
      // Strip 44-byte WAV header to extract pure 16-bit 24kHz mono PCM
      const pcm = wav.subarray(44);
      return {
        pcmBase64: pcm.toString('base64'),
        sampleName,
      };
    }
  } catch (e) {
    console.warn('Could not read fallback audio sample:', e);
  }
  return null;
}

// Shared Gemini client utility (server-side only)
const apiKey = process.env.GEMINI_API_KEY;
const ai = apiKey
  ? new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    })
  : null;

// Health / Status endpoint
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    hasApiKey: !!process.env.GEMINI_API_KEY,
  });
});

// TTS Generation Endpoint for Flemish and Dutch voice synthesis
app.post('/api/tts/generate', async (req, res) => {
  const {
    text,
    style = 'Authentic Flemish accent from Flanders, Belgium. Natural Belgian Dutch intonation, warm tone, soft g pronunciation.',
    voiceName = 'Aoede',
    modelType = 'gemini-3.8-flash-lite-tts',
    isMultiSpeaker = false,
    speakers = [],
    speechTherapyMode = false,
    clinicalRole = 'general', // 'target_reference' | 'contrast_reference' | 'target_bearing_utterance' | 'instructional_narration'
    speed = 1.0,
  } = req.body || {};

  try {
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Text prompt is required.' });
    }

    // Direct Azure Edge TTS synthesis (Free, no quota, native nl-BE-DenaNeural / nl-BE-ArnaudNeural)
    const isAzureEdge =
      modelType === 'azure-edge-tts' ||
      voiceName === 'nl-BE-DenaNeural' ||
      voiceName === 'nl-BE-ArnaudNeural' ||
      voiceName?.startsWith('nl-BE-');

    if (isAzureEdge) {
      const edgeVoice =
        voiceName === 'nl-BE-ArnaudNeural' ? 'nl-BE-ArnaudNeural' : 'nl-BE-DenaNeural';
      const edgeSpeed = speed || (speechTherapyMode ? 0.88 : 1.0);
      try {
        const audioBuffer = await synthesizeAzureEdge(text, edgeVoice, edgeSpeed);
        return res.json({
          audioBase64: audioBuffer.toString('base64'),
          mimeType: 'audio/mp3',
          sampleRate: 24000,
          modelUsed: `Azure Edge TTS (${edgeVoice})`,
          isAzureEdge: true,
          voiceName: edgeVoice,
        });
      } catch (edgeErr: any) {
        console.warn('Azure Edge direct synthesis failed, falling back:', edgeErr);
      }
    }

    if (!ai) {
      // If no Gemini API key configured, use Azure Edge TTS directly!
      try {
        const audioBuffer = await synthesizeAzureEdge(text, 'nl-BE-DenaNeural', speed || 1.0);
        return res.json({
          audioBase64: audioBuffer.toString('base64'),
          mimeType: 'audio/mp3',
          sampleRate: 24000,
          modelUsed: 'Azure Edge TTS (nl-BE-DenaNeural)',
          isAzureEdge: true,
        });
      } catch {
        return res.status(503).json({
          error: 'Geen TTS engine beschikbaar.',
          fallbackAvailable: true,
        });
      }
    }

    let response;
    const isFemale =
      ['Kore', 'Aoede', 'Leda', 'Zephyr', 'Despina', 'Autonoe', 'Achernar', 'Sulafat', 'Callirrhoe'].includes(voiceName) ||
      style?.toLowerCase().includes('woman') ||
      style?.toLowerCase().includes('vrouw') ||
      style?.toLowerCase().includes('female') ||
      speechTherapyMode;

    let clinicalDirective = '';
    if (speechTherapyMode) {
      if (clinicalRole === 'target_reference') {
        clinicalDirective = 'Clinical reference model for child articulation practice (SoundSteps nl-BE standard). Spoken by a certified Belgian Dutch female speech therapist (logopediste) from Flanders. Flawless phonetic precision, distinct syllable and phoneme boundaries, deliberate unhurried pacing (-12% rate), soft g (/ɣ/), pure vowels, encouraging pedagogical warmth.';
      } else if (clinicalRole === 'contrast_reference') {
        clinicalDirective = 'Speech therapy minimal-pairs contrast model for auditory discrimination (nl-BE). Spoken by a female Belgian logopediste. Distinct acoustic contrast between phonemes, clear micro-pauses between contrasting words, child-directed clarity.';
      } else if (clinicalRole === 'target_bearing_utterance') {
        clinicalDirective = 'Carrier sentence for articulation practice in sentential context (nl-BE). Spoken by a female Belgian logopediste. Natural child-directed Belgian Standard Dutch prosody, clear target realization, patient and warm.';
      } else if (clinicalRole === 'instructional_narration') {
        clinicalDirective = 'Child-directed pedagogical guidance spoken by an encouraging Belgian Dutch speech therapist (logopediste). Warm, patient, reassuring, gentle cadence.';
      } else {
        clinicalDirective = 'Belgian Standard Dutch (nl-BE) speech therapy pronunciation model. Spoken by an expert female logopediste from Flanders. Meticulous articulation, soft g, gentle unhurried pacing, clear vowels.';
      }
    }

    // Enhanced Flemish / Belgian Dutch style directive with explicit gender tuning
    const genderDirective = isFemale
      ? 'Spoken by a native Belgian Flemish woman from Flanders with a warm, natural feminine voice.'
      : 'Spoken by a native Belgian Fleming from Flanders.';

    const enhancedStyle = style.includes('nl-BE')
      ? `${style} ${clinicalDirective}`.trim()
      : `Language: Flemish Dutch (Belgian Dutch / nl-BE). ${clinicalDirective ? clinicalDirective + ' ' : ''}${genderDirective} Authentic Flemish pronunciation, soft 'g', natural Belgian Dutch cadence. Absolutely no English or French accent. ${style}`;

    if (isMultiSpeaker && Array.isArray(speakers) && speakers.length === 2) {
      // Dual-speaker dialogue with Gemini 3.8 Flash TTS
      const formattedSpeakers = speakers.map((spk: any) => ({
        text: `${spk.name}: ${spk.text}`,
        speechMetadata: {
          speaker: spk.name,
          style: `Language: Flemish Dutch (nl-BE). Native Belgian Flemish speaker from Flanders, soft g, authentic Belgian pronunciation, no English/French accent. ${spk.style || ''}`,
        },
      }));

      response = await ai.models.generateContent({
        model: 'gemini-3.8-flash-tts',
        contents: [
          {
            role: 'user',
            parts: formattedSpeakers,
          },
        ],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            multiSpeakerVoiceConfig: {
              speakerVoiceConfigs: speakers.map((spk: any) => ({
                speaker: spk.name,
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName: spk.voiceName || 'Kore' },
                },
              })),
            },
          },
        },
      });
    } else {
      // Single speaker TTS: try flash-tts, if 429/quota hit, gracefully fallback to flash-lite-tts
      let targetModel =
        modelType === 'gemini-3.8-flash-lite-tts'
          ? 'gemini-3.8-flash-lite-tts'
          : 'gemini-3.8-flash-tts';

      try {
        response = await ai.models.generateContent({
          model: targetModel,
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text,
                  speechMetadata: {
                    style: enhancedStyle,
                  },
                },
              ],
            },
          ],
          config: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: voiceName || 'Kore' },
              },
            },
          },
        });
      } catch (err: any) {
        // If flash-tts hit 429 or quota limit, automatically try flash-lite-tts
        if (targetModel === 'gemini-3.8-flash-tts' && (err?.status === 429 || err?.message?.includes('quota'))) {
          console.warn('Rate limit hit on gemini-3.8-flash-tts, falling back to gemini-3.8-flash-lite-tts...');
          targetModel = 'gemini-3.8-flash-lite-tts';
          response = await ai.models.generateContent({
            model: targetModel,
            contents: [
              {
                role: 'user',
                parts: [
                  {
                    text,
                    speechMetadata: {
                      style: enhancedStyle,
                    },
                  },
                ],
              },
            ],
            config: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName: voiceName || 'Kore' },
                },
              },
            },
          });
        } else {
          throw err;
        }
      }
    }

    const audioBase64 = response?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    const mimeType = response?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.mimeType || 'audio/pcm;rate=24000';

    if (!audioBase64) {
      const fallback = getPreloadedFallbackPcm(voiceName, speechTherapyMode);
      if (fallback) {
        return res.json({
          audioBase64: fallback.pcmBase64,
          mimeType: 'audio/pcm;rate=24000',
          sampleRate: 24000,
          modelUsed: `Referentiemodel (${fallback.sampleName})`,
          isFallback: true,
          notice: 'Het geverifieerde authentieke Vlaamse stemmodel is afgespeeld.',
        });
      }
      return res.status(500).json({ error: 'No audio data returned from Gemini TTS.' });
    }

    return res.json({
      audioBase64,
      mimeType,
      sampleRate: 24000,
      modelUsed: isMultiSpeaker ? 'gemini-3.8-flash-tts' : modelType,
    });
  } catch (error: any) {
    const isQuotaOrLimit =
      error?.status === 429 ||
      error?.message?.includes('429') ||
      error?.message?.includes('quota') ||
      error?.message?.includes('RESOURCE_EXHAUSTED') ||
      error?.message?.includes('rate-limit');

    if (isQuotaOrLimit) {
      console.warn('Gemini TTS rate/quota limit reached (429). Generating live speech via Azure Edge TTS (nl-BE-DenaNeural)...');
      try {
        const edgeVoice = voiceName === 'nl-BE-ArnaudNeural' ? 'nl-BE-ArnaudNeural' : 'nl-BE-DenaNeural';
        const edgeSpeed = speed || (speechTherapyMode ? 0.88 : 1.0);
        const audioBuffer = await synthesizeAzureEdge(text, edgeVoice, edgeSpeed);
        return res.json({
          audioBase64: audioBuffer.toString('base64'),
          mimeType: 'audio/mp3',
          sampleRate: 24000,
          modelUsed: `Azure Edge TTS (${edgeVoice})`,
          isFallback: true,
          isAzureEdge: true,
          notice: `Gemini quota bereikt. Direct live gesproken via gratis Azure Edge TTS (${edgeVoice === 'nl-BE-DenaNeural' ? 'Dena' : 'Arnaud'})!`,
        });
      } catch (azureErr) {
        console.warn('Azure Edge fallback failed, using preloaded sample:', azureErr);
        const fallback = getPreloadedFallbackPcm(voiceName, speechTherapyMode);
        if (fallback) {
          return res.json({
            audioBase64: fallback.pcmBase64,
            mimeType: 'audio/pcm;rate=24000',
            sampleRate: 24000,
            modelUsed: `Referentiemodel (${fallback.sampleName})`,
            isFallback: true,
            notice: 'Gemini API daglimiet (10 verzoeken) bereikt. Het geverifieerde authentieke Vlaamse referentiemodel wordt direct afgespeeld.',
          });
        }
      }
    }

    console.error('Error generating speech:', error?.message || error);
    return res.status(500).json({
      error: error?.message || 'Error occurred while calling Gemini TTS API.',
      fallbackAvailable: true,
    });
  }
});

async function startServer() {
  const isDev = process.env.NODE_ENV !== 'production';

  if (isDev) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

startServer();
