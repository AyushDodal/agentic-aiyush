import { useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE, apiFetch } from './api';

type Recognition = {
  lang: string;
  interimResults: boolean;
  onresult: ((event: { results: { [index: number]: { [index: number]: { transcript: string } } } }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
type SpeechWindow = Window & {
  SpeechRecognition?: new () => Recognition;
  webkitSpeechRecognition?: new () => Recognition;
};

export function useVoice(onTranscript: (text: string) => void, onError: (message: string) => void) {
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const amplitude = useRef(0);
  const audio = useRef<HTMLAudioElement | null>(null);
  const context = useRef<AudioContext | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const recognition = useRef<Recognition | null>(null);
  const audioUrl = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const frame = useRef(0);
  const epoch = useRef(0);
  const recordingEpoch = useRef(0);
  const speechAbort = useRef<AbortController | null>(null);
  const transcriptionAbort = useRef<AbortController | null>(null);
  const callbacks = useRef({ onTranscript, onError });
  callbacks.current = { onTranscript, onError };

  useEffect(() => {
    if (!('speechSynthesis' in window)) return;
    const update = () => setVoices(window.speechSynthesis.getVoices());
    update();
    window.speechSynthesis.addEventListener('voiceschanged', update);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', update);
  }, []);

  const stopSpeaking = useCallback(() => {
    epoch.current += 1;
    speechAbort.current?.abort();
    audio.current?.pause();
    audio.current = null;
    window.speechSynthesis?.cancel();
    cancelAnimationFrame(frame.current);
    if (audioUrl.current) URL.revokeObjectURL(audioUrl.current);
    audioUrl.current = null;
    void context.current?.close();
    context.current = null;
    amplitude.current = 0;
    setSpeaking(false);
    setPreparing(false);
  }, []);

  const stopRecording = useCallback((discard = false) => {
    clearTimeout(timer.current);
    if (discard) {
      recordingEpoch.current += 1;
      transcriptionAbort.current?.abort();
      recognition.current?.abort();
      setTranscribing(false);
    } else {
      recognition.current?.stop();
    }
    if (recorder.current?.state === 'recording') recorder.current.stop();
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    setListening(false);
  }, []);

  const speak = useCallback(async (text: string, provider: 'openai' | 'browser', voiceURI = '') => {
    stopSpeaking();
    const current = epoch.current;
    setPreparing(true);
    const browserSpeak = () => {
      if (!('speechSynthesis' in window)) {
        setPreparing(false);
        callbacks.current.onError('Speech playback is unavailable in this browser. Your answer is in the conversation.');
        return;
      }
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.voice = window.speechSynthesis.getVoices().find((voice) => voice.voiceURI === voiceURI) || null;
      utterance.rate = 0.98;
      utterance.onstart = () => {
        if (current !== epoch.current) return;
        setPreparing(false);
        setSpeaking(true);
        const tick = () => {
          amplitude.current = 0.22 + Math.abs(Math.sin(performance.now() / 110)) * 0.48;
          frame.current = requestAnimationFrame(tick);
        };
        tick();
      };
      utterance.onend = () => { if (current === epoch.current) stopSpeaking(); };
      utterance.onerror = (event) => {
        if (current === epoch.current) {
          stopSpeaking();
          if (event.error !== 'canceled' && event.error !== 'interrupted') callbacks.current.onError('Voice playback failed. Your answer is still available below.');
        }
      };
      window.speechSynthesis.speak(utterance);
    };
    if (provider === 'browser') { browserSpeak(); return; }
    try {
      speechAbort.current = new AbortController();
      const response = await fetch(API_BASE + '/api/speech', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.slice(0, 4000) }), signal: speechAbort.current.signal,
      });
      if (!response.ok) throw new Error('Voice service unavailable');
      const blob = await response.blob();
      if (current !== epoch.current) return;
      audioUrl.current = URL.createObjectURL(blob);
      const player = new Audio(audioUrl.current);
      audio.current = player;
      context.current = new AudioContext();
      await context.current.resume();
      if (current !== epoch.current) return;
      const analyser = context.current.createAnalyser();
      analyser.fftSize = 256;
      const source = context.current.createMediaElementSource(player);
      source.connect(analyser);
      analyser.connect(context.current.destination);
      const samples = new Uint8Array(analyser.frequencyBinCount);
      player.onended = () => { if (current === epoch.current) stopSpeaking(); };
      player.onerror = () => {
        if (current === epoch.current) { stopSpeaking(); callbacks.current.onError('Audio could not play. Your answer is still available below.'); }
      };
      await player.play();
      if (current !== epoch.current) { player.pause(); return; }
      setPreparing(false);
      setSpeaking(true);
      const tick = () => {
        analyser.getByteTimeDomainData(samples);
        amplitude.current = Math.min(1, Math.sqrt(samples.reduce((sum, sample) => sum + ((sample - 128) / 128) ** 2, 0) / samples.length) * 6);
        frame.current = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      if (current !== epoch.current) return;
      audio.current?.pause();
      void context.current?.close();
      context.current = null;
      if (audioUrl.current) URL.revokeObjectURL(audioUrl.current);
      audioUrl.current = null;
      callbacks.current.onError('AI voice is unavailable. Switching to your browser voice.');
      browserSpeak();
    }
  }, [stopSpeaking]);

  const startRecording = useCallback(async (provider: 'openai' | 'browser') => {
    stopSpeaking();
    const current = ++recordingEpoch.current;
    if (provider === 'browser') {
      const Constructor = (window as SpeechWindow).SpeechRecognition || (window as SpeechWindow).webkitSpeechRecognition;
      if (!Constructor) { callbacks.current.onError('Voice input is unavailable in this browser. Please type your question.'); return; }
      const recognizer = new Constructor();
      recognition.current = recognizer;
      recognizer.lang = 'en-US';
      recognizer.interimResults = false;
      recognizer.onresult = (event) => {
        if (current === recordingEpoch.current) callbacks.current.onTranscript(event.results[0][0].transcript);
      };
      recognizer.onerror = (event) => {
        if (current === recordingEpoch.current && event.error !== 'aborted') callbacks.current.onError(event.error === 'not-allowed' ? 'Microphone permission was denied. You can still type your question.' : 'I could not hear that. Please try again or type your question.');
      };
      recognizer.onend = () => { if (current === recordingEpoch.current) { clearTimeout(timer.current); setListening(false); } };
      try { recognizer.start(); setListening(true); timer.current = setTimeout(() => stopRecording(), 45000); }
      catch { callbacks.current.onError('Microphone could not start. Please try again.'); }
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      callbacks.current.onError('Microphone access requires a supported browser on HTTPS or localhost. You can still type your question.');
      return;
    }
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (current !== recordingEpoch.current) { media.getTracks().forEach((track) => track.stop()); return; }
      stream.current = media;
      const mimeType = ['audio/webm', 'audio/mp4', 'audio/ogg'].find((type) => MediaRecorder.isTypeSupported(type));
      const recording = new MediaRecorder(media, mimeType ? { mimeType } : undefined);
      recorder.current = recording;
      const chunks: Blob[] = [];
      recording.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      recording.onstop = async () => {
        media.getTracks().forEach((track) => track.stop());
        if (current !== recordingEpoch.current) return;
        setListening(false);
        setTranscribing(true);
        const data = new FormData();
        data.append('audio', new Blob(chunks, { type: recording.mimeType || mimeType }), 'question');
        try {
          transcriptionAbort.current = new AbortController();
          const result = await apiFetch<{ text: string }>('/api/transcribe', { method: 'POST', body: data, signal: transcriptionAbort.current.signal });
          if (current === recordingEpoch.current) {
            if (result.text.trim()) callbacks.current.onTranscript(result.text.trim());
            else callbacks.current.onError('No speech was detected. Please try again.');
          }
        } catch (error) {
          if (current === recordingEpoch.current) callbacks.current.onError(error instanceof Error ? error.message : 'Transcription failed.');
        } finally { if (current === recordingEpoch.current) setTranscribing(false); }
      };
      recording.start();
      setListening(true);
      timer.current = setTimeout(() => stopRecording(), 45000);
    } catch {
      stream.current?.getTracks().forEach((track) => track.stop());
      if (current === recordingEpoch.current) callbacks.current.onError('Microphone access was denied or unavailable. You can still type your question.');
    }
  }, [stopRecording, stopSpeaking]);

  useEffect(() => () => { stopSpeaking(); stopRecording(true); }, [stopSpeaking, stopRecording]);
  return { listening, transcribing, speaking, preparing, voices, amplitude, startRecording, stopRecording, speak, stopSpeaking };
}
