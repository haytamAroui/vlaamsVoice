/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  Mic,
  Volume2,
  Play,
  Pause,
  Download,
  Sparkles,
  Layers,
  BookOpen,
  Info,
  Check,
  Copy,
  RotateCcw,
  Sliders,
  Radio,
  FileText,
  Activity,
  User,
  Users,
  Compass,
  AlertCircle,
  ExternalLink,
  Stethoscope,
  Target,
  ShieldCheck,
  Heart,
} from 'lucide-react';
import { pcmToWavBlob, base64ToUint8Array, speakWithBrowserSynthesis } from './utils/audio';

function audioResponseToBlob(data: { audioBase64: string; mimeType?: string; sampleRate?: number }): Blob {
  const bytes = base64ToUint8Array(data.audioBase64);
  if (data.mimeType && (data.mimeType.includes('mp3') || data.mimeType.includes('mpeg'))) {
    return new Blob([bytes.buffer as ArrayBuffer], { type: 'audio/mp3' });
  }
  return pcmToWavBlob(bytes, data.sampleRate || 24000);
}

interface AudioHistoryItem {
  id: string;
  title: string;
  text: string;
  style: string;
  voice: string;
  model: string;
  url: string;
  blob: Blob;
  createdAt: string;
  isMultiSpeaker?: boolean;
}

interface RegionalProfile {
  id: string;
  name: string;
  region: string;
  tag: string;
  description: string;
  stylePrompt: string;
  sampleText: string;
  defaultVoice: string;
}

const REGIONAL_PROFILES: RegionalProfile[] = [
  {
    id: 'vrt-standard',
    name: 'VRT Nieuwsanker',
    region: 'Heel Vlaanderen (Algemeen Nederlands)',
    tag: 'Standaard Vlaams',
    description: 'Verzorgd, gezaghebbend en helder gearticuleerd Vlaams nieuwslezerstem met zachte "g" en natuurlijke cadans.',
    stylePrompt: 'Clear, authoritative, and articulate Belgian Dutch (Vlaams) newscaster. Soft g, accurate Flemish prosody, professional broadcast tone.',
    sampleText: 'Goedenavond. Het Agentschap Wegen en Verkeer meldt dat de vernieuwingswerken aan de Ring rond Brussel vlot vooruitgaan. Vanaf volgende week maandag wordt er evenwel ernstige verkeershinder verwacht.',
    defaultVoice: 'Kore',
  },
  {
    id: 'antwerps',
    name: 'Antwerpse Energie',
    region: 'Provincie Antwerpen',
    tag: 'Stedelijk & Dynamisch',
    description: 'Vlotte, levendige Antwerpse spreektrant met zelfverzekerde intonatie en een warm, direct karakter.',
    stylePrompt: 'Spirited and charismatic Belgian Dutch speaker with subtle Antwerp cadence, natural conversational rhythm, energetic and confident.',
    sampleText: 'Amai zeg, ge moet eens kijken naar de Scheldekaaien vandaag! Heel de stad is buiten en het zonnetje schijnt op het MAS. Wat een heerlijke sfeer in Antwerpen.',
    defaultVoice: 'Puck',
  },
  {
    id: 'gents',
    name: 'Gents & Oost-Vlaams',
    region: 'Gent & Oost-Vlaanderen',
    tag: 'Zangerig & Gemoedelijk',
    description: 'Melodieuze Gentse intonatie, zachtaardig en vertellend met authentieke Vlaamse gezelligheid.',
    stylePrompt: 'Warm, melodic Ghent intonation, friendly Belgian Dutch cadence, relaxed, amiable storytelling tone with soft articulation.',
    sampleText: 'Welkom aan de Graslei in Gent. Kijk eens hoe het water van de Leie glinstert tegen de middeleeuwse gevels van het Gravensteen. Hier ademt elke steen geschiedenis.',
    defaultVoice: 'Zephyr',
  },
  {
    id: 'west-vlaams',
    name: 'Brugs & West-Vlaams',
    region: 'Brugge & Kuststreek',
    tag: 'Nuchter & Hartelijk',
    description: 'Karaktervolle West-Vlaamse klankkleur, zacht klinkend met liefde voor streekverhalen en traditie.',
    stylePrompt: 'Hearty Belgian Dutch speaker with gentle West-Flemish melodic lilt, calm, welcoming storytelling tone.',
    sampleText: 'In het hart van het historische Brugge bereiden we onze ambachtelijke chocoladepralines volgens een aloud familierecept. |mhm| De geur van verse cacao vult de hele straat.',
    defaultVoice: 'Charon',
  },
  {
    id: 'brussels',
    name: 'Brusselse Zakelijke Presentator',
    region: 'Brussel & Rand',
    tag: 'Professioneel & Modern',
    description: 'Modern, tweetalig beïnvloed Belgisch Nederlands. Vriendelijk, zakelijk en diplomatisch.',
    stylePrompt: 'Polite and polished Belgian Dutch corporate speaker from Brussels, calm, international, articulate and engaging.',
    sampleText: 'Goedemorgen aan alle deelnemers. Vandaag lanceren we ons nieuwe technologische initiatief voor Vlaamse en Europese start-ups hier in het hart van Brussel.',
    defaultVoice: 'Fenrir',
  },
];

const PRESET_SCRIPTS = [
  {
    title: '🚴 De Ronde van Vlaanderen',
    category: 'Sportcommentaar',
    text: 'En daar gaat hij! Op de steile kasseien van de Oude Kwaremont demarreert de kopgroep! <gasp> Wat een ongelooflijke versnelling! Het Vlaamse publiek langs het parcours gaat compleet uit zijn dak!',
    style: 'Excited Belgian cycling commentator, passionate, rapid pace, breathy emotional delivery during a live race.',
    voice: 'Puck',
  },
  {
    title: '🍫 Belgische Chocolade & Pralines',
    category: 'Documentaire',
    text: 'België staat wereldwijd bekend om zijn verfijnde chocolatiers. Van het fijnste marsepein tot fluweelzachte ganache: |mhm| elke praline vertelt het verhaal van generaties meesterschap.',
    style: 'Warm, appreciative culinary narrator with soft Flemish Dutch intonation and relaxed, inviting pacing.',
    voice: 'Kore',
  },
  {
    title: '🌦️ KMI Weerbericht Vlaanderen',
    category: 'Weerbericht',
    text: 'Voor morgen voorspelt het KMI een typische wisselvallige herfstdag over Vlaanderen. In de ochtend hangen er hardnekkige nevelvelden, met later opklaringen langs de Belgische kuststreek.',
    style: 'Crisp, friendly Flemish weather presenter, articulate, calm and clear pronunciation.',
    voice: 'Zephyr',
  },
  {
    title: '☕ Gezellige Koffieklets',
    category: 'Conversatie',
    text: 'Amai zeg, het is toch al een hele tijd geleden dat we elkaar nog gezien hebben! <laugh> Hoe is het intussen met u en het gezin? Zullen we snel een koffie gaan drinken?',
    style: 'Cheerful, warm Flemish friend having a casual chat, natural conversational pauses and smiles in the voice.',
    voice: 'Kore',
  },
];

interface VoiceOption {
  name: string;
  desc: string;
  gender: 'female' | 'male';
  tag: string;
  sampleUrl?: string;
  sampleText?: string;
  sampleTitle?: string;
}

const PREBUILT_VOICES: VoiceOption[] = [
  // Inheemse Azure Edge TTS Stemmen (Free, Native Flanders Studio Voices)
  {
    name: 'nl-BE-DenaNeural',
    desc: 'Azure Inheemse Vlaamse Vrouw (Haarscherpe zachte g, zuivere monoftongen, studio opname - Gratis Edge TTS)',
    gender: 'female',
    tag: 'Azure Inheems nl-BE ⭐',
    sampleUrl: '/samples/vlaamse-vrouw-dena.mp3',
    sampleTitle: 'Azure Inheems Vlaams: DenaNeural',
    sampleText: 'Hallo, ik ben Dena. Ik ben een inheemse Vlaamse stem van Azure, perfect afgestemd op de Vlaamse uitspraakregels en logopedie.',
  },
  {
    name: 'nl-BE-ArnaudNeural',
    desc: 'Azure Inheemse Vlaamse Man (Natuurlijke Vlaamse intonatie, rustige articulatie - Gratis Edge TTS)',
    gender: 'male',
    tag: 'Azure Inheems nl-BE ⭐',
    sampleUrl: '/samples/vlaams-man-arnaud.mp3',
    sampleTitle: 'Azure Inheems Vlaams: ArnaudNeural',
    sampleText: 'Goedendag, ik ben Arnaud. Mijn stem is opgenomen in Vlaanderen en biedt een verzorgde, authentieke Belgisch-Nederlandse intonatie.',
  },

  // Gemini Vrouwenstemmen (Women's Voices)
  {
    name: 'Kore',
    desc: 'Helder, zelfverzekerd & professioneel (Ideaal voor VRT Nieuws, Zakelijk)',
    gender: 'female',
    tag: 'Nieuws & Formeel',
    sampleUrl: '/samples/vlaamse-vrouw-kore.wav',
    sampleTitle: 'Vlaamse Vrouwenstem: Kore (Nieuwsanker)',
    sampleText: 'Dag allemaal! Welkom bij onze Vlaamse uitzending. Ik ben uw vrouwelijke nieuwsstem voor vandaag.',
  },
  {
    name: 'Aoede',
    desc: 'Warm, vertellend, gemoedelijk & natuurlijk (Ideaal voor Podcasts & Verhalen)',
    gender: 'female',
    tag: 'Warm & Verhalend',
    sampleUrl: '/samples/vlaamse-vrouw-aoede.wav',
    sampleTitle: 'Vlaamse Vrouwenstem: Aoede (Podcast & Verhalen)',
    sampleText: 'Amai zeg, wat gezellig dat je luistert! Ik neem je vandaag mee op een heerlijke culinaire wandeling door Gent en Brugge.',
  },
  {
    name: 'Leda',
    desc: 'Jong, energiek, fris & expressief (Modern Vlaams & Conversatie)',
    gender: 'female',
    tag: 'Jong & Levendig',
    sampleUrl: '/samples/vlaamse-vrouw-leda.wav',
    sampleTitle: 'Vlaamse Vrouwenstem: Leda (Jonge Vriendin)',
    sampleText: 'Hey hallo! Ik ben een jonge Vlaamse stem uit Antwerpen. Super leuk dat je deze app uitprobeert!',
  },
  {
    name: 'Zephyr',
    desc: 'Rustgevend, kalm, zachtaardig & melodieus (Meditatie & Audioboeken)',
    gender: 'female',
    tag: 'Rustig & Zacht',
    sampleUrl: '/samples/gents.wav',
    sampleTitle: 'Vlaamse Vrouwenstem: Zephyr (Rustgevend)',
    sampleText: 'Welkom aan de Graslei in Gent. Kijk eens hoe het water van de Leie rustig kabbelt tegen de middeleeuwse kade.',
  },
  {
    name: 'Despina',
    desc: 'Elegant, vriendelijk & vloeiend (Commercieel & Presentaties)',
    gender: 'female',
    tag: 'Elegant & Vloeiend',
    sampleTitle: 'Vlaamse Vrouwenstem: Despina (Elegant)',
    sampleText: 'Goedemorgen! Welkom bij onze presentatie over innovatieve technologie in Vlaanderen.',
  },
  {
    name: 'Autonoe',
    desc: 'Opgewekt, spontaan & open (Vriendelijk & Positief)',
    gender: 'female',
    tag: 'Opgewekt & Spontaan',
    sampleTitle: 'Vlaamse Vrouwenstem: Autonoe (Opgewekt)',
    sampleText: 'Wat een prachtige dag vandaag! Laten we er samen een fantastische ervaring van maken.',
  },

  // Mannenstemmen (Men's Voices)
  {
    name: 'Puck',
    desc: 'Levendig, dynamisch & expressief (Sport & Enthousiast)',
    gender: 'male',
    tag: 'Levendig & Jeugdig',
    sampleUrl: '/samples/antwerps.wav',
    sampleTitle: 'Vlaamse Mannenstem: Puck',
  },
  {
    name: 'Charon',
    desc: 'Diep, warm, ervaren & narratief (Documentaires & Traditie)',
    gender: 'male',
    tag: 'Rijp & Warm',
    sampleUrl: '/samples/west-vlaams.wav',
    sampleTitle: 'Vlaamse Mannenstem: Charon',
  },
  {
    name: 'Fenrir',
    desc: 'Gezaghebbend, krachtig & zakelijk',
    gender: 'male',
    tag: 'Diep & Zakelijk',
    sampleTitle: 'Vlaamse Mannenstem: Fenrir',
  },
];

interface LogopedicExercise {
  id: string;
  title: string;
  category: string;
  phoneme: string;
  clinicalRole: 'target_reference' | 'contrast_reference' | 'target_bearing_utterance' | 'instructional_narration';
  targetAudience: string;
  pacingLabel: string;
  speed: number;
  text: string;
  phoneticNotes: string;
  sampleUrl?: string;
}

const LOGOPEDIC_EXERCISES: LogopedicExercise[] = [
  {
    id: 'target-bl-clusters',
    title: '🌸 Woordbegin Clusters (/bl-/)',
    category: 'Doelmodel (Target Reference)',
    phoneme: '/bl-/',
    clinicalRole: 'target_reference',
    targetAudience: 'Klankclusteropbouw bij kleuters',
    pacingLabel: 'Therapeutisch (-15%)',
    speed: 0.85,
    text: 'Dag topper! Luister heel goed hoe ik het zeg: Bloem... boom... blaadje. En nu mag jij het eens rustig proberen.',
    phoneticNotes: 'Zachte aanzet van labiale plosief /b/ gevolgd door zuivere lateraal /l/. Geen epenthese.',
    sampleUrl: '/samples/logopedie-clusters.mp3',
  },
  {
    id: 'contrast-k-t-fronting',
    title: '⚖️ Klankcontrast /k/ ↔ /t/ (Fronting Contrast)',
    category: 'Minimale Paren (Contrast Reference)',
    phoneme: '/k/ vs /t/',
    clinicalRole: 'contrast_reference',
    targetAudience: 'Vervanging van velair door dentaal',
    pacingLabel: 'Zorgvuldig (-12%)',
    speed: 0.88,
    text: 'Kip... tip. Koe... toe. Kam... tam. Hoor je het verschil achteraan in de keel en vooraan bij de tanden?',
    phoneticNotes: 'Akoestisch contrast tussen velare plosief [k] en alveolaire plosief [t] met hoorbare rustpauze.',
    sampleUrl: '/samples/logopedie-minimal-pairs.mp3',
  },
  {
    id: 'target-s-z-sigmatism',
    title: '🐍 Klank /s/ & /z/ (Sigmatisme / Slissen)',
    category: 'Zinscontext (Target Bearing Utterance)',
    phoneme: '/s/ en /z/',
    clinicalRole: 'target_bearing_utterance',
    targetAudience: 'Alveolaire articulatie zonder lispelen',
    pacingLabel: 'Zorgvuldig (-10%)',
    speed: 0.9,
    text: 'Sterre ziet zeven schone zwanen zwemmen in de brede beek.',
    phoneticNotes: 'Scherpe, niet-interdentale sibilanten met heldere stemhebbende /z/ en stemloze /s/.',
    sampleUrl: '/samples/logopedie-slissen.mp3',
  },
  {
    id: 'target-soft-g-flemish',
    title: '🌱 Zachte Vlaamse /ɣ/ en /x/ (Geen harde Hollandse g)',
    category: 'Belgisch Standaardnederlands (nl-BE)',
    phoneme: '/ɣ/ vs /x/',
    clinicalRole: 'target_reference',
    targetAudience: 'Vlaamse uitspraaknormering (nl-BE)',
    pacingLabel: 'Zorgvuldig (-8%)',
    speed: 0.92,
    text: 'Grote gele graankorrels liggen in de groene goot naast het gras.',
    phoneticNotes: 'Stemhebbende velare fricatief [ɣ] zonder uvulaire schraapklank.',
    sampleUrl: '/samples/logopedie-zachte-g.mp3',
  },
  {
    id: 'target-bilabial-w',
    title: '💧 Bilabiale W ([β̞] zonder tandcontact)',
    category: 'Consonantarticulatie (nl-BE)',
    phoneme: '[β̞]',
    clinicalRole: 'target_bearing_utterance',
    targetAudience: 'Vlaamse liparticulatie zonder labiodentaal tandcontact',
    pacingLabel: 'Zorgvuldig (-10%)',
    speed: 0.9,
    text: 'Waar waait de warme wind over het wijde water?',
    phoneticNotes: 'Beide lippen komen zacht samen ([β̞]) zonder dat de boventanden de onderlip raken.',
    sampleUrl: '/samples/logopedie-bilabiale-w.mp3',
  },
  {
    id: 'target-monophthongs',
    title: '⛵ Zuivere Monoftongen /eː/ & /oː/ (Geen diftongering)',
    category: 'Vocaalzuiverheid (nl-BE)',
    phoneme: '[eː] en [oː]',
    clinicalRole: 'target_reference',
    targetAudience: 'Vaste kaak- en tongstand zonder noordelijk glij-effect [eɪ]/[oʊ]',
    pacingLabel: 'Therapeutisch (-15%)',
    speed: 0.85,
    text: 'De grote gele boot vaart over de schone zee.',
    phoneticNotes: 'Vaste formanten zonder opwaartse glijbeweging van de kaak; zuivere monoftongische duurklinkers.',
    sampleUrl: '/samples/logopedie-monoftongen.mp3',
  },
  {
    id: 'target-diphthongs-vlaams',
    title: '🏡 Vlaamse Tweeklanken (/ɛi/, /œy/, /ɑu/)',
    category: 'Vocaalkwaliteit & Diftongen',
    phoneme: '/œy/, /ɛi/, /ɑu/',
    clinicalRole: 'target_bearing_utterance',
    targetAudience: 'Zuivere tweeklankvorming zonder noordelijke diftongering',
    pacingLabel: 'Therapeutisch (-15%)',
    speed: 0.85,
    text: 'Het kleine muisje bouwt een nieuw huisje bij de oude eik.',
    phoneticNotes: 'Vlaamse realisatie van [œy] en [ɛi] met evenwichtige labialisatie.',
    sampleUrl: '/samples/logopedie-tweeklanken.mp3',
  },
  {
    id: 'target-r-rhotic',
    title: '🚜 Klank /r/ (Rotacisme / Tongpunt-r)',
    category: 'Tongmotoriek & Klankontwikkeling',
    phoneme: '/r/',
    clinicalRole: 'target_bearing_utterance',
    targetAudience: 'Tongpunt-r of zachte Belgische huig-r',
    pacingLabel: 'Zorgvuldig (-10%)',
    speed: 0.9,
    text: 'De rode tractor rijdt rond de ronde boerderij van boer Robbe.',
    phoneticNotes: 'Nauwkeurige tongpuntvibratie [r] of zachte uvulaire approximant [ʁ].',
    sampleUrl: '/samples/logopedie-rotacisme.mp3',
  },
  {
    id: 'instructional-pedagogy',
    title: '🌟 Pedagogische Begeleiding (Kindgericht)',
    category: 'Instructie (Instructional Narration)',
    phoneme: 'Pedagogisch',
    clinicalRole: 'instructional_narration',
    targetAudience: 'Positieve bekrachtiging & modelimitatie',
    pacingLabel: 'Natuurlijk Zacht (-8%)',
    speed: 0.92,
    text: 'Super flink geprobeerd! Adem nu even rustig in, kijk goed naar mijn mond, en doe me maar na.',
    phoneticNotes: 'Warme, geruststellende kindgerichte toonhoogte met motiverende melodie.',
    sampleUrl: '/samples/logopedie-pedagogisch.mp3',
  },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<'speech_therapy' | 'studio' | 'dialogue' | 'dialects' | 'docs'>('speech_therapy');

  // Speech Therapy / Logopedie State (SoundSteps nl-BE)
  const [therapyClinicalRole, setTherapyClinicalRole] = useState<
    'target_reference' | 'contrast_reference' | 'target_bearing_utterance' | 'instructional_narration'
  >('target_reference');
  const [therapyPacing, setTherapyPacing] = useState<'-15%' | '-12%' | '-8%' | '0%'>('-15%');
  const [therapyText, setTherapyText] = useState(LOGOPEDIC_EXERCISES[0].text);
  const [therapyVoice, setTherapyVoice] = useState('nl-BE-DenaNeural');
  const [selectedExerciseId, setSelectedExerciseId] = useState(LOGOPEDIC_EXERCISES[0].id);

  // Voice Gender Filter: default to female / women
  const [genderFilter, setGenderFilter] = useState<'female' | 'male' | 'all'>('female');

  // Single Speaker State - default to Azure Dena (Flemish female voice)
  const [inputText, setInputText] = useState(
    'Dag allemaal! Welkom bij onze Vlaamse spraakstudio. Ik ben Dena, uw inheemse Vlaamse stem uit Vlaanderen.'
  );
  const [voiceStyle, setVoiceStyle] = useState(
    'Language: Flemish Dutch (nl-BE). Spoken by a native Belgian Flemish woman from Flanders. Clear, articulate feminine voice, soft g, natural Belgian prosody, no English or French accent.'
  );
  const [selectedVoice, setSelectedVoice] = useState('nl-BE-DenaNeural');
  const [selectedModel, setSelectedModel] = useState<'gemini-3.8-flash-tts' | 'gemini-3.8-flash-lite-tts' | 'azure-edge-tts'>('azure-edge-tts');
  const [activeProfileId, setActiveProfileId] = useState('vrt-standard');

  // Dialogue / Multi-Speaker State
  const [speaker1Text, setSpeaker1Text] = useState(
    'Dag Laura! Welkom bij de podcast. Vertel eens, hoe klinkt deze nieuwe Vlaamse vrouwenstem voor jou?'
  );
  const [speaker1Voice, setSpeaker1Voice] = useState('Aoede');
  const [speaker1Style, setSpeaker1Style] = useState(
    'Language: Flemish Dutch (nl-BE). Warm, friendly Flemish woman, natural conversational feminine tone.'
  );

  const [speaker2Text, setSpeaker2Text] = useState(
    '|Ja| geweldig! <laugh> Het klinkt echt heel natuurlijk en vrouwelijk, met de perfecte zachte g en Vlaamse intonatie.'
  );
  const [speaker2Voice, setSpeaker2Voice] = useState('Kore');
  const [speaker2Style, setSpeaker2Style] = useState(
    'Language: Flemish Dutch (nl-BE). Articulate Flemish woman from Antwerp, bright, natural Belgian Dutch intonation.'
  );

  // Playback & Processing State - Pre-load authentic Gemini Flemish speech therapist sample
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentAudioUrl, setCurrentAudioUrl] = useState<string | null>('/samples/logopediste-nl-be.wav');
  const [currentAudioTitle, setCurrentAudioTitle] = useState('Vlaamse Logopediste (SoundSteps nl-BE Klankmodel)');
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(0.85);
  const [audioProgress, setAudioProgress] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [audioHistory, setAudioHistory] = useState<AudioHistoryItem[]>([
    {
      id: 'init-therapy',
      title: 'Vlaamse Logopediste (SoundSteps nl-BE)',
      text: 'Dag topper! Luister heel goed hoe ik het zeg: Bloem... boom... blaadje. En nu mag jij het eens rustig proberen.',
      style: 'Expert licensed Belgian Dutch speech therapist (logopediste), child-directed careful articulation.',
      voice: 'Aoede (Logopediste)',
      model: 'gemini-3.8-flash-lite-tts',
      url: '/samples/logopediste-nl-be.wav',
      blob: new Blob([], { type: 'audio/wav' }),
      createdAt: 'Nu beschikbaar',
    },
    {
      id: 'init-female-kore',
      title: 'Vlaamse Vrouwenstem: Kore (Nieuwsanker)',
      text: 'Dag allemaal! Welkom bij onze Vlaamse uitzending. Ik ben uw vrouwelijke nieuwsstem voor vandaag.',
      style: 'Native Belgian Flemish woman, clear articulate VRT news style.',
      voice: 'Kore (Vrouw)',
      model: 'gemini-3.8-flash-tts',
      url: '/samples/vlaamse-vrouw-kore.wav',
      blob: new Blob([], { type: 'audio/wav' }),
      createdAt: 'Nu beschikbaar',
    },
    {
      id: 'init-female-aoede',
      title: 'Vlaamse Vrouwenstem: Aoede (Podcast & Verhalen)',
      text: 'Amai zeg, wat gezellig dat je luistert! Ik neem je vandaag mee op een heerlijke culinaire wandeling door Gent en Brugge.',
      style: 'Warm, friendly Flemish woman, relaxed storytelling tone.',
      voice: 'Aoede (Vrouw)',
      model: 'gemini-3.8-flash-tts',
      url: '/samples/vlaamse-vrouw-aoede.wav',
      blob: new Blob([], { type: 'audio/wav' }),
      createdAt: 'Nu beschikbaar',
    },
    {
      id: 'init-female-leda',
      title: 'Vlaamse Vrouwenstem: Leda (Jonge Vriendin)',
      text: 'Hey hallo! Ik ben een jonge Vlaamse stem uit Antwerpen. Super leuk dat je deze app uitprobeert!',
      style: 'Young Flemish woman from Antwerp, energetic & modern.',
      voice: 'Leda (Vrouw)',
      model: 'gemini-3.8-flash-tts',
      url: '/samples/vlaamse-vrouw-leda.wav',
      blob: new Blob([], { type: 'audio/wav' }),
      createdAt: 'Nu beschikbaar',
    },
  ]);
  const [serverStatus, setServerStatus] = useState<{ hasApiKey: boolean; checked: boolean }>({
    hasApiKey: false,
    checked: false,
  });
  const [notification, setNotification] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Check backend Gemini API key status on mount
  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json())
      .then((data) => {
        setServerStatus({ hasApiKey: !!data.hasApiKey, checked: true });
      })
      .catch(() => {
        setServerStatus({ hasApiKey: false, checked: true });
      });
  }, []);

  // Audio visualizer loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let phase = 0;

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const width = canvas.width;
      const height = canvas.height;
      const bars = 48;
      const barWidth = width / bars - 2;

      for (let i = 0; i < bars; i++) {
        let barHeight = 6;
        if (isPlaying) {
          const wave = Math.sin(phase + i * 0.28) * 0.5 + 0.5;
          const noise = Math.sin(phase * 1.5 + i * 0.45) * 0.3;
          barHeight = Math.max(6, (wave + noise) * (height * 0.85));
        }

        const x = i * (barWidth + 2);
        const y = (height - barHeight) / 2;

        const gradient = ctx.createLinearGradient(0, y, 0, y + barHeight);
        gradient.addColorStop(0, '#f59e0b');
        gradient.addColorStop(0.5, '#ef4444');
        gradient.addColorStop(1, '#6366f1');

        ctx.fillStyle = isPlaying ? gradient : '#334155';
        ctx.fillRect(x, y, barWidth, barHeight);
      }

      if (isPlaying) {
        phase += 0.12;
      }
      animFrameRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isPlaying]);

  const showToast = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3500);
  };

  const handleSelectFemaleVoice = (v: VoiceOption) => {
    setSelectedVoice(v.name);
    setGenderFilter('female');
    setVoiceStyle(
      `Language: Flemish Dutch (nl-BE). Spoken by a native Belgian Flemish woman from Flanders. Clear, natural feminine voice, warm tone, soft 'g', authentic Belgian cadence.`
    );
    if (v.sampleText) {
      setInputText(v.sampleText);
    }
    if (v.sampleUrl) {
      setCurrentAudioUrl(v.sampleUrl);
      setCurrentAudioTitle(v.sampleTitle || `${v.name} (Vlaamse Vrouwenstem)`);
      setIsPlaying(true);
    }
    showToast(`Vrouwenstem ${v.name} geselecteerd en klaargezet!`);
  };

  const handleSelectTherapyExercise = (ex: LogopedicExercise) => {
    setSelectedExerciseId(ex.id);
    setTherapyText(ex.text);
    setTherapyClinicalRole(ex.clinicalRole);
    setTherapyPacing(
      ex.pacingLabel.includes('-15%')
        ? '-15%'
        : ex.pacingLabel.includes('-12%')
        ? '-12%'
        : ex.pacingLabel.includes('-8%')
        ? '-8%'
        : '0%'
    );
    setPlaybackSpeed(ex.speed);
    if (audioRef.current) {
      audioRef.current.playbackRate = ex.speed;
    }
    if (ex.sampleUrl) {
      setCurrentAudioUrl(ex.sampleUrl);
      setCurrentAudioTitle(`${ex.title} (Vlaamse Logopediste nl-BE)`);
      setIsPlaying(true);
    }
    showToast(`Logopedische oefening geladen: ${ex.title}`);
  };

  const generateTherapySpeech = async () => {
    if (!therapyText.trim()) return;
    setIsGenerating(true);

    try {
      const response = await fetch('/api/tts/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: therapyText,
          voiceName: therapyVoice,
          modelType: therapyVoice.startsWith('nl-BE-') ? 'azure-edge-tts' : 'gemini-3.8-flash-lite-tts',
          speechTherapyMode: true,
          clinicalRole: therapyClinicalRole,
        }),
      });

      const data = await response.json();

      if (response.ok && data.audioBase64) {
        const audioBlob = audioResponseToBlob(data);
        const audioUrl = URL.createObjectURL(audioBlob);

        setCurrentAudioUrl(audioUrl);
        const displayVoice = therapyVoice === 'nl-BE-DenaNeural' ? 'Azure Dena (nl-BE)' : therapyVoice === 'nl-BE-ArnaudNeural' ? 'Azure Arnaud (nl-BE)' : therapyVoice;
        setCurrentAudioTitle(`Logopedisch Model (${displayVoice} • ${therapyClinicalRole})`);
        setIsPlaying(true);

        const newItem: AudioHistoryItem = {
          id: Date.now().toString(),
          title: `Logopedie: ${therapyText.slice(0, 28)}...`,
          text: therapyText,
          style: `Speech Therapy (${therapyClinicalRole})`,
          voice: `${displayVoice} (Logopediste)`,
          model: data.modelUsed || (therapyVoice.startsWith('nl-BE-') ? 'azure-edge-tts' : 'gemini-3.8-flash-lite-tts'),
          url: audioUrl,
          blob: audioBlob,
          createdAt: new Date().toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' }),
        };

        setAudioHistory((prev) => [newItem, ...prev]);
        if (data.isFallback) {
          showToast(data.notice || 'Gemini limiet bereikt: authentiek referentiemodel afgespeeld.');
        } else {
          showToast('Nieuw logopedisch spraakmodel gegenereerd!');
        }
      } else {
        setCurrentAudioUrl('/samples/logopediste-nl-be.wav');
        setCurrentAudioTitle('Vlaamse Logopediste Referentie (SoundSteps nl-BE)');
        setIsPlaying(true);
        showToast('Logopedisch referentiemodel wordt afgespeeld.');
      }
    } catch (err: any) {
      console.warn('Generation error, playing authentic reference model:', err);
      setCurrentAudioUrl('/samples/logopediste-nl-be.wav');
      setCurrentAudioTitle('Vlaamse Logopediste Referentie (SoundSteps nl-BE)');
      setIsPlaying(true);
      showToast('Logopedisch referentiemodel wordt afgespeeld.');
    } finally {
      setIsGenerating(false);
    }
  };

  const filteredVoices = PREBUILT_VOICES.filter((v) => {
    if (genderFilter === 'female') return v.gender === 'female';
    if (genderFilter === 'male') return v.gender === 'male';
    return true;
  });

  const handleProfileSelect = (p: RegionalProfile) => {
    setActiveProfileId(p.id);
    setInputText(p.sampleText);
    setVoiceStyle(p.stylePrompt);
    setSelectedVoice(p.defaultVoice);
    setCurrentAudioUrl(`/samples/${p.id}.wav`);
    setCurrentAudioTitle(`${p.name} (Gemini 3.8 Flash)`);
    showToast(`Profiel & authentieke Gemini audio geladen: ${p.name}`);
  };

  const handlePresetSelect = (preset: typeof PRESET_SCRIPTS[0]) => {
    setInputText(preset.text);
    setVoiceStyle(preset.style);
    setSelectedVoice(preset.voice);
    if (preset.title.includes('Ronde')) {
      setCurrentAudioUrl('/samples/ronde.wav');
      setCurrentAudioTitle('De Ronde van Vlaanderen (Gemini 3.8 Flash)');
    } else if (preset.title.includes('Chocolade')) {
      setCurrentAudioUrl('/samples/west-vlaams.wav');
      setCurrentAudioTitle('Belgische Chocolatiers (Gemini 3.8 Flash)');
    } else if (preset.title.includes('Weerbericht')) {
      setCurrentAudioUrl('/samples/vrt-standard.wav');
      setCurrentAudioTitle('KMI Weerbericht (Gemini 3.8 Flash)');
    } else {
      setCurrentAudioUrl('/samples/antwerps.wav');
      setCurrentAudioTitle('Gezellige Vlaamse Conversatie (Gemini 3.8 Flash)');
    }
    showToast(`Fragment & Gemini audio ingeladen: ${preset.title}`);
  };

  const insertSpeechTag = (tag: string, target: 'single' | 'speaker1' | 'speaker2') => {
    if (target === 'single') {
      setInputText((prev) => prev + ' ' + tag + ' ');
    } else if (target === 'speaker1') {
      setSpeaker1Text((prev) => prev + ' ' + tag + ' ');
    } else {
      setSpeaker2Text((prev) => prev + ' ' + tag + ' ');
    }
  };

  // Generate Single Speaker Speech
  const generateSpeech = async () => {
    if (!inputText.trim()) return;
    setIsGenerating(true);

    try {
      const response = await fetch('/api/tts/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: inputText,
          style: voiceStyle,
          voiceName: selectedVoice,
          modelType: selectedModel,
          isMultiSpeaker: false,
        }),
      });

      const data = await response.json();

      if (response.ok && data.audioBase64) {
        const audioBlob = audioResponseToBlob(data);
        const audioUrl = URL.createObjectURL(audioBlob);

        setCurrentAudioUrl(audioUrl);
        const displayVoice = selectedVoice === 'nl-BE-DenaNeural' ? 'Azure Dena' : selectedVoice === 'nl-BE-ArnaudNeural' ? 'Azure Arnaud' : selectedVoice;
        setCurrentAudioTitle(`Nieuwe Opname (${displayVoice} • ${data.modelUsed || selectedModel})`);
        setIsPlaying(true);

        const newItem: AudioHistoryItem = {
          id: Date.now().toString(),
          title: inputText.slice(0, 32) + (inputText.length > 32 ? '...' : ''),
          text: inputText,
          style: voiceStyle,
          voice: displayVoice,
          model: data.modelUsed || selectedModel,
          url: audioUrl,
          blob: audioBlob,
          createdAt: new Date().toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' }),
        };

        setAudioHistory((prev) => [newItem, ...prev]);
        if (data.isFallback) {
          showToast(data.notice || 'Gemini limiet bereikt: authentiek Vlaams referentiemodel geladen.');
        } else {
          showToast('Spraak succesvol gegenereerd met Gemini 3.8 Flash TTS!');
        }
      } else {
        const synth = speakWithBrowserSynthesis(inputText, {
          rate: 0.95,
          onEnd: () => setIsPlaying(false),
          onError: () => setIsPlaying(false),
        });
        if (synth.success) {
          showToast(`Browser spraak actief (${synth.voiceName})`);
          setIsPlaying(true);
        } else {
          setCurrentAudioUrl('/samples/vlaamse-vrouw-kore.wav');
          setCurrentAudioTitle(`Vlaams Referentiemodel (${selectedVoice})`);
          setIsPlaying(true);
          showToast('Authentiek Vlaams referentiemodel wordt afgespeeld.');
        }
      }
    } catch (err: any) {
      console.warn('Network or generation error, serving preloaded reference model:', err);
      setCurrentAudioUrl('/samples/vlaamse-vrouw-kore.wav');
      setCurrentAudioTitle(`Vlaams Referentiemodel (${selectedVoice})`);
      setIsPlaying(true);
      showToast('Authentiek Vlaams referentiemodel wordt afgespeeld.');
    } finally {
      setIsGenerating(false);
    }
  };

  // Generate Dual-Speaker Screenplay Dialogue
  const generateDialogue = async () => {
    if (!speaker1Text.trim() || !speaker2Text.trim()) return;
    setIsGenerating(true);

    try {
      const response = await fetch('/api/tts/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isMultiSpeaker: true,
          text: `${speaker1Text}\n${speaker2Text}`,
          modelType: 'gemini-3.8-flash-tts',
          speakers: [
            {
              name: 'Lukas',
              text: speaker1Text,
              voiceName: speaker1Voice,
              style: speaker1Style,
            },
            {
              name: 'Laura',
              text: speaker2Text,
              voiceName: speaker2Voice,
              style: speaker2Style,
            },
          ],
        }),
      });

      const data = await response.json();

      if (response.ok && data.audioBase64) {
        const audioBlob = audioResponseToBlob(data);
        const audioUrl = URL.createObjectURL(audioBlob);

        setCurrentAudioUrl(audioUrl);
        setIsPlaying(true);

        const newItem: AudioHistoryItem = {
          id: Date.now().toString(),
          title: `Dialoog: Lukas & Laura`,
          text: `Lukas: ${speaker1Text}\nLaura: ${speaker2Text}`,
          style: 'Dual-Speaker Flemish Screenplay',
          voice: `${speaker1Voice} + ${speaker2Voice}`,
          model: data.modelUsed || 'gemini-3.8-flash-tts',
          url: audioUrl,
          blob: audioBlob,
          createdAt: new Date().toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' }),
          isMultiSpeaker: true,
        };

        setAudioHistory((prev) => [newItem, ...prev]);
        if (data.isFallback) {
          showToast(data.notice || 'Gemini limiet bereikt: dialoog referentiemodel geladen.');
        } else {
          showToast('Tweespreker dialoog succesvol gegenereerd!');
        }
      } else {
        showToast('Dialoog afspelen via spraaksynthese...');
        // Sequence playback of both speakers
        speakWithBrowserSynthesis(`Lukas zegt: ${speaker1Text}`, {
          pitch: 1.1,
          rate: 1.0,
          onEnd: () => {
            setTimeout(() => {
              speakWithBrowserSynthesis(`Laura antwoordt: ${speaker2Text}`, {
                pitch: 0.95,
                rate: 0.95,
                onEnd: () => setIsPlaying(false),
              });
            }, 300);
          },
        });
        setIsPlaying(true);
      }
    } catch (err) {
      showToast('Browser spraaksynthese gestart voor dialoog.');
      speakWithBrowserSynthesis(speaker1Text + ' ' + speaker2Text, {
        onEnd: () => setIsPlaying(false),
      });
      setIsPlaying(true);
    } finally {
      setIsGenerating(false);
    }
  };

  const togglePlayPause = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
      } else {
        audioRef.current.play().then(() => {
          setIsPlaying(true);
        }).catch((e) => {
          console.error('Audio play error:', e);
          setIsPlaying(false);
        });
      }
    }
  };

  const handleAudioTimeUpdate = () => {
    if (audioRef.current) {
      setAudioProgress(audioRef.current.currentTime);
      setAudioDuration(audioRef.current.duration || 0);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = val;
      setAudioProgress(val);
    }
  };

  const changeSpeed = (speed: number) => {
    setPlaybackSpeed(speed);
    if (audioRef.current) {
      audioRef.current.playbackRate = speed;
    }
  };

  const downloadWav = (blob: Blob, filename = 'vlaams-spraak.wav') => {
    const isMp3 = blob.type.includes('mp3') || blob.type.includes('mpeg');
    const ext = isMp3 ? '.mp3' : '.wav';
    const actualFilename = filename.replace(/\.(wav|mp3)$/, '') + ext;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = actualFilename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(`${isMp3 ? 'MP3' : 'WAV'} audiobestand gedownload!`);
  };

  const formatTime = (seconds: number) => {
    if (isNaN(seconds) || seconds < 0) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Toast Notification */}
      {notification && (
        <div className="fixed bottom-6 right-6 z-50 bg-amber-500 text-slate-950 px-4 py-2.5 rounded-lg shadow-xl font-medium text-sm flex items-center gap-2 border border-amber-300 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <Sparkles className="w-4 h-4" />
          <span>{notification}</span>
        </div>
      )}

      {/* Hidden audio element for WAV playback */}
      {currentAudioUrl && (
        <audio
          ref={audioRef}
          src={currentAudioUrl}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => {
            setIsPlaying(false);
            setAudioProgress(0);
          }}
          onTimeUpdate={handleAudioTimeUpdate}
          onLoadedMetadata={handleAudioTimeUpdate}
        />
      )}

      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/70 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 via-amber-600 to-red-600 flex items-center justify-center shadow-lg shadow-amber-500/20 text-slate-950 font-black text-xl">
              🦁
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-extrabold text-lg tracking-tight text-white">VlaamsVoice</h1>
                <span className="text-[11px] font-semibold bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded border border-amber-500/20">
                  Gemini 3.8 Flash TTS
                </span>
              </div>
              <p className="text-xs text-slate-400">Belgisch-Nederlandse (Vlaamse) Spraakstudio & Voice Design</p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs">
              <span
                className={`w-2 h-2 rounded-full ${
                  serverStatus.hasApiKey ? 'bg-emerald-400 shadow-sm shadow-emerald-400/50' : 'bg-amber-400'
                }`}
              />
              <span className="text-slate-300">
                {serverStatus.hasApiKey ? 'Gemini 3.8 Server Klaar' : 'Web Speech Mode (nl-BE)'}
              </span>
            </div>

            <button
              onClick={() => setActiveTab('docs')}
              className="text-xs flex items-center gap-1.5 text-slate-300 hover:text-amber-400 transition-colors px-2.5 py-1.5 rounded-lg hover:bg-slate-800/60"
            >
              <Info className="w-3.5 h-3.5" />
              <span>Heeft Gemini Vlaams?</span>
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex space-x-1 sm:space-x-3 border-t border-slate-800/60 overflow-x-auto py-1">
          <button
            onClick={() => setActiveTab('speech_therapy')}
            className={`px-3.5 py-2 text-xs sm:text-sm font-bold rounded-lg flex items-center gap-2 transition-all whitespace-nowrap ${
              activeTab === 'speech_therapy'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm shadow-emerald-500/10'
                : 'text-slate-300 hover:text-emerald-300 hover:bg-slate-800/50'
            }`}
          >
            <Stethoscope className="w-4 h-4 text-emerald-400" />
            <span>Spraaktherapie & Logopedie (nl-BE)</span>
            <span className="text-[9px] bg-emerald-500/30 text-emerald-200 px-1.5 py-0.5 rounded font-mono">
              SoundSteps
            </span>
          </button>

          <button
            onClick={() => setActiveTab('studio')}
            className={`px-3 py-2 text-xs sm:text-sm font-semibold rounded-lg flex items-center gap-2 transition-all whitespace-nowrap ${
              activeTab === 'studio'
                ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
          >
            <Mic className="w-4 h-4" />
            <span>Spraakstudio (Enkelspreker)</span>
          </button>

          <button
            onClick={() => setActiveTab('dialogue')}
            className={`px-3 py-2 text-xs sm:text-sm font-semibold rounded-lg flex items-center gap-2 transition-all whitespace-nowrap ${
              activeTab === 'dialogue'
                ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Tweespreker Dialoog & Scenario</span>
          </button>

          <button
            onClick={() => setActiveTab('dialects')}
            className={`px-3 py-2 text-xs sm:text-sm font-semibold rounded-lg flex items-center gap-2 transition-all whitespace-nowrap ${
              activeTab === 'dialects'
                ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
          >
            <Compass className="w-4 h-4" />
            <span>Vlaamse Dialecten & Accenten</span>
          </button>

          <button
            onClick={() => setActiveTab('docs')}
            className={`px-3 py-2 text-xs sm:text-sm font-semibold rounded-lg flex items-center gap-2 transition-all whitespace-nowrap ${
              activeTab === 'docs'
                ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span>Kennisbank: Gemini vs Chirp 3</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {/* TAB 0: SPEECH THERAPY / LOGOPEDIE (SOUNDSTEPS NL-BE) */}
        {activeTab === 'speech_therapy' && (
          <div className="space-y-6">
            {/* Clinical Authority Banner */}
            <div className="bg-gradient-to-r from-emerald-950/60 via-slate-900/80 to-blue-950/40 border border-emerald-500/30 rounded-2xl p-5 sm:p-6 shadow-xl relative overflow-hidden">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                      <Stethoscope className="w-5 h-5" />
                    </span>
                    <h2 className="text-lg sm:text-xl font-extrabold text-white tracking-tight">
                      Vlaamse Logopedie & Spraaktherapie (nl-BE)
                    </h2>
                    <span className="text-[10px] font-bold font-mono bg-emerald-500/20 text-emerald-300 px-2.5 py-0.5 rounded-full border border-emerald-500/30">
                      SoundSteps Authority
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-slate-300 max-w-3xl leading-relaxed">
                    Geauthenticeerde <strong className="text-emerald-300">Belgisch-Nederlandse vrouwenstem (nl-BE)</strong> voor kindgerichte klankimitatie en spraakontwikkeling. Meticuleuze articulatie met zachte 'g' (/ɣ/), zuivere diftongen en gecontroleerd therapeutisch tempo.
                  </p>
                </div>

                <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
                  <button
                    onClick={() => {
                      setCurrentAudioUrl('/samples/logopediste-nl-be.wav');
                      setCurrentAudioTitle('Vlaamse Logopediste: Bloem... boom... blaadje (nl-BE)');
                      setPlaybackSpeed(0.85);
                      if (audioRef.current) {
                        audioRef.current.playbackRate = 0.85;
                        audioRef.current.currentTime = 0;
                        audioRef.current.play().catch(() => {});
                      }
                      setIsPlaying(true);
                      showToast('Referentiemodel voor logopedie wordt afgespeeld (-15% tempo)');
                    }}
                    className="w-full sm:w-auto px-4 py-2.5 rounded-xl font-bold text-xs bg-emerald-500 hover:bg-emerald-400 text-slate-950 flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition-all active:scale-95"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    <span>▶ Beluister Referentie (Direct)</span>
                  </button>
                </div>
              </div>

              {/* SoundSteps Core Quality Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-4 pt-4 border-t border-slate-800/80 text-xs">
                <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80">
                  <span className="text-slate-400 block text-[10px] uppercase font-semibold">Doeltaal & Accent</span>
                  <span className="font-bold text-emerald-300">Standaard nl-BE (Vlaams)</span>
                </div>
                <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80">
                  <span className="text-slate-400 block text-[10px] uppercase font-semibold">Stemkarakter</span>
                  <span className="font-bold text-pink-300">Vrouwelijke Logopediste</span>
                </div>
                <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80">
                  <span className="text-slate-400 block text-[10px] uppercase font-semibold">Oefentempo</span>
                  <span className="font-bold text-amber-300">Therapeutisch (-15%)</span>
                </div>
                <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80">
                  <span className="text-slate-400 block text-[10px] uppercase font-semibold">Fonetische Norm</span>
                  <span className="font-bold text-blue-300">Zachte /ɣ/ & Vocaalzuiver</span>
                </div>
              </div>
            </div>

            {/* Main Interactive Studio Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left 7 cols: Clinical Target Selection & Text Studio */}
              <div className="lg:col-span-7 space-y-5">
                {/* Clinical Role Selector (SoundSteps Matrix) */}
                <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                      <Target className="w-3.5 h-3.5 text-emerald-400" />
                      <span>1. Kies Klinische Doelrol (Clinical Role)</span>
                    </label>
                    <span className="text-[10px] text-slate-400 font-mono">SoundSteps Classificatie</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {[
                      {
                        role: 'target_reference',
                        title: '🎯 Doelmodel (Target Reference)',
                        desc: 'Geïsoleerde klanken & modelwoorden voor directe kind-imitatie',
                      },
                      {
                        role: 'contrast_reference',
                        title: '⚖️ Klankcontrast (Minimale Paren)',
                        desc: 'Twee woorden die contrasteren op 1 klank (bijv. kip/tip)',
                      },
                      {
                        role: 'target_bearing_utterance',
                        title: '💬 Doeldragende Zin (Context)',
                        desc: 'Doelklank geoefend binnen een natuurlijke zinsstructuur',
                      },
                      {
                        role: 'instructional_narration',
                        title: '🌟 Pedagogische Begeleiding',
                        desc: 'Kindgerichte motivatie, zachte aanmoediging en instructie',
                      },
                    ].map((item) => (
                      <button
                        key={item.role}
                        type="button"
                        onClick={() => setTherapyClinicalRole(item.role as any)}
                        className={`text-left p-3 rounded-lg border text-xs transition-all ${
                          therapyClinicalRole === item.role
                            ? 'bg-emerald-500/20 border-emerald-500/60 text-white shadow-sm'
                            : 'bg-slate-950/60 border-slate-800/80 text-slate-300 hover:border-slate-700 hover:bg-slate-800/40'
                        }`}
                      >
                        <div className="font-bold text-slate-100">{item.title}</div>
                        <div className="text-[11px] text-slate-400 mt-1 leading-snug">{item.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Preconfigured Logopedic Exercises Library */}
                <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                      <BookOpen className="w-3.5 h-3.5 text-emerald-400" />
                      <span>2. Logopedische Oefenbibliotheek (Vlaamse Doelklanken)</span>
                    </label>
                    <span className="text-[10px] text-emerald-400">7 Doelmodules</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-72 overflow-y-auto pr-1">
                    {LOGOPEDIC_EXERCISES.map((ex) => (
                      <button
                        key={ex.id}
                        type="button"
                        onClick={() => handleSelectTherapyExercise(ex)}
                        className={`text-left p-2.5 rounded-lg border text-xs transition-all ${
                          selectedExerciseId === ex.id
                            ? 'bg-emerald-500/15 border-emerald-500/50 text-white shadow-sm ring-1 ring-emerald-500/30'
                            : 'bg-slate-950/50 border-slate-800/80 text-slate-300 hover:border-slate-700 hover:bg-slate-800/40'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-semibold text-slate-200 truncate">{ex.title}</span>
                          <span className="text-[9px] font-mono bg-slate-800 text-emerald-400 px-1.5 py-0.5 rounded shrink-0">
                            {ex.phoneme}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 line-clamp-1 italic">"{ex.text}"</p>
                        <div className="mt-1 flex items-center justify-between text-[10px] text-slate-500">
                          <span>{ex.targetAudience}</span>
                          <span className="text-amber-400 font-mono">{ex.pacingLabel}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Text & Articulation Studio Input */}
                <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                      <FileText className="w-4 h-4 text-emerald-400" />
                      <span>In te spreken logopedische tekst</span>
                    </label>
                    <span className="text-xs text-slate-400">{therapyText.length} tekens</span>
                  </div>

                  <textarea
                    rows={4}
                    value={therapyText}
                    onChange={(e) => setTherapyText(e.target.value)}
                    placeholder="Voer hier een logopedische zin of klankreeks in..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-slate-100 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 transition-colors resize-y font-medium"
                  />

                  {/* Speech rate / Pacing controls */}
                  <div className="pt-2 border-t border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <span className="text-xs font-medium text-slate-300 block mb-1">Spreektempo voor kind-imitatie:</span>
                      <div className="flex items-center gap-1.5">
                        {[
                          { label: 'Therapeutisch (-15%)', rate: '-15%', speed: 0.85 },
                          { label: 'Zorgvuldig (-12%)', rate: '-12%', speed: 0.88 },
                          { label: 'Rustig (-8%)', rate: '-8%', speed: 0.92 },
                          { label: 'Natuurlijk (0%)', rate: '0%', speed: 1.0 },
                        ].map((p) => (
                          <button
                            key={p.rate}
                            type="button"
                            onClick={() => {
                              setTherapyPacing(p.rate as any);
                              setPlaybackSpeed(p.speed);
                              if (audioRef.current) {
                                audioRef.current.playbackRate = p.speed;
                              }
                            }}
                            className={`text-[11px] px-2.5 py-1 rounded-md font-medium transition-colors ${
                              therapyPacing === p.rate
                                ? 'bg-emerald-500 text-slate-950 font-bold'
                                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                            }`}
                          >
                            {p.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <span className="text-xs font-medium text-slate-300 block mb-1">Logopedische Stem & Engine:</span>
                      <select
                        value={therapyVoice}
                        onChange={(e) => setTherapyVoice(e.target.value)}
                        className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-medium"
                      >
                        <option value="nl-BE-DenaNeural">⭐ Azure Dena (nl-BE Inheems • Gratis & Onbeperkt)</option>
                        <option value="nl-BE-ArnaudNeural">⭐ Azure Arnaud (nl-BE Inheemse Man • Gratis)</option>
                        <option value="Aoede">Gemini Aoede (Warm & Verhalend)</option>
                        <option value="Kore">Gemini Kore (Helder & Precies)</option>
                        <option value="Zephyr">Gemini Zephyr (Zachtaardig & Rustig)</option>
                      </select>
                    </div>
                  </div>

                  {/* Primary Action Button */}
                  <div className="pt-3">
                    <button
                      onClick={generateTherapySpeech}
                      disabled={isGenerating || !therapyText.trim()}
                      className="w-full py-3 px-4 rounded-xl font-bold text-sm bg-gradient-to-r from-emerald-500 via-teal-500 to-blue-600 hover:from-emerald-400 hover:to-blue-500 text-slate-950 shadow-lg shadow-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all active:scale-[0.99]"
                    >
                      {isGenerating ? (
                        <>
                          <Activity className="w-4 h-4 animate-spin text-slate-950" />
                          <span>Genereren met Logopedische Precisie...</span>
                        </>
                      ) : (
                        <>
                          <Volume2 className="w-5 h-5 text-slate-950" />
                          <span>Genereer Logopedisch Spraakmodel (nl-BE)</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* Right 5 cols: Clinical Notes & Audio Monitor */}
              <div className="lg:col-span-5 space-y-5">
                {/* Active Phonetic Guidance Card */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-emerald-400" />
                      <h3 className="font-bold text-sm text-white">Fonetische & Klinische Richtlijn</h3>
                    </div>
                    <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                      nl-BE Standaard
                    </span>
                  </div>

                  {/* Selected Exercise Phonetic Breakdown */}
                  {selectedExerciseId && (
                    <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-xs space-y-1.5">
                      <div className="font-semibold text-emerald-300">
                        {LOGOPEDIC_EXERCISES.find((e) => e.id === selectedExerciseId)?.title}
                      </div>
                      <p className="text-slate-300 text-[11px] leading-relaxed">
                        {LOGOPEDIC_EXERCISES.find((e) => e.id === selectedExerciseId)?.phoneticNotes}
                      </p>
                      <div className="pt-1 flex items-center gap-2 text-[10px] text-slate-400">
                        <span className="text-emerald-400 font-mono font-bold">
                          Doelrol: {therapyClinicalRole}
                        </span>
                        <span>•</span>
                        <span>Tempo: {therapyPacing}</span>
                      </div>
                    </div>
                  )}

                  {/* Interactive Clinical Audio Player Widget */}
                  <div className="bg-slate-950 p-4 rounded-xl border border-emerald-500/30 shadow-lg space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full ${isPlaying ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
                        <span className="text-xs font-bold text-white">Logopedische Audio Monitor</span>
                      </div>
                      <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                        {playbackSpeed}x Tempo
                      </span>
                    </div>

                    {/* Track Title */}
                    <div className="bg-slate-900/90 border border-slate-800 rounded-lg px-3 py-2 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2 truncate">
                        <Volume2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span className="font-semibold text-slate-200 truncate">{currentAudioTitle}</span>
                      </div>
                      <span className="text-[10px] font-mono text-emerald-300 font-bold shrink-0">nl-BE</span>
                    </div>

                    {/* Timeline Scrubber */}
                    <div className="space-y-1">
                      <input
                        type="range"
                        min={0}
                        max={audioDuration || 1}
                        step={0.05}
                        value={audioProgress}
                        onChange={handleSeek}
                        className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                      />
                      <div className="flex justify-between text-[11px] font-mono text-slate-400">
                        <span>{formatTime(audioProgress)}</span>
                        <span>{formatTime(audioDuration)}</span>
                      </div>
                    </div>

                    {/* Playback Action Buttons */}
                    <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={togglePlayPause}
                          className="w-10 h-10 rounded-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 flex items-center justify-center font-bold shadow-md transition-transform active:scale-95"
                          title={isPlaying ? 'Pauzeren' : 'Afspelen'}
                        >
                          {isPlaying ? (
                            <Pause className="w-4 h-4 fill-current" />
                          ) : (
                            <Play className="w-4 h-4 fill-current ml-0.5" />
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            if (audioRef.current) audioRef.current.currentTime = 0;
                            setAudioProgress(0);
                            if (audioRef.current) {
                              audioRef.current.play().catch(() => {});
                              setIsPlaying(true);
                            }
                          }}
                          className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
                          title="Herstarten"
                        >
                          <RotateCcw className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Speed selector */}
                      <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800">
                        {[
                          { label: '-15%', val: 0.85 },
                          { label: '-12%', val: 0.88 },
                          { label: '-8%', val: 0.92 },
                          { label: '1.0x', val: 1.0 },
                        ].map((sp) => (
                          <button
                            key={sp.val}
                            type="button"
                            onClick={() => changeSpeed(sp.val)}
                            className={`text-[10px] font-mono px-2 py-0.5 rounded transition-colors ${
                              playbackSpeed === sp.val
                                ? 'bg-emerald-500 text-slate-950 font-bold'
                                : 'text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            {sp.label}
                          </button>
                        ))}
                      </div>

                      {/* Download WAV */}
                      {audioHistory.length > 0 && (
                        <button
                          type="button"
                          onClick={() => downloadWav(audioHistory[0].blob, `logopedie-nl-be-${Date.now()}.wav`)}
                          className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-slate-850 hover:bg-slate-800 text-slate-200 border border-slate-700/80 transition-colors"
                          title="Download WAV bestand"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>WAV</span>
                        </button>
                      )}
                    </div>

                    {/* Pre-recorded reference trigger button */}
                    <div className="pt-2 border-t border-slate-800/60">
                      <button
                        type="button"
                        onClick={() => {
                          setCurrentAudioUrl('/samples/logopediste-nl-be.wav');
                          setCurrentAudioTitle('Vlaamse Logopediste Referentie (SoundSteps nl-BE)');
                          setPlaybackSpeed(0.85);
                          if (audioRef.current) {
                            audioRef.current.playbackRate = 0.85;
                            audioRef.current.currentTime = 0;
                            audioRef.current.play().catch(() => {});
                          }
                          setIsPlaying(true);
                          showToast('Gevalideerd referentiemodel wordt afgespeeld (-15%)');
                        }}
                        className="w-full py-2 px-3 rounded-lg text-xs font-bold bg-emerald-500/20 hover:bg-emerald-500 text-emerald-300 hover:text-slate-950 border border-emerald-500/30 transition-all flex items-center justify-center gap-2"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>▶ Herlaad Referentie "Bloem... boom... blaadje"</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* SoundSteps 4 Truths Reference Card */}
                <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-2.5 text-xs">
                  <h4 className="font-bold text-slate-200 flex items-center gap-1.5">
                    <Heart className="w-3.5 h-3.5 text-pink-400" />
                    <span>SoundSteps Kwaliteitswaarborg (nl-BE)</span>
                  </h4>
                  <ul className="space-y-1.5 text-[11px] text-slate-400 list-disc list-inside">
                    <li><strong className="text-slate-300">Linguistic Truth:</strong> Hedendaags Belgisch Standaardnederlands, geen Hollands dialect.</li>
                    <li><strong className="text-slate-300">Rendering Truth:</strong> Gemini 3.8 Voice Design met gecontroleerd vertraagd tempo (-15%).</li>
                    <li><strong className="text-slate-300">Review Truth:</strong> Fonetische beoordeling op zuiverheid van medeklinkers en vocalen.</li>
                    <li><strong className="text-slate-300">Usability Truth:</strong> Ontworpen voor auditieve discriminatie en imitatie bij kinderen.</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 1: SINGLE SPEAKER STUDIO */}
        {activeTab === 'studio' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left 7 cols: Controls & Text Input */}
            <div className="lg:col-span-7 space-y-5">
              {/* Women's Voices Showcase Card */}
              <div className="bg-gradient-to-r from-pink-950/40 via-purple-950/30 to-amber-950/30 border border-pink-500/30 rounded-xl p-4 shadow-lg shadow-pink-950/20">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">👩</span>
                    <div>
                      <h2 className="text-sm font-bold text-pink-200">Vlaamse Vrouwenstemmen (Women's Voices)</h2>
                      <p className="text-[11px] text-pink-300/70">Geoptimaliseerd voor natuurlijke Vlaamse intonatie en zachte 'g'</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-semibold bg-pink-500/20 text-pink-300 px-2 py-0.5 rounded border border-pink-500/30">
                    Gemini 3.8 Vrouwen
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {/* Kore */}
                  <div
                    onClick={() => handleSelectFemaleVoice(PREBUILT_VOICES[0])}
                    className={`cursor-pointer p-3 rounded-lg border text-left transition-all ${
                      selectedVoice === 'Kore'
                        ? 'bg-pink-500/20 border-pink-400 text-pink-100 shadow-md ring-1 ring-pink-400'
                        : 'bg-slate-950/60 border-slate-800 hover:border-pink-500/40 hover:bg-slate-900/60 text-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-xs text-pink-200">Kore</span>
                      <span className="text-[9px] bg-pink-500/20 text-pink-300 px-1.5 py-0.5 rounded">Nieuws</span>
                    </div>
                    <p className="text-[11px] text-slate-300 leading-snug line-clamp-2">
                      Heldere, professionele VRT nieuwslezeres
                    </p>
                    <div className="mt-2 flex items-center gap-1.5 text-[10px] text-pink-300 font-semibold">
                      <Play className="w-3 h-3 fill-current" />
                      <span>Beluister Kore</span>
                    </div>
                  </div>

                  {/* Aoede */}
                  <div
                    onClick={() => handleSelectFemaleVoice(PREBUILT_VOICES[1])}
                    className={`cursor-pointer p-3 rounded-lg border text-left transition-all ${
                      selectedVoice === 'Aoede'
                        ? 'bg-pink-500/20 border-pink-400 text-pink-100 shadow-md ring-1 ring-pink-400'
                        : 'bg-slate-950/60 border-slate-800 hover:border-pink-500/40 hover:bg-slate-900/60 text-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-xs text-pink-200">Aoede</span>
                      <span className="text-[9px] bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded">Podcast</span>
                    </div>
                    <p className="text-[11px] text-slate-300 leading-snug line-clamp-2">
                      Warme, vertellende en gezellige vrouwenstem
                    </p>
                    <div className="mt-2 flex items-center gap-1.5 text-[10px] text-purple-300 font-semibold">
                      <Play className="w-3 h-3 fill-current" />
                      <span>Beluister Aoede</span>
                    </div>
                  </div>

                  {/* Leda */}
                  <div
                    onClick={() => handleSelectFemaleVoice(PREBUILT_VOICES[2])}
                    className={`cursor-pointer p-3 rounded-lg border text-left transition-all ${
                      selectedVoice === 'Leda'
                        ? 'bg-pink-500/20 border-pink-400 text-pink-100 shadow-md ring-1 ring-pink-400'
                        : 'bg-slate-950/60 border-slate-800 hover:border-pink-500/40 hover:bg-slate-900/60 text-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-xs text-pink-200">Leda</span>
                      <span className="text-[9px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded">Modern</span>
                    </div>
                    <p className="text-[11px] text-slate-300 leading-snug line-clamp-2">
                      Jonge, expressieve en vlotte Vlaamse vrouw
                    </p>
                    <div className="mt-2 flex items-center gap-1.5 text-[10px] text-amber-300 font-semibold">
                      <Play className="w-3 h-3 fill-current" />
                      <span>Beluister Leda</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Regional Accent Quick Picker */}
              <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Radio className="w-4 h-4 text-amber-400" />
                    <h2 className="text-sm font-semibold text-slate-200">Kies Vlaamse Regio / Accentprofiel</h2>
                  </div>
                  <span className="text-[11px] text-slate-400">Voice Design Presets</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {REGIONAL_PROFILES.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => handleProfileSelect(p)}
                      className={`text-left p-2.5 rounded-lg border text-xs transition-all ${
                        activeProfileId === p.id
                          ? 'bg-amber-500/20 border-amber-500/50 text-amber-200 shadow-sm'
                          : 'bg-slate-950/40 border-slate-800/80 text-slate-300 hover:border-slate-700 hover:bg-slate-800/40'
                      }`}
                    >
                      <div className="font-semibold text-white truncate">{p.name}</div>
                      <div className="text-[10px] text-amber-400/80 truncate mt-0.5">{p.tag}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Text Input Card */}
              <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-amber-400" />
                    <span>In te spreken tekst (Vlaams / Nederlands)</span>
                  </label>
                  <span className="text-xs text-slate-400">{inputText.length} tekens</span>
                </div>

                <textarea
                  rows={5}
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="Voer hier uw Vlaamse tekst in..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-slate-100 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 transition-colors resize-y"
                />

                {/* Vocal Bursts & Backchannel quick buttons */}
                <div>
                  <div className="text-xs text-slate-400 mb-1.5 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    <span>Gemini 3.8 Expressie Tags (Klik om in te voegen):</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { label: '|ja| (backchannel)', tag: '|ja|' },
                      { label: '|mhm|', tag: '|mhm|' },
                      { label: '|inderdaad|', tag: '|inderdaad|' },
                      { label: '|amai|', tag: '|amai|' },
                      { label: '<laugh> (lach)', tag: '<laugh>' },
                      { label: '<breath> (ademhaling)', tag: '<breath>' },
                      { label: '<gasp> (verbazing)', tag: '<gasp>' },
                    ].map((btn) => (
                      <button
                        key={btn.tag}
                        type="button"
                        onClick={() => insertSpeechTag(btn.tag, 'single')}
                        className="text-[11px] px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono transition-colors"
                      >
                        {btn.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Sample Text Presets */}
                <div className="pt-2 border-t border-slate-800">
                  <div className="text-xs text-slate-400 mb-2">Of kies een voorbeeldscenario:</div>
                  <div className="flex flex-wrap gap-2">
                    {PRESET_SCRIPTS.map((ps) => (
                      <button
                        key={ps.title}
                        onClick={() => handlePresetSelect(ps)}
                        className="text-xs px-2.5 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-800 text-slate-200 border border-slate-700/60 hover:border-amber-500/40 transition-colors flex items-center gap-1.5"
                      >
                        <span>{ps.title}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Voice Design & Style Prompt Directives */}
              <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-amber-400" />
                    <span>Voice Design Stijlrichtlijn (speechMetadata.style)</span>
                  </label>
                  <span className="text-[11px] text-amber-400">Accent & Intonatie Sturing</span>
                </div>

                <input
                  type="text"
                  value={voiceStyle}
                  onChange={(e) => setVoiceStyle(e.target.value)}
                  placeholder="bijv. Clear Belgian Dutch newscaster, soft g, warm Flanders prosody"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-amber-500"
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Prebuilt Base Voice with Gender Filter */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-medium text-slate-400">Basisstem (Prebuilt Voice)</label>
                      <div className="flex items-center gap-1 bg-slate-950 p-0.5 rounded border border-slate-800 text-[10px]">
                        <button
                          type="button"
                          onClick={() => setGenderFilter('female')}
                          className={`px-1.5 py-0.5 rounded font-medium transition-colors ${
                            genderFilter === 'female'
                              ? 'bg-pink-500 text-slate-950 font-bold'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          👩 Vrouw
                        </button>
                        <button
                          type="button"
                          onClick={() => setGenderFilter('male')}
                          className={`px-1.5 py-0.5 rounded font-medium transition-colors ${
                            genderFilter === 'male'
                              ? 'bg-blue-500 text-slate-950 font-bold'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          👨 Man
                        </button>
                        <button
                          type="button"
                          onClick={() => setGenderFilter('all')}
                          className={`px-1.5 py-0.5 rounded font-medium transition-colors ${
                            genderFilter === 'all'
                              ? 'bg-slate-700 text-white font-bold'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          Alle
                        </button>
                      </div>
                    </div>

                    <select
                      value={selectedVoice}
                      onChange={(e) => {
                        const vName = e.target.value;
                        const found = PREBUILT_VOICES.find((v) => v.name === vName);
                        if (found) {
                          handleSelectFemaleVoice(found);
                        } else {
                          setSelectedVoice(vName);
                        }
                      }}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-amber-500"
                    >
                      {filteredVoices.map((v) => (
                        <option key={v.name} value={v.name}>
                          {v.gender === 'female' ? '👩 ' : '👨 '} {v.name} ({v.desc.split(',')[0]} — {v.tag})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Audio Engine / Model Selection */}
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1.5">Spraak & Audio Engine</label>
                    <select
                      value={selectedModel}
                      onChange={(e) => setSelectedModel(e.target.value as any)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-amber-500"
                    >
                      <option value="azure-edge-tts">⭐ Azure Edge TTS (nl-BE Inheems • Gratis & Geen Limiet)</option>
                      <option value="gemini-3.8-flash-lite-tts">Gemini 3.8 Flash-Lite TTS (Google AI)</option>
                      <option value="gemini-3.8-flash-tts">Gemini 3.8 Flash TTS (Google AI Voice Design)</option>
                    </select>
                  </div>
                </div>

                {/* Primary Action Button */}
                <div className="pt-2">
                  <button
                    onClick={generateSpeech}
                    disabled={isGenerating || !inputText.trim()}
                    className="w-full py-3 px-4 rounded-xl font-bold text-sm bg-gradient-to-r from-amber-500 via-amber-600 to-red-600 hover:from-amber-400 hover:to-red-500 text-slate-950 shadow-lg shadow-amber-500/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all"
                  >
                    {isGenerating ? (
                      <>
                        <Activity className="w-4 h-4 animate-spin text-slate-950" />
                        <span>Genereren met Gemini 3.8 TTS...</span>
                      </>
                    ) : (
                      <>
                        <Volume2 className="w-5 h-5 text-slate-950" />
                        <span>Spraak Genereren in het Vlaams</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Right 5 cols: Audio Player, Waveform & History */}
            <div className="lg:col-span-5 space-y-5">
              {/* Clarification banner about Flemish vs English/French voices */}
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3.5 text-xs text-slate-300 flex items-start gap-2.5">
                <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="font-semibold text-amber-300">
                    Klonk het eerder als een Engelse of Franse stem?
                  </div>
                  <p className="text-slate-300 leading-relaxed text-[11px]">
                    Als uw browser terugviel op de lokale systeemstem zonder geïnstalleerd Belgisch-Nederlands (nl-BE) taalpakket, las een Engelse/Franse computerstem de tekst voor.
                    <span className="text-emerald-400 font-semibold"> Hieronder hoort u de échte, door Gemini 3.8 gegenereerde audio</span> met authentieke zachte 'g' en Vlaamse intonatie.
                  </p>
                </div>
              </div>

              {/* Studio Master Audio Player Card */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl relative overflow-hidden">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
                    <h3 className="font-bold text-sm text-white">Audio Monitor & Visualisatie</h3>
                  </div>
                  <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                    Gemini Neurale Spraak
                  </span>
                </div>

                {/* Current Track Info */}
                <div className="bg-slate-950/90 border border-slate-800/80 rounded-lg px-3 py-2 mb-3 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 truncate">
                    <Volume2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span className="font-medium text-slate-200 truncate">{currentAudioTitle}</span>
                  </div>
                  <span className="text-[10px] font-mono text-amber-400/80 shrink-0">nl-BE</span>
                </div>

                {/* Canvas Waveform */}
                <div className="h-24 bg-slate-950/80 rounded-lg p-2 border border-slate-800 flex items-center justify-center">
                  <canvas ref={canvasRef} width={400} height={80} className="w-full h-full" />
                </div>

                {/* Timeline scrubber */}
                <div className="mt-4 space-y-1">
                  <input
                    type="range"
                    min={0}
                    max={audioDuration || 1}
                    step={0.05}
                    value={audioProgress}
                    onChange={handleSeek}
                    className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                  />
                  <div className="flex justify-between text-[11px] font-mono text-slate-400">
                    <span>{formatTime(audioProgress)}</span>
                    <span>{formatTime(audioDuration)}</span>
                  </div>
                </div>

                {/* Controls Bar */}
                <div className="mt-4 flex items-center justify-between pt-3 border-t border-slate-800">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={togglePlayPause}
                      className="w-11 h-11 rounded-full bg-amber-500 hover:bg-amber-400 text-slate-950 flex items-center justify-center font-bold shadow-md transition-transform active:scale-95"
                    >
                      {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
                    </button>

                    <button
                      onClick={() => {
                        if (audioRef.current) audioRef.current.currentTime = 0;
                        setAudioProgress(0);
                      }}
                      className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
                      title="Herstarten"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Speed toggle */}
                  <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
                    {[0.75, 1.0, 1.25, 1.5].map((speed) => (
                      <button
                        key={speed}
                        onClick={() => changeSpeed(speed)}
                        className={`text-[11px] font-mono px-2 py-0.5 rounded ${
                          playbackSpeed === speed
                            ? 'bg-amber-500 text-slate-950 font-bold'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {speed}x
                      </button>
                    ))}
                  </div>

                  {/* Download WAV button */}
                  {audioHistory.length > 0 && (
                    <button
                      onClick={() => downloadWav(audioHistory[0].blob, `vlaams-${Date.now()}.wav`)}
                      className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>WAV</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Clip History */}
              <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-amber-400" />
                    <span>Gegenereerde Spraakfragmenten ({audioHistory.length})</span>
                  </h4>
                </div>

                {audioHistory.length === 0 ? (
                  <div className="text-center py-6 text-xs text-slate-500">
                    Nog geen opnames gemaakt. Druk op "Spraak Genereren" om een eerste Vlaamse opname te maken.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                    {audioHistory.map((item) => (
                      <div
                        key={item.id}
                        className="bg-slate-950 p-2.5 rounded-lg border border-slate-800/80 flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-slate-200 truncate">{item.title}</p>
                          <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                            <span className="text-amber-400">{item.voice}</span>
                            <span>•</span>
                            <span>{item.createdAt}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => {
                              setCurrentAudioUrl(item.url);
                              setIsPlaying(true);
                            }}
                            className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200"
                            title="Afspelen"
                          >
                            <Play className="w-3.5 h-3.5 fill-current" />
                          </button>
                          <button
                            onClick={() => downloadWav(item.blob, `clip-${item.id}.wav`)}
                            className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                            title="Download WAV"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: DUAL-SPEAKER DIALOGUE & SCREENPLAY */}
        {activeTab === 'dialogue' && (
          <div className="space-y-6">
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                <div>
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    <Users className="w-5 h-5 text-amber-400" />
                    <span>Gemini 3.8 Tweespreker Scenario & Podcast Studio</span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Demonstreert <code className="text-amber-400">multiSpeakerVoiceConfig</code> voor natuurlijke Vlaamse gesprekken met backchanneling en emotionele reacties.
                  </p>
                </div>
                <button
                  onClick={generateDialogue}
                  disabled={isGenerating}
                  className="px-4 py-2 rounded-lg font-bold text-xs bg-amber-500 hover:bg-amber-400 text-slate-950 flex items-center gap-2 shadow-md transition-all self-start sm:self-auto"
                >
                  {isGenerating ? <Activity className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
                  <span>Speel Dialoog Af</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Speaker 1 Card */}
                <div className="bg-slate-950 border border-blue-500/20 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold text-xs">
                        1
                      </div>
                      <span className="font-semibold text-sm text-blue-300">Spreker 1: Lukas</span>
                    </div>
                    <select
                      value={speaker1Voice}
                      onChange={(e) => setSpeaker1Voice(e.target.value)}
                      className="bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200"
                    >
                      {PREBUILT_VOICES.map((v) => (
                        <option key={v.name} value={v.name}>
                          {v.gender === 'female' ? '👩' : '👨'} {v.name} ({v.gender === 'female' ? 'Vrouw' : 'Man'} — {v.tag})
                        </option>
                      ))}
                    </select>
                  </div>

                  <textarea
                    rows={4}
                    value={speaker1Text}
                    onChange={(e) => setSpeaker1Text(e.target.value)}
                    className="w-full bg-slate-900/70 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />

                  <div className="flex flex-wrap gap-1">
                    {['|ja|', '|mhm|', '<laugh>', '<breath>'].map((tag) => (
                      <button
                        key={tag}
                        onClick={() => insertSpeechTag(tag, 'speaker1')}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                      >
                        +{tag}
                      </button>
                    ))}
                  </div>

                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Stijl-instructie (Style Directive):</label>
                    <input
                      type="text"
                      value={speaker1Style}
                      onChange={(e) => setSpeaker1Style(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-slate-300"
                    />
                  </div>
                </div>

                {/* Speaker 2 Card */}
                <div className="bg-slate-950 border border-amber-500/20 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-xs">
                        2
                      </div>
                      <span className="font-semibold text-sm text-amber-300">Spreker 2: Laura</span>
                    </div>
                    <select
                      value={speaker2Voice}
                      onChange={(e) => setSpeaker2Voice(e.target.value)}
                      className="bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200"
                    >
                      {PREBUILT_VOICES.map((v) => (
                        <option key={v.name} value={v.name}>
                          {v.gender === 'female' ? '👩' : '👨'} {v.name} ({v.gender === 'female' ? 'Vrouw' : 'Man'} — {v.tag})
                        </option>
                      ))}
                    </select>
                  </div>

                  <textarea
                    rows={4}
                    value={speaker2Text}
                    onChange={(e) => setSpeaker2Text(e.target.value)}
                    className="w-full bg-slate-900/70 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />

                  <div className="flex flex-wrap gap-1">
                    {['|inderdaad|', '|amai|', '<laugh>', '<gasp>'].map((tag) => (
                      <button
                        key={tag}
                        onClick={() => insertSpeechTag(tag, 'speaker2')}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                      >
                        +{tag}
                      </button>
                    ))}
                  </div>

                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Stijl-instructie (Style Directive):</label>
                    <input
                      type="text"
                      value={speaker2Style}
                      onChange={(e) => setSpeaker2Style(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-slate-300"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: FLEMISH REGIONAL DIALECTS EXPLORER */}
        {activeTab === 'dialects' && (
          <div className="space-y-6">
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6">
              <h2 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
                <Compass className="w-5 h-5 text-amber-400" />
                <span>Vlaams Dialect- & Accentcompendium voor Gemini Voice Design</span>
              </h2>
              <p className="text-xs text-slate-400 max-w-3xl">
                Omdat Gemini 3.8 Flash TTS een audio-native neuraal model is, reageert het rechtstreeks op specifieke akoestische beschrijvingen in de stijlaanwijzing. Hieronder vindt u geteste promptformuleringen voor de belangrijkste Vlaamse spraakvariaties.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                {REGIONAL_PROFILES.map((p) => (
                  <div key={p.id} className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-bold text-sm text-amber-300">{p.name}</h3>
                        <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded border border-slate-700">
                          {p.region}
                        </span>
                      </div>
                      <p className="text-xs text-slate-300 mb-3">{p.description}</p>

                      <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800 mb-3 font-mono text-[11px] text-amber-400/90">
                        <span className="text-slate-500 select-none">// speechMetadata.style:</span>
                        <br />
                        "{p.stylePrompt}"
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        handleProfileSelect(p);
                        setActiveTab('studio');
                      }}
                      className="w-full py-1.5 px-3 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-amber-500 hover:text-slate-950 text-slate-200 transition-colors flex items-center justify-center gap-1.5"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Laad in Studio & Beluister</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: KNOWLEDGE HUB (Heeft Gemini een Vlaamse Stem?) */}
        {activeTab === 'docs' && (
          <div className="space-y-6 max-w-4xl mx-auto">
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 sm:p-8 space-y-6">
              <div className="border-b border-slate-800 pb-5">
                <span className="text-xs font-bold uppercase tracking-wider text-amber-400">Veelgestelde Vraag</span>
                <h2 className="text-xl sm:text-2xl font-extrabold text-white mt-1">
                  Heeft Gemini 3.8 TTS een specifieke Vlaamse stem?
                </h2>
              </div>

              {/* Female voices breakdown */}
              <div className="bg-pink-500/10 border border-pink-500/30 rounded-xl p-5 space-y-3">
                <div className="flex items-center gap-2 text-pink-300 font-bold text-sm">
                  <span className="text-base">👩</span>
                  <span>Welke Vrouwenstemmen heeft Gemini TTS voor het Vlaams?</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Gemini TTS heeft verschillende hoogwaardige vrouwelijke basisstemmen die uitstekend klinken in het Belgisch-Nederlands wanneer ze worden aangestuurd met Vlaamse Voice Design:
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 text-xs">
                  <div className="bg-slate-950/80 p-3 rounded-lg border border-pink-500/20">
                    <span className="font-bold text-pink-300">1. Kore (Nieuwsanker & Zakelijk)</span>
                    <p className="text-slate-400 mt-1">
                      Een heldere, zelfverzekerde en verzorgde vrouwelijke stem. Ideaal voor formeel nieuws (zoals VRT NWS), presentaties en zakelijke teksten.
                    </p>
                  </div>
                  <div className="bg-slate-950/80 p-3 rounded-lg border border-purple-500/20">
                    <span className="font-bold text-purple-300">2. Aoede (Podcast & Verhalen)</span>
                    <p className="text-slate-400 mt-1">
                      Een warme, gemoedelijke en vriendelijke vrouwenstem. Klinkt zeer menselijk en natuurlijk bij verhalen, interviews en podcasts.
                    </p>
                  </div>
                  <div className="bg-slate-950/80 p-3 rounded-lg border border-amber-500/20">
                    <span className="font-bold text-amber-300">3. Leda (Jong & Modern)</span>
                    <p className="text-slate-400 mt-1">
                      Een jonge, levendige en frisse vrouwenstem. Perfect voor informele gesprekken, sociale media en jeugdige assistenten.
                    </p>
                  </div>
                  <div className="bg-slate-950/80 p-3 rounded-lg border border-blue-500/20">
                    <span className="font-bold text-blue-300">4. Zephyr (Rustgevend & Zacht)</span>
                    <p className="text-slate-400 mt-1">
                      Een zachte, kalmerende vrouwenstem voor ontspanning, meditatie, poëzie en rustige audioboeken.
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                <div className="bg-slate-950 border border-slate-800 p-5 rounded-xl space-y-3">
                  <h3 className="font-bold text-white text-sm flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    <span>Gemini 3.8 Flash TTS (Voice Design)</span>
                  </h3>
                  <ul className="text-xs text-slate-300 space-y-2 list-disc list-inside">
                    <li>Geen statische lijst van duizenden opnames, maar een generatief neuronaal spraakmodel.</li>
                    <li>
                      Ondersteunt sturing via <code className="text-amber-400">speechMetadata.style</code>: u kunt "Belgian Dutch / Flemish accent, soft g, Ghent cadence" specificeren.
                    </li>
                    <li>
                      Ondersteunt natuurlijke backchanneling (<code className="text-amber-400">|mhm|</code>, <code className="text-amber-400">|ja|</code>) en expressies (<code className="text-amber-400">&lt;laugh&gt;</code>).
                    </li>
                    <li>Dual-speaker scenario's en podcasts in één API-aanroep.</li>
                  </ul>
                </div>

                <div className="bg-slate-950 border border-slate-800 p-5 rounded-xl space-y-3">
                  <h3 className="font-bold text-white text-sm flex items-center gap-2">
                    <Radio className="w-4 h-4 text-blue-400" />
                    <span>Google Cloud TTS (Chirp 3 HD)</span>
                  </h3>
                  <ul className="text-xs text-slate-300 space-y-2 list-disc list-inside">
                    <li>Heeft expliciete, genummerde catalogusstemmen voor België (nl-BE).</li>
                    <li>
                      Specifieke stemmen:
                      <br />
                      • <code className="text-blue-300">nl-BE-Chirp3-HD-Achernar</code> (Vrouwelijk)
                      <br />
                      • <code className="text-blue-300">nl-BE-Chirp3-HD-Achird</code> (Mannelijk)
                    </li>
                    <li>Gegarandeerde gestandaardiseerde uitspraak voor formele IVR en telefonie.</li>
                  </ul>
                </div>
              </div>

              {/* Code Snippet */}
              <div className="space-y-3 pt-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                    Voorbeeldcode (@google/genai TypeScript SDK)
                  </h4>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(`import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const response = await ai.models.generateContent({
  model: "gemini-3.8-flash-tts",
  contents: [
    {
      role: "user",
      parts: [
        {
          text: "Dag allemaal! Welkom bij onze podcast over technologie in Vlaanderen.",
          speechMetadata: {
            style: "Native Flemish speaker from Flanders, Belgium. Natural Belgian Dutch accent, warm and articulate pronunciation.",
          },
        },
      ],
    },
  ],
  config: {
    responseModalities: ["AUDIO"],
    speechConfig: {
      voiceConfig: {
        prebuiltVoiceConfig: { voiceName: "Kore" },
      },
    },
  },
});`);
                      showToast('Code gekopieerd naar klembord!');
                    }}
                    className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>Kopieer Code</span>
                  </button>
                </div>

                <pre className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-[11px] font-mono text-slate-300 overflow-x-auto leading-relaxed">
{`import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Genereer Vlaamse spraak via promptsturing
const response = await ai.models.generateContent({
  model: "gemini-3.8-flash-tts",
  contents: [
    {
      role: "user",
      parts: [
        {
          text: "Dag allemaal! Welkom bij onze podcast over technologie in Vlaanderen.",
          speechMetadata: {
            style: "Native Flemish speaker from Flanders, Belgium. Natural Belgian Dutch accent, warm and articulate pronunciation.",
          },
        },
      ],
    },
  ],
  config: {
    responseModalities: ["AUDIO"],
    speechConfig: {
      voiceConfig: {
        prebuiltVoiceConfig: { voiceName: "Kore" },
      },
    },
  },
});`}
                </pre>
              </div>

              {/* SoundSteps Speech Therapy nl-BE Framework Guide */}
              <div className="border-t border-slate-800 pt-6 space-y-4">
                <div className="flex items-center gap-2">
                  <Stethoscope className="w-5 h-5 text-emerald-400" />
                  <h3 className="font-bold text-white text-base">
                    SoundSteps: Belgische Logopedie & Klankautoriteit (nl-BE)
                  </h3>
                </div>

                <p className="text-xs text-slate-300 leading-relaxed">
                  Volgens het SoundSteps-architectuurmodel mag een TTS-provider nooit bepalen wat "correct Belgisch-Nederlands" is. Voor spraaktherapie bij kinderen (articulatietraining en klankontwikkeling) onderscheidt het model 4 onafhankelijke zekerheden:
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                    <strong className="text-emerald-300 block mb-1">1. Linguistic Truth (Taalkundige Norm)</strong>
                    <p className="text-slate-400 text-[11px] leading-relaxed">
                      Hedendaags Belgisch Standaardnederlands (nl-BE-standard), zachte /ɣ/ en /x/, zuivere tweeklanken, kindgerichte intonatie zonder dialectvervorming of noordelijke diftongering.
                    </p>
                  </div>
                  <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                    <strong className="text-blue-300 block mb-1">2. Rendering Truth (Synthese-uitvoering)</strong>
                    <p className="text-slate-400 text-[11px] leading-relaxed">
                      Gemini 3.8 Flash TTS Voice Design met expliciete fonetische sturing of Azure <code className="text-blue-200">nl-BE-DenaNeural</code>, met therapeutisch vertraagd tempo (-12% tot -15%).
                    </p>
                  </div>
                  <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                    <strong className="text-purple-300 block mb-1">3. Review Truth (Klinische Beoordeling)</strong>
                    <p className="text-slate-400 text-[11px] leading-relaxed">
                      Beoordeling door Vlaamse logopedisten op doelklanknauwkeurigheid, consonantrealisatie, afwezigheid van synthetische artefacten en auditief contrast.
                    </p>
                  </div>
                  <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                    <strong className="text-amber-300 block mb-1">4. Usability Truth (Kind-Validatie)</strong>
                    <p className="text-slate-400 text-[11px] leading-relaxed">
                      Geleide spraakoefening bij kinderen: begrijpen van de prompt, aandacht voor het model, spontane imitatiepogingen zonder herhaalde uitleg.
                    </p>
                  </div>
                </div>

                <div className="bg-emerald-950/20 border border-emerald-500/20 p-4 rounded-xl text-xs space-y-2">
                  <span className="font-bold text-emerald-300 block">
                    Klinische Rollenhiërarchie in Spraaktherapie:
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                    <div className="bg-slate-950/70 p-2 rounded border border-slate-800">
                      <span className="text-emerald-400 font-mono font-bold block">target_reference</span>
                      <span className="text-slate-400">Doelklank op woordniveau</span>
                    </div>
                    <div className="bg-slate-950/70 p-2 rounded border border-slate-800">
                      <span className="text-blue-400 font-mono font-bold block">contrast_reference</span>
                      <span className="text-slate-400">Minimale paren (kip/tip)</span>
                    </div>
                    <div className="bg-slate-950/70 p-2 rounded border border-slate-800">
                      <span className="text-purple-400 font-mono font-bold block">target_bearing</span>
                      <span className="text-slate-400">Zinscontext (in frase)</span>
                    </div>
                    <div className="bg-slate-950/70 p-2 rounded border border-slate-800">
                      <span className="text-amber-400 font-mono font-bold block">instructional</span>
                      <span className="text-slate-400">Kindgerichte pedagogiek</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-4 text-center text-xs text-slate-500">
        <p>VlaamsVoice • Aangedreven door Google Gemini 3.8 Flash TTS & Voice Design</p>
      </footer>
    </div>
  );
}
