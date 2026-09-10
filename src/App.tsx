import { lazy, Suspense, useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowDown, ArrowDownToLine, ArrowUp, AudioLines, BookOpen, BriefcaseBusiness, Check, ChevronRight, CircleHelp, Code2, FileText, GraduationCap, LoaderCircle, Mic, Plus, RotateCcw, Settings2, ShieldCheck, Square, Volume2, VolumeX, X } from 'lucide-react';
import { API_BASE, apiFetch, type Health, type Message, type Source } from './api';
import { useVoice } from './useVoice';

const Avatar = lazy(() => import('./Avatar'));
const topics = [
  { title: 'Experience', question: 'Walk me through your work experience.', icon: BriefcaseBusiness },
  { title: 'Projects', question: 'Tell me about your AI engineering projects.', icon: Code2 },
  { title: 'Education', question: 'What is your educational background?', icon: GraduationCap },
  { title: 'Beyond work', question: 'What hobbies or interests are mentioned in your resume?', icon: CircleHelp },
];
const welcome: Message = { id: 'welcome', role: 'assistant', content: "Hi, I'm Ayush's AI avatar. What would you like to know about my background?" };

function useReducedMotion() {
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => setReduced(query.matches);
    query.addEventListener('change', change);
    return () => query.removeEventListener('change', change);
  }, []);
  return reduced;
}

function SourceList({ sources }: { sources: Source[] }) {
  return <details className="sources">
    <summary><BookOpen size={13} /> {sources.length === 1 ? '1 resume source' : `${sources.length} resume sources`} <ChevronRight size={12} /></summary>
    <div className="source-list">{sources.map((source) => <blockquote key={source.id}>
      <cite>{source.document}{source.page ? ` / Page ${source.page}` : ''}</cite>
      <p>{source.text}</p>
    </blockquote>)}</div>
  </details>;
}

export default function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [connection, setConnection] = useState<'connecting' | 'online' | 'offline'>('connecting');
  const [messages, setMessages] = useState<Message[]>([welcome]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [lastFailed, setLastFailed] = useState('');
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [voiceProvider, setVoiceProvider] = useState<'auto' | 'browser'>('auto');
  const [voiceURI, setVoiceURI] = useState('');
  const reducedMotion = useReducedMotion();
  const [motionEnabled, setMotionEnabled] = useState(true);
  const [showScroll, setShowScroll] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const transcript = useRef<HTMLDivElement>(null);
  const shouldScroll = useRef(true);
  const request = useRef<AbortController | null>(null);
  const submitting = useRef(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const sendRef = useRef<(text: string) => void>(() => {});
  const voice = useVoice((text) => sendRef.current(text), setError);
  const outputProvider = voiceProvider === 'browser' ? 'browser' : health?.voice || 'browser';
  const status = voice.listening ? 'Listening' : voice.transcribing ? 'Transcribing' : busy ? 'Thinking' : voice.preparing ? 'Preparing voice' : voice.speaking ? 'Speaking' : 'Ready to talk';

  useEffect(() => {
    const controller = new AbortController();
    const refresh = async () => {
      try {
        const result = await apiFetch<Health>('/api/health', { signal: controller.signal });
        setHealth(result); setConnection('online');
      } catch { if (!controller.signal.aborted) setConnection('offline'); }
    };
    void refresh();
    const interval = setInterval(refresh, 30000);
    return () => { controller.abort(); clearInterval(interval); request.current?.abort(); };
  }, []);

  useEffect(() => {
    if (shouldScroll.current && transcript.current) transcript.current.scrollTop = transcript.current.scrollHeight;
  }, [messages, busy, error]);

  const send = async (question: string) => {
    const text = question.trim();
    if (!text || submitting.current) return;
    if (text.length > 1500) { setError('Please keep your question under 1,500 characters.'); return; }
    voice.stopRecording(true); voice.stopSpeaking();
    setError(''); setLastFailed(''); setInput(''); setBusy(true);
    submitting.current = true;
    shouldScroll.current = true;
    setShowScroll(false);
    const history = messages.filter((message) => message.id !== 'welcome').slice(-12).map(({ role, content }) => ({ role, content: content.slice(0, 4000) }));
    const user: Message = { id: crypto.randomUUID(), role: 'user', content: text };
    setMessages((previous) => [...previous, user]);
    const controller = new AbortController();
    request.current = controller;
    const timeout = setTimeout(() => controller.abort('timeout'), 55000);
    try {
      const result = await apiFetch<{ answer: string; sources: Source[]; mode: Message['mode'] }>('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history }), signal: controller.signal,
      });
      if (request.current !== controller) return;
      setConnection('online');
      setMessages((previous) => [...previous, { id: crypto.randomUUID(), role: 'assistant', content: result.answer, sources: result.sources, mode: result.mode }]);
      if (voiceEnabled) void voice.speak(result.answer, outputProvider, voiceURI);
    } catch (failure) {
      if (request.current !== controller) return;
      setError(controller.signal.aborted ? 'The answer took too long. Please try again.' : failure instanceof Error ? failure.message : 'Something went wrong. Please try again.');
      setLastFailed(text);
      setMessages((previous) => previous.filter((message) => message.id !== user.id));
      setInput(text);
    } finally {
      clearTimeout(timeout);
      if (request.current === controller) { submitting.current = false; setBusy(false); request.current = null; }
    }
  };
  sendRef.current = (text) => { void send(text); };

  const reset = () => {
    request.current?.abort(); request.current = null;
    submitting.current = false;
    voice.stopSpeaking(); voice.stopRecording(true);
    setMessages([welcome]); setBusy(false); setInput(''); setError(''); setLastFailed('');
    shouldScroll.current = true; setShowScroll(false);
  };
  const download = () => {
    const text = messages.map((message) => `${message.role === 'user' ? 'You' : "Ayush's AI avatar"}: ${message.content}${message.sources?.length ? '\nSources: ' + message.sources.map((source) => `${source.document}${source.page ? `, page ${source.page}` : ''}`).join('; ') : ''}`).join('\n\n');
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'conversation-with-ayush.txt'; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const toggleVoice = () => { if (voiceEnabled) voice.stopSpeaking(); setVoiceEnabled(!voiceEnabled); };
  const onSubmit = (event: FormEvent) => { event.preventDefault(); void send(input); };

  return <div className="app-shell">
    <header className="topbar">
      <a className="brand" href="#" aria-label="Ayush Dodal home" onClick={(event) => { event.preventDefault(); reset(); }}>
        <span className="brand-symbol">a<span>.</span></span>
        <span className="brand-name">AYUSH DODAL<span>THE AI AVATAR</span></span>
      </a>
      <div className="topbar-actions">
        <span className={`connection ${connection}`}><i />{connection === 'connecting' ? 'Connecting' : connection === 'offline' ? 'Reconnecting' : health?.resume_ready ? 'Resume connected' : 'Awaiting resume'}</span>
        <a className={`resume-link ${!health?.resume_ready ? 'unavailable' : ''}`} href={API_BASE + '/api/resume'} aria-disabled={!health?.resume_ready} onClick={(event) => { if (!health?.resume_ready) event.preventDefault(); }}><FileText size={15} /><span>Resume</span><ArrowDownToLine size={14} /></a>
      </div>
    </header>

    <section className="welcome-heading">
      <div className="eyebrow"><span className="tiny-cross">+</span> A MORE PERSONAL INTRODUCTION</div>
      <h1>Welcome, this is Ayush Dodal's AI Avatar.<span>Ask him any question about Ayush's work, education or hobbies</span></h1>
    </section>

    <main className="experience">
      <section className="persona" aria-label="Ayush's avatar">
        <div className="persona-top"><span className="edition">PERSONA / 01</span><span className="live-label"><i /> LIVE AVATAR</span></div>
        <div className="persona-title"><p>Meet the person behind the profile.</p><h2>Ayush Dodal<span>.</span></h2></div>
        <div className="scene-wrap"><Suspense fallback={<div className="scene-loading"><LoaderCircle className="spin" size={24} /></div>}><Avatar amplitude={voice.amplitude} listening={voice.listening} thinking={busy} reducedMotion={reducedMotion || !motionEnabled} /></Suspense></div>
        <div className="persona-caption"><span className="caption-rule" /><span>HUMAN PERSPECTIVE.<br /><strong>DIGITAL PRESENCE.</strong></span></div>
        <div className="avatar-status" aria-live="polite"><span className={`waveform ${voice.speaking || voice.listening ? 'active' : ''}`}>{Array.from({ length: 9 }, (_, index) => <i key={index} style={{ animationDelay: `${index * 0.09}s`, height: `${5 + (index % 3) * 5}px` }} />)}</span><span>{status}</span></div>
        <div className="persona-bottom"><span><ShieldCheck size={13} />{health?.mode === 'local' ? 'Local resume search' : 'Grounded in my resume'}</span><span>AI avatar &middot; Synthetic voice</span></div>
      </section>

      <section className="conversation" aria-label="Conversation">
        <div className="conversation-header"><div><div className="eyebrow">THE CONVERSATION</div><h2>Let's talk<span>.</span></h2></div><div className="tool-row">
          <button className="icon-button" aria-label="Download conversation" title="Download conversation" onClick={download} disabled={messages.length === 1}><ArrowDownToLine size={17} /></button>
          <button className="icon-button" aria-label="New conversation" title="New conversation" onClick={reset}><Plus size={20} /></button>
          <button className="icon-button" aria-label="Voice and animation settings" title="Voice and animation settings" onClick={() => dialog.current?.showModal()}><Settings2 size={17} /></button>
        </div></div>

        <div className="transcript" ref={transcript} role="log" aria-label="Conversation messages" aria-live="polite" aria-relevant="additions text" onScroll={() => {
          const element = transcript.current!;
          shouldScroll.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80;
          setShowScroll(!shouldScroll.current);
        }}>
          <div className="conversation-date"><span />THIS SESSION<span /></div>
          {messages.map((message) => <article className={`message ${message.role}`} key={message.id}>
            <div className="message-heading"><span className="message-mark">{message.role === 'assistant' ? 'a.' : 'Y'}</span><span>{message.role === 'assistant' ? "Ayush's avatar" : 'You'}</span>{message.role === 'assistant' && <span className="ai-tag">AI</span>}</div>
            <p className="message-content">{message.content}</p>
            {message.sources?.length ? <SourceList sources={message.sources} /> : null}
            {message.mode === 'local' && <span className="local-label">Local search &middot; Verbatim excerpts</span>}
            {message.role === 'assistant' && message.id !== 'welcome' && <button className="message-speak icon-button" title="Read answer aloud" aria-label="Read answer aloud" disabled={voice.listening} onClick={() => void voice.speak(message.content, outputProvider, voiceURI)}><Volume2 size={14} /></button>}
          </article>)}
          {messages.length === 1 && !busy && <div className="starter-topics">{topics.map(({ title, question, icon: Icon }) => <button key={title} onClick={() => void send(question)} disabled={voice.transcribing || voice.listening}><Icon size={17} /><span>{title}</span><ChevronRight size={14} /></button>)}</div>}
          {busy && <div className="thinking" role="status"><span /><span /><span /><p>Looking through my resume</p></div>}
        </div>
        {showScroll && <button className="scroll-bottom icon-button" aria-label="Scroll to latest message" title="Scroll to latest message" onClick={() => { transcript.current?.scrollTo({ top: transcript.current.scrollHeight, behavior: reducedMotion ? 'instant' : 'smooth' }); }}><ArrowDown size={17} /></button>}

        <div className="compose-area">
          {connection === 'offline' && <div className="inline-notice" role="status">The avatar is reconnecting. Please try again shortly.</div>}
          {connection === 'online' && !health?.resume_ready && <div className="inline-notice" role="status">Ayush's resume is not available yet.</div>}
          {error && <div className="inline-error" role="alert"><span>{error}</span>{lastFailed && <button className="icon-button" title="Retry question" aria-label="Retry question" onClick={() => void send(lastFailed)}><RotateCcw size={15} /></button>}<button className="icon-button" title="Dismiss notification" aria-label="Dismiss notification" onClick={() => setError('')}><X size={15} /></button></div>}
          <form className={`composer ${voice.listening ? 'recording' : ''}`} onSubmit={onSubmit}>
            <textarea ref={inputRef} aria-label="Your question" placeholder={voice.listening ? 'Listening to you...' : 'Ask me something...'} value={input} maxLength={1500} rows={2} disabled={busy || voice.listening || voice.transcribing} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(input); } }} />
            <div className="composer-bottom">
              <button type="button" className={`mic-button ${voice.listening ? 'active' : ''}`} disabled={busy || voice.transcribing} aria-label={voice.listening ? 'Stop recording' : 'Start voice question'} title={voice.listening ? 'Stop recording' : 'Start voice question'} onClick={() => { setError(''); if (voice.listening) voice.stopRecording(); else void voice.startRecording(health?.voice || 'browser'); }}>{voice.transcribing ? <LoaderCircle size={17} className="spin" /> : voice.listening ? <Square size={15} fill="currentColor" /> : <Mic size={18} />}</button>
              <span className="input-state">{voice.listening ? 'Listening...' : voice.transcribing ? 'Transcribing...' : input.length > 1300 ? `${input.length}/1500` : 'Your next question'}</span>
              <button type="submit" className="send-button" disabled={!input.trim() || busy || voice.listening || voice.transcribing} aria-label="Send question" title="Send question">{busy ? <LoaderCircle size={18} className="spin" /> : <ArrowUp size={20} />}</button>
            </div>
          </form>
          <div className="compose-footer"><button type="button" className="voice-switch" role="switch" aria-checked={voiceEnabled} aria-label="Spoken answers" onClick={toggleVoice}>{voiceEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}<span>Voice {voiceEnabled ? 'on' : 'off'}</span><span className={`switch-track ${voiceEnabled ? 'checked' : ''}`}><i /></span></button>{(voice.speaking || voice.preparing) && <button className="stop-voice" onClick={voice.stopSpeaking}><Square size={10} fill="currentColor" />Stop audio</button>}<span className="session-note">Session only &middot; Not saved</span></div>
        </div>
      </section>
    </main>

    <footer className="site-footer"><span>AYUSH DODAL <span className="footer-plus">+</span> A LITTLE MORE HUMAN</span><span>Built with curiosity.<span className="footer-dot" /></span></footer>

    <dialog ref={dialog} className="settings-dialog" onClick={(event) => { if (event.target === dialog.current) dialog.current.close(); }}>
      <div className="settings-header"><h2>Preferences</h2><button className="icon-button" title="Close settings" aria-label="Close settings" onClick={() => dialog.current?.close()}><X size={20} /></button></div>
      <label className="setting"><span><AudioLines size={17} />Voice</span><select aria-label="Voice provider" value={voiceProvider} onChange={(event) => { voice.stopSpeaking(); setVoiceProvider(event.target.value as 'auto' | 'browser'); }}><option value="auto">{health?.voice === 'openai' ? 'AI voice / Ash' : 'Browser default'}</option><option value="browser">Browser voice</option></select></label>
      {outputProvider === 'browser' && <label className="setting"><span>Browser voice</span><select aria-label="Browser voice" value={voiceURI} onChange={(event) => setVoiceURI(event.target.value)}><option value="">System default</option>{voice.voices.map((option) => <option key={option.voiceURI} value={option.voiceURI}>{option.name}</option>)}</select></label>}
      <label className="setting"><span><Volume2 size={17} />Spoken answers</span><input type="checkbox" checked={voiceEnabled} onChange={toggleVoice} /></label>
      <label className="setting"><span>Avatar animation</span><input type="checkbox" checked={motionEnabled && !reducedMotion} disabled={reducedMotion} onChange={(event) => setMotionEnabled(event.target.checked)} /></label>
      <button className="done-button" onClick={() => dialog.current?.close()}><Check size={16} />Done</button>
    </dialog>
  </div>;
}
