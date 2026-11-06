import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error('No GEMINI_API_KEY found');
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey });

function pcmToWavBuffer(pcmBytes: Buffer, sampleRate = 24000, numChannels = 1, bitsPerSample = 16): Buffer {
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const header = Buffer.alloc(44);

  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcmBytes.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcmBytes.length, 40);

  return Buffer.concat([header, pcmBytes]);
}

const samples = [
  {
    id: 'vrt-standard',
    text: 'Goedenavond. Het Agentschap Wegen en Verkeer meldt dat de vernieuwingswerken aan de Ring rond Brussel vlot vooruitgaan. Vanaf volgende week maandag wordt er evenwel ernstige verkeershinder verwacht in beide richtingen.',
    style: 'Spoken in native Belgian Dutch (Vlaams / nl-BE). Clear, articulate Flemish VRT newscaster from Flanders with natural soft g, accurate Belgian Dutch prosody, no English or French accent.',
    voice: 'Kore',
  },
  {
    id: 'antwerps',
    text: 'Amai zeg, ge moet eens kijken naar de Scheldekaaien vandaag! Heel de stad is buiten en het zonnetje schijnt op het MAS. Wat een heerlijke sfeer hier in Antwerpen.',
    style: 'Spoken in native Flemish Dutch (nl-BE). Spirited Antwerp cadence, energetic, charismatic Belgian Dutch speaker with natural Flemish inflection and soft g.',
    voice: 'Puck',
  },
  {
    id: 'gents',
    text: 'Welkom aan de Graslei in Gent. Kijk eens hoe het water van de Leie glinstert tegen de middeleeuwse gevels van het Gravensteen. Hier ademt werkelijk elke steen geschiedenis.',
    style: 'Spoken in native Flemish Dutch (nl-BE). Warm, melodic Ghent intonation, gentle Belgian Dutch storytelling cadence, amiable and relaxed.',
    voice: 'Zephyr',
  },
  {
    id: 'west-vlaams',
    text: 'In het hart van het historische Brugge bereiden we onze ambachtelijke chocoladepralines volgens een aloud familierecept. De geur van verse cacao vult de hele straat.',
    style: 'Spoken in native Flemish Dutch (nl-BE). Warm West-Flemish melodic lilt, calm, welcoming storytelling tone with soft Flemish pronunciation.',
    voice: 'Charon',
  },
  {
    id: 'ronde',
    text: 'En daar gaat hij! Op de steile kasseien van de Oude Kwaremont demarreert de kopgroep! Wat een ongelooflijke versnelling! Het Vlaamse publiek langs het parcours gaat compleet uit zijn dak!',
    style: 'Spoken in native Belgian Dutch (nl-BE). Excited Flemish cycling commentator, passionate, rapid pace, breathy delivery during a live race.',
    voice: 'Puck',
  },
];

async function generateAll() {
  const outDir = path.resolve('public/samples');
  fs.mkdirSync(outDir, { recursive: true });

  for (const s of samples) {
    console.log(`Generating sample: ${s.id}...`);
    try {
      const res = await ai.models.generateContent({
        model: 'gemini-3.8-flash-lite-tts',
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: s.text,
                speechMetadata: {
                  style: s.style,
                },
              },
            ],
          },
        ],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: s.voice },
            },
          },
        },
      });

      const b64 = res.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (b64) {
        const rawBytes = Buffer.from(b64, 'base64');
        const wavBuffer = pcmToWavBuffer(rawBytes, 24000);
        const filePath = path.join(outDir, `${s.id}.wav`);
        fs.writeFileSync(filePath, wavBuffer);
        console.log(`Saved ${s.id}.wav (${wavBuffer.length} bytes)`);
      }
      // Brief sleep between calls to avoid any quota bursts
      await new Promise((r) => setTimeout(r, 1200));
    } catch (e: any) {
      console.error(`Failed ${s.id}:`, e.message);
    }
  }
}

generateAll();
