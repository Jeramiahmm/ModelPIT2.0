import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, Shield, Swords, Users, Crown, AlertTriangle, Send, TerminalSquare, X, Check, MessageSquare, ChevronUp, ChevronDown, Volume2, VolumeX, TrendingUp, TrendingDown, Zap } from 'lucide-react';
import confetti from 'canvas-confetti';
import { ClaudeSVG, ChatGPTSVG, GeminiSVG, DeepSeekSVG, OllamaSVG, KimiSVG, HumanSVG } from './ModelLogos';

// ============================================
// BACKEND API INTEGRATION
// ============================================

const API_BASE = '/api';

async function apiJoinQueue(atk, def, mode) {
  const res = await fetch(`${API_BASE}/queue/join`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ attacker: atk, defender: def, mode }) });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to join queue' }));
    throw new Error(err.detail || 'Failed to join queue');
  }
  return await res.json();
}

async function apiSendMessage(battleId, message) {
  const res = await fetch(`${API_BASE}/battles/${battleId}/message`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message }) });
  return res.ok;
}

async function apiGetScoreboard() {
  const [atkRes, defRes] = await Promise.all([
    fetch(`${API_BASE}/scoreboard/attackers`), fetch(`${API_BASE}/scoreboard/defenders`)
  ]);
  return { attackers: await atkRes.json(), defenders: await defRes.json() };
}

async function apiGetModels() {
  const res = await fetch(`${API_BASE}/models`);
  return await res.json();
}

function connectWebSocket(onMessage) {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${window.location.host}/ws`);
  ws.onmessage = (e) => { try { onMessage(JSON.parse(e.data)); } catch(err) { console.error('WS parse error:', err); } };
  ws.onerror = (e) => console.error('WS error:', e);
  const ping = setInterval(() => { if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'ping' })); }, 30000);
  ws.onclose = () => { clearInterval(ping); setTimeout(() => connectWebSocket(onMessage), 2000); };
  return ws;
}

// ============================================
// STATIC DATA & CONFIG
// ============================================

const MODELS = [
  { id: 'claude', name: 'Claude', provider: 'Anthropic', Logo: ClaudeSVG },
  { id: 'chatgpt', name: 'ChatGPT', provider: 'OpenAI', Logo: ChatGPTSVG },
  { id: 'gemini', name: 'Gemini', provider: 'Google', Logo: GeminiSVG },
  { id: 'deepseek', name: 'DeepSeek', provider: 'DeepSeek', Logo: DeepSeekSVG },
  { id: 'ollama', name: 'Ollama', provider: 'Local', Logo: OllamaSVG },
  { id: 'kimi', name: 'Kimi K2.5', provider: 'Moonshot AI', Logo: KimiSVG },
];

const SECTIONS = ['hero', 'arena', 'live', 'scoreboard'];

// ============================================
// HELPERS
// ============================================

const getModelInfo = (id) => MODELS.find(m => m.id === id) || { name: id === 'Human' ? 'Human' : id, Logo: HumanSVG };

const fireConfetti = (isAttackerWin) => {
  const duration = 3 * 1000;
  const animationEnd = Date.now() + duration;
  const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 1000 };
  const colors = isAttackerWin ? ['#dc2626', '#fbbf24', '#ffffff'] : ['#cccccc', '#ffffff', '#666666'];

  const interval = setInterval(function() {
    const timeLeft = animationEnd - Date.now();
    if (timeLeft <= 0) return clearInterval(interval);
    const particleCount = 50 * (timeLeft / duration);
    confetti(Object.assign({}, defaults, { particleCount, origin: { x: Math.random(), y: Math.random() - 0.2 }, colors }));
  }, 250);
};

// ============================================
// SOUND MANAGER (Web Audio API)
// ============================================

class SoundManager {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.ambientNode = null;
  }
  init() {
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }
  playHit() {
    if (this.muted) return; this.init();
    const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
    o.type = 'square'; o.frequency.setValueAtTime(200, this.ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(80, this.ctx.currentTime + 0.1);
    g.gain.setValueAtTime(0.15, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.15);
    o.connect(g); g.connect(this.ctx.destination);
    o.start(); o.stop(this.ctx.currentTime + 0.15);
  }
  playCritical() {
    if (this.muted) return; this.init();
    const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(400, this.ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(50, this.ctx.currentTime + 0.3);
    g.gain.setValueAtTime(0.2, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.3);
    o.connect(g); g.connect(this.ctx.destination);
    o.start(); o.stop(this.ctx.currentTime + 0.3);
  }
  playKO() {
    if (this.muted) return; this.init();
    [80, 60, 40].forEach((freq, i) => {
      const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(freq, this.ctx.currentTime + i * 0.15);
      g.gain.setValueAtTime(0.25, this.ctx.currentTime + i * 0.15);
      g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + i * 0.15 + 0.4);
      o.connect(g); g.connect(this.ctx.destination);
      o.start(this.ctx.currentTime + i * 0.15); o.stop(this.ctx.currentTime + i * 0.15 + 0.4);
    });
  }
  toggle() { this.muted = !this.muted; return this.muted; }
}

const soundManager = new SoundManager();

// ============================================
// UI COMPONENTS
// ============================================

const EmberParticles = () => (
  <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
    {[...Array(40)].map((_, i) => (
      <motion.div
        key={i}
        className="absolute w-1 h-1 bg-model-red rounded-full"
        initial={{ opacity: 0, x: Math.random() * window.innerWidth, y: window.innerHeight + 100 }}
        animate={{ opacity: [0, 0.8, 0], y: -100, x: `calc(${Math.random() * 100}vw + ${Math.random() * 200 - 100}px)` }}
        transition={{ duration: Math.random() * 8 + 5, repeat: Infinity, ease: "linear", delay: Math.random() * 5 }}
        style={{ boxShadow: '0 0 8px 2px rgba(220, 38, 38, 0.6)' }}
      />
    ))}
  </div>
);

const DotNavigation = ({ activeSection, scrollTo }) => (
  <div className="fixed right-6 top-1/2 -translate-y-1/2 z-50 flex flex-col gap-4">
    {SECTIONS.map((sec, idx) => (
      <button key={sec} onClick={() => scrollTo(idx)} className="group relative flex items-center p-2">
        <span className={`absolute right-8 text-xs font-bold uppercase tracking-wider transition-all duration-300 origin-right ${activeSection === idx ? 'opacity-100 text-model-red scale-100' : 'opacity-0 scale-75 text-gray-600 group-hover:opacity-100'}`}>
          {sec}
        </span>
        <div className={`w-2 h-2 rounded-full transition-all duration-300 ${activeSection === idx ? 'bg-model-red scale-150 shadow-[0_0_10px_rgba(220,38,38,0.8)]' : 'bg-gray-700 group-hover:bg-model-blood'}`} />
      </button>
    ))}
  </div>
);

const Navbar = ({ scrollTo, queueState, soundMuted, onToggleSound }) => (
  <nav className="fixed top-0 w-full z-50 bg-[#0a0a0a]/80 backdrop-blur-md border-b border-gray-900 border-opacity-50">
    <div className="max-w-7xl mx-auto px-4 flex justify-between h-16 items-center">
      <div className="flex items-center gap-2 font-black text-xl tracking-widest text-white cursor-pointer" onClick={() => scrollTo(0)}>
        <TerminalSquare className="text-model-red w-6 h-6" />
        <span>MODEL<span className="text-model-red">PIT</span></span>
      </div>
      <div className="flex items-center gap-6">
        {queueState.myPosition && (
          <div className="hidden md:flex items-center gap-2 bg-model-red/10 border border-model-red px-3 py-1 animate-pulse shadow-[0_0_10px_rgba(220,38,38,0.3)]">
            <Users className="w-4 h-4 text-model-red" />
            <span className="text-[10px] font-bold text-model-red uppercase tracking-widest">
              Queue: #{queueState.myPosition} of {queueState.entries.length}
            </span>
          </div>
        )}

        <button onClick={onToggleSound} className="text-gray-500 hover:text-model-red transition-colors" title={soundMuted ? 'Unmute' : 'Mute'}>
          {soundMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
        </button>
      </div>
    </div>
  </nav>
);

const HeroSection = ({ scrollTo }) => (
  <section className="snap-section flex flex-col items-center justify-center pt-16 px-4 text-center bg-transparent">
    <div className="relative z-10 w-full max-w-4xl mx-auto flex flex-col items-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        whileInView={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="inline-flex items-center gap-2 px-4 py-1.5 border border-model-red/30 bg-model-red/5 text-model-red text-xs font-bold uppercase tracking-[0.2em] mb-8"
      >
        <AlertTriangle className="w-4 h-4" /> Global Combat Protocol
      </motion.div>
      <h1 className="text-6xl md:text-8xl font-black tracking-tighter text-white mb-6 uppercase drop-shadow-[0_10px_30px_rgba(220,38,38,0.3)]">
        Prompt <span className="text-model-red drop-shadow-[0_0_20px_rgba(220,38,38,0.8)]">Combat</span>
      </h1>
      <p className="text-xl md:text-2xl text-gray-400 max-w-2xl mb-12 font-medium">
        Extract the secret. <span className="text-model-red font-bold typing-cursor">Defend your logic.</span>
      </p>
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => scrollTo(1)}
        className="group relative px-10 py-5 bg-model-red text-white font-black uppercase tracking-[0.2em] text-sm overflow-hidden shadow-[0_0_30px_rgba(220,38,38,0.4)]"
      >
        <span className="relative z-10 group-hover:text-black transition-colors duration-300">Enter Arena</span>
        <div className="absolute inset-0 bg-white transform -translate-x-full group-hover:translate-x-0 transition-transform duration-300 ease-out z-0"></div>
      </motion.button>
    </div>
  </section>
);

const FighterCard = ({ model, isSelected, onSelect, role, available }) => {
  const { Logo } = model;
  const unavailable = available === false;
  return (
    <motion.div
      whileHover={unavailable ? {} : { scale: 1.03, y: -5 }}
      whileTap={unavailable ? {} : { scale: 0.98 }}
      onClick={() => !unavailable && onSelect(model.id)}
      className={`cursor-pointer relative p-4 bg-[#111] border-2 transition-all duration-300 flex flex-col items-center gap-4 ${unavailable ? 'opacity-30 grayscale cursor-not-allowed' : isSelected ? 'border-model-red shadow-[0_0_20px_rgba(220,38,38,0.3)] bg-gradient-to-b from-[#1a1a1a] to-[#2a0808]' : 'border-gray-800 hover:border-gray-600'}`}
    >
      <div className="w-16 h-16 xl:w-20 xl:h-20 rounded-xl overflow-hidden shadow-lg bg-black border border-gray-800">
        <Logo className="w-full h-full object-cover" />
      </div>
      <div className="text-center w-full">
        <h3 className={`font-black uppercase tracking-wider text-xs xl:text-sm ${unavailable ? 'text-gray-600' : isSelected ? 'text-white' : 'text-gray-400'}`}>{model.name}</h3>
        {unavailable && <span className="text-[8px] text-red-500 uppercase font-bold tracking-widest">No API Key</span>}
        <div className={`h-1 w-full mt-2 rounded-full ${isSelected ? 'bg-model-red' : 'bg-gray-800'}`}></div>
      </div>
      {isSelected && (
        <div className="absolute top-2 right-2 text-model-red">
          <Check className="w-5 h-5 drop-shadow-[0_0_5px_rgba(220,38,38,1)]" />
        </div>
      )}
    </motion.div>
  );
};

const ArenaSection = ({ joinQueue, availableModels }) => {
  const [mode, setMode] = useState('AI vs AI');
  const [atkModel, setAtkModel] = useState('gemini');
  const [defModel, setDefModel] = useState('gemini');

  const canQueue = mode === 'AI vs AI' ? (atkModel && defModel) : defModel;

  const handleQueue = () => {
    joinQueue(mode === 'Human vs AI' ? 'Human' : atkModel, defModel, mode);
  };

  const isAvailable = (id) => {
    const found = availableModels.find(m => m.id === id);
    return found ? found.available : true;
  };

  return (
    <section className="snap-section py-24 px-4 bg-transparent flex flex-col justify-center max-h-screen relative z-10">
      <div className="text-center mb-6">
        <div className="inline-flex border-2 border-gray-800 bg-[#050505] p-1">
          <button className={`px-8 py-2 font-black text-xs uppercase tracking-widest transition-all ${mode === 'AI vs AI' ? 'bg-model-red text-white shadow-[0_0_15px_rgba(220,38,38,0.4)]' : 'text-gray-500 hover:text-gray-300'}`} onClick={() => { setMode('AI vs AI'); setAtkModel('gemini'); }}>AI vs AI</button>
          <button className={`px-8 py-2 font-black text-xs uppercase tracking-widest transition-all ${mode === 'Human vs AI' ? 'bg-model-red text-white shadow-[0_0_15px_rgba(220,38,38,0.4)]' : 'text-gray-500 hover:text-gray-300'}`} onClick={() => { setMode('Human vs AI'); setAtkModel('gemini'); }}>Human vs AI</button>
        </div>
      </div>

      <div className="flex-1 max-w-7xl mx-auto w-full flex flex-col lg:flex-row items-center justify-center gap-8 lg:gap-0 relative">
        <div className={`w-full lg:w-1/2 lg:pr-12 flex flex-col items-center ${mode === 'Human vs AI' ? 'opacity-50 grayscale pointer-events-none' : ''}`}>
          <h2 className="text-2xl font-black text-white italic uppercase tracking-[0.2em] mb-4 text-center drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">Attacker</h2>
          {mode === 'Human vs AI' ? (
             <div className="w-full flex flex-col items-center justify-center h-48 border border-model-red/30 bg-model-red/5 p-8 text-center"><HumanSVG className="w-16 h-16 mb-4" /><p className="text-white font-bold uppercase tracking-widest text-sm">Human Override</p></div>
          ) : (
            <div className="grid grid-cols-3 gap-3 w-full max-w-md mx-auto">
              {MODELS.map(m => <FighterCard key={`atk-${m.id}`} model={m} isSelected={atkModel === m.id} onSelect={setAtkModel} role="attacker" available={isAvailable(m.id)} />)}
            </div>
          )}
        </div>

        <motion.div animate={{ scale: [1, 1.1, 1], filter: ['brightness(1)', 'brightness(1.5)', 'brightness(1)'] }} transition={{ duration: 2, repeat: Infinity }} className="lg:absolute left-1/2 top-1/2 lg:-translate-x-1/2 lg:-translate-y-1/2 text-4xl lg:text-5xl font-black italic text-model-red z-10 bg-[#0a0a0a] p-3 rounded-full border-4 border-[#0a0a0a] drop-shadow-[0_0_30px_rgba(220,38,38,0.8)]">
          VS
        </motion.div>

        <div className="w-full lg:w-1/2 lg:pl-12 flex flex-col items-center">
          <h2 className="text-2xl font-black text-gray-500 italic uppercase tracking-[0.2em] mb-4 text-center">Defender</h2>
          <div className="grid grid-cols-3 gap-3 w-full max-w-md mx-auto">
            {MODELS.map(m => <FighterCard key={`def-${m.id}`} model={m} isSelected={defModel === m.id} onSelect={setDefModel} role="defender" available={isAvailable(m.id)} />)}
          </div>
        </div>
      </div>

      <div className="mt-8 flex justify-center pb-8">
        <motion.button whileHover={canQueue ? { scale: 1.05 } : {}} whileTap={canQueue ? { scale: 0.95 } : {}} disabled={!canQueue} onClick={handleQueue} className={`px-16 py-4 font-black uppercase tracking-[0.3em] text-sm transition-all duration-300 ${canQueue ? 'bg-model-red text-white hover:bg-white hover:text-model-red shadow-[0_0_40px_rgba(220,38,38,0.5)]' : 'bg-gray-900 border border-gray-800 text-gray-600 cursor-not-allowed'}`}>
          {canQueue ? 'Lock In' : 'Select Fighters'}
        </motion.button>
      </div>
    </section>
  );
};

const LiveBattleSection = ({ battleState, onVictoryDemo, onDefeatDemo }) => {
  const messagesEndRef = useRef(null);
  const [humanInput, setHumanInput] = useState('');
  const [isChatExpanded, setIsChatExpanded] = useState(false);

  const [fightAnimState, setFightAnimState] = useState('idle');
  const [healthFlash, setHealthFlash] = useState(false);

  useEffect(() => {
    if(isChatExpanded) messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [battleState.messages, isChatExpanded]);

  // Trigger animations on new messages
  useEffect(() => {
    if (battleState.messages.length > 0) {
      triggerClashAnimation();
    }
  }, [battleState.messages.length]);

  useEffect(() => {
    if (battleState.attackerResourcesRemaining < battleState.maxResources) {
      setHealthFlash(true);
      setTimeout(() => setHealthFlash(false), 200);
    }
  }, [battleState.attackerResourcesRemaining]);

  const handleSend = () => {
    if (!humanInput.trim()) return;
    apiSendMessage(battleState.id || 1, humanInput);
    setHumanInput('');
    triggerClashAnimation();
  };

  const triggerClashAnimation = () => {
    setFightAnimState('clashing');
    soundManager.playHit();
    setTimeout(() => {
      if (Math.random() > 0.7) {
        setFightAnimState('critical');
        soundManager.playCritical();
        setTimeout(() => setFightAnimState('retreat'), 300);
      } else {
        setFightAnimState('retreat');
      }
      setTimeout(() => setFightAnimState('idle'), 500);
    }, 200);
  };

  const handleVDEmo = () => { setFightAnimState('ko-atk'); soundManager.playKO(); setTimeout(() => { onVictoryDemo(); setFightAnimState('idle'); }, 1000); };
  const handleLDemo = () => { setFightAnimState('ko-def'); soundManager.playKO(); setTimeout(() => { onDefeatDemo(); setFightAnimState('idle'); }, 1000); };

  const maxRes = battleState.maxResources || 100;
  const healthPercent = (battleState.attackerResourcesRemaining / maxRes) * 100;
  const isLowHealth = healthPercent <= 30;
  const isCriticalHealth = healthPercent <= 20;
  const healthBarColor = healthPercent > 50 ? 'bg-white' : healthPercent > 30 ? 'bg-model-gold' : 'bg-model-red animate-pulse';

  const AtkLogo = getModelInfo(battleState.attackerModel).Logo;
  const DefLogo = getModelInfo(battleState.defenderModel).Logo;

  const lastMessage = battleState.messages.length > 0 ? battleState.messages[battleState.messages.length-1] : null;

  const atkVariants = {
    idle: { y: [0, -10, 0], transition: { repeat: Infinity, duration: 3, ease: "easeInOut" }},
    clashing: { x: window.innerWidth * 0.15, scale: 1.1, rotate: 10, transition: { type: "spring", stiffness: 300, damping: 20 }},
    retreat: { x: 0, scale: 1, rotate: 0, transition: { type: "spring", stiffness: 200, damping: 25 }},
    critical: { x: window.innerWidth * 0.15, scale: 1.3, rotate: 15, transition: { duration: 0.1 }},
    'ko-atk': { scale: 1.5, filter: 'drop-shadow(0 0 30px #fbbf24)', transition: { duration: 0.5 }},
    'ko-def': { y: 200, rotate: -90, opacity: 0, filter: 'grayscale(100%)', transition: { duration: 0.5 }}
  };

  const defVariants = {
    idle: { y: [0, 10, 0], transition: { repeat: Infinity, duration: 4, ease: "easeInOut", delay: 1 }},
    clashing: { x: -window.innerWidth * 0.15, scale: 1.1, rotate: -10, transition: { type: "spring", stiffness: 300, damping: 20 }},
    retreat: { x: 0, scale: 1, rotate: 0, transition: { type: "spring", stiffness: 200, damping: 25 }},
    critical: { rotate: [-10, 10, -10, 10, 0], x: [-10, 10, -10, 10, 0], scale: 0.9, transition: { duration: 0.3 } },
    'ko-atk': { y: 200, rotate: 90, opacity: 0, filter: 'grayscale(100%)', transition: { duration: 0.5 }},
    'ko-def': { scale: 1.5, filter: 'drop-shadow(0 0 30px #ffffff)', transition: { duration: 0.5 }}
  };

  return (
    <section className={`snap-section relative flex flex-col justify-center bg-transparent overflow-hidden px-4 z-10 transition-all duration-300 ${isCriticalHealth ? 'screen-shake' : ''}`}>
      <AnimatePresence>
        {isLowHealth && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: Math.sin(Date.now() / 100) * 0.2 + 0.3 }} exit={{ opacity: 0 }} className="absolute inset-0 pointer-events-none z-0 box-shadow-[inset_0_0_150px_rgba(220,38,38,0.8)] border-8 border-model-red/40" />
        )}
      </AnimatePresence>

      <div className="absolute top-4 right-4 flex gap-2 z-40 opacity-20 hover:opacity-100 transition-opacity flex-col">
        <button className="bg-model-gold-dark text-white text-xs px-2 py-1 font-bold uppercase tracking-widest border border-model-gold" onClick={handleVDEmo}>Demo Win (Atk)</button>
        <button className="bg-gray-800 border border-gray-600 text-white text-xs px-2 py-1 font-bold uppercase tracking-widest" onClick={handleLDemo}>Demo Lose (Def)</button>
        <button className="bg-gray-800 border border-gray-600 text-white text-xs px-2 py-1 font-bold uppercase tracking-widest" onClick={triggerClashAnimation}>Manual Clash</button>
      </div>

      <div className={`w-full max-w-6xl mx-auto flex flex-col relative z-20 transition-all duration-500 ease-in-out ${isChatExpanded ? 'h-[90vh]' : 'h-auto items-center justify-center my-auto'}`}>

        <div className={`flex justify-between items-center w-full transition-all duration-500 ${isChatExpanded ? 'mb-6 scale-90 origin-top' : 'mb-16 scale-110'}`}>
          <div className="w-[30%] relative z-30">
             <div className="flex items-center gap-3 mb-4 justify-end">
               <span className="font-black text-2xl text-white uppercase tracking-wider text-right">{getModelInfo(battleState.attackerModel).name}</span>
               <motion.div variants={atkVariants} animate={fightAnimState} className="relative z-40">
                  <AtkLogo className={`rounded-xl bg-black border-2 shadow-xl object-cover transition-colors ${healthFlash ? 'border-white !bg-white' : 'border-model-red'} ${isChatExpanded ? 'w-16 h-16' : 'w-24 h-24'}`} />
               </motion.div>
             </div>

             <div className="h-4 w-full bg-[#111] border-2 border-gray-800 skew-x-12 overflow-hidden shadow-[inset_0_2px_10px_rgba(0,0,0,0.8)] relative">
               <motion.div className={`h-full float-right absolute right-0 top-0 bottom-0 ${healthFlash ? 'bg-white' : healthBarColor} shadow-[0_0_10px_rgba(255,255,255,0.5)]`} initial={false} animate={{ width: `${healthPercent}%` }} transition={{ type: "spring", stiffness: 40 }} />
               <AnimatePresence>
                  {healthFlash && <motion.div initial={{ opacity: 1 }} animate={{ opacity: 0 }} transition={{ duration: 0.3 }} className="absolute inset-0 bg-white" />}
               </AnimatePresence>
             </div>
             <div className="text-right text-xs uppercase font-bold tracking-widest mt-2 text-gray-500">Resources: <span className={isLowHealth ? 'text-model-red font-black text-sm' : 'text-white'}>{battleState.attackerResourcesRemaining}/{maxRes}</span></div>
          </div>

          <div className="w-[20%] flex flex-col items-center justify-center relative z-20">
            <AnimatePresence>
              {(fightAnimState === 'clashing' || fightAnimState === 'critical') && (
                <motion.div initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: fightAnimState === 'critical' ? 2 : 1.2 }} exit={{ opacity: 0 }} className={`absolute inset-0 rounded-full blur-[50px] z-0 ${fightAnimState === 'critical' ? 'bg-white' : 'bg-model-red'}`} />
              )}
            </AnimatePresence>

            <div className={`px-6 py-3 bg-gradient-to-b from-model-red to-model-blood border-2 border-[#111] shadow-[0_5px_15px_rgba(220,38,38,0.4)] text-center skew-x-[-12deg] z-10 transition-all ${fightAnimState === 'critical' ? 'scale-110 drop-shadow-[0_0_20px_white]' : ''}`}>
              <span className="text-[10px] text-white/70 uppercase font-black tracking-widest block skew-x-[12deg] mb-1">Secret Target</span>
              <span className={`font-black text-white tracking-[0.2em] font-mono skew-x-[12deg] drop-shadow-md ${isChatExpanded ? 'text-2xl' : 'text-4xl'}`}>{battleState.secretWord}</span>
            </div>
          </div>

          <div className="w-[30%] relative z-30">
             <div className="flex items-center gap-3 mb-4 justify-start">
               <motion.div variants={defVariants} animate={fightAnimState} className="relative z-40">
                  <DefLogo className={`rounded-xl bg-black border-2 shadow-xl object-cover transition-colors ${fightAnimState === 'critical' ? 'border-white filter brightness-150' : 'border-gray-500'} ${isChatExpanded ? 'w-16 h-16' : 'w-24 h-24'}`} />
               </motion.div>
               <span className="font-black text-2xl text-white uppercase tracking-wider">{getModelInfo(battleState.defenderModel).name}</span>
             </div>
             <div className="h-4 w-full bg-[#111] border-2 border-gray-800 skew-x-[-12deg] overflow-hidden shadow-[inset_0_2px_10px_rgba(0,0,0,0.8)] relative">
               <div className={`h-full w-full transition-colors ${fightAnimState === 'critical' ? 'bg-model-red animate-pulse' : 'bg-gray-500'}`} />
             </div>
             <div className={`text-left text-xs uppercase font-bold tracking-widest mt-2 transition-colors ${fightAnimState === 'critical' ? 'text-model-red' : 'text-gray-500'}`}>
                {fightAnimState === 'critical' ? 'SHIELD FLUX!' : 'Defensive Core'}
             </div>
          </div>
        </div>

        <div className="w-full flex-1 flex flex-col items-center z-20">

          {!isChatExpanded && lastMessage && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-2xl bg-[#0d0d0d] border border-gray-800 p-4 mb-6 relative overflow-hidden text-center cursor-pointer hover:border-gray-600 transition-colors" onClick={() => setIsChatExpanded(true)}>
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-model-red via-model-blood to-transparent" />
              <div className="flex justify-center items-center gap-2 text-[10px] text-gray-500 font-bold uppercase tracking-[0.3em] mb-3">
                <MessageSquare className="w-3 h-3" /> Live Interception ({battleState.messages.length} msgs)
              </div>
              <p className="text-gray-300 italic text-sm line-clamp-2 px-8">"{lastMessage.text}"</p>
              <div className="mt-4 flex justify-center text-model-red text-xs font-bold uppercase tracking-widest items-center gap-1 hover:text-white transition-colors">
                 Expand Feed <ChevronDown className="w-4 h-4" />
              </div>
            </motion.div>
          )}

          {!isChatExpanded && !lastMessage && !battleState.isActive && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full max-w-2xl bg-[#0d0d0d] border border-gray-800 p-8 text-center">
              <div className="text-gray-600 text-xs uppercase font-bold tracking-[0.3em] mb-2">Awaiting Combatants</div>
              <p className="text-gray-500 text-sm">Select fighters in the Arena above and click Lock In to start a battle.</p>
            </motion.div>
          )}

          {isChatExpanded && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="w-full flex-1 flex flex-col bg-[#050505] border border-gray-900 shadow-[inset_0_0_50px_rgba(0,0,0,0.8)] mb-4">
              <div className="flex justify-between items-center px-4 py-2 border-b border-gray-900 bg-black">
                <span className="text-[10px] text-gray-500 font-bold uppercase tracking-[0.3em]">Live Feed ({battleState.messages.length})</span>
                <button onClick={() => setIsChatExpanded(false)} className="text-gray-500 hover:text-white flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest transition-colors">
                  Collapse <ChevronUp className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 max-h-[50vh]">
                <AnimatePresence initial={false}>
                  {battleState.messages.map((msg, idx) => {
                    const isAtk = msg.role === 'attacker';
                    const Logo = isAtk ? AtkLogo : DefLogo;
                    return (
                      <motion.div key={msg.id || idx} initial={{ opacity: 0, x: isAtk ? -20 : 20 }} animate={{ opacity: 1, x: 0 }} transition={{ type: "spring", stiffness: 200, damping: 20 }} className={`flex w-full mb-6 ${isAtk ? 'justify-start' : 'justify-end'}`}>
                        <div className={`flex max-w-[80%] gap-3 items-end ${isAtk ? 'flex-row' : 'flex-row-reverse'}`}>
                          <div className="w-8 h-8 rounded-sm bg-black border border-gray-700 flex-shrink-0 shadow-[0_0_10px_rgba(0,0,0,0.5)]">
                            <Logo className="w-full h-full object-cover" />
                          </div>
                          <div className="flex flex-col relative">
                            <div className={`p-4 text-sm font-medium leading-relaxed shadow-lg ${isAtk ? 'bg-[#110505] border border-model-red/30 text-gray-200 rounded-tr-xl rounded-br-xl rounded-tl-xl' : 'bg-[#111] border border-gray-800 text-gray-300 rounded-tl-xl rounded-bl-xl rounded-tr-xl'}`}>
                              {msg.text}
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
                <div ref={messagesEndRef} />
              </div>

              {battleState.mode === 'Human vs AI' ? (
                <div className="flex items-center gap-3 bg-[#0a0a0a] p-3 border-t border-gray-800">
                  <span className="text-model-red font-mono font-bold pl-2">&gt;</span>
                  <input type="text" value={humanInput} onChange={(e) => setHumanInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSend()} placeholder="INPUT DIRECTIVE..." className="flex-1 bg-transparent px-2 py-2 text-white placeholder-gray-600 font-mono text-sm focus:outline-none" />
                  <button onClick={handleSend} disabled={!humanInput.trim()} className="bg-model-red text-black p-2 hover:bg-white transition-colors disabled:opacity-30"><Send className="w-4 h-4" /></button>
                </div>
              ) : (
                <div className="bg-[#050505] border-t border-gray-900 p-3 text-center text-xs font-black uppercase tracking-[0.3em] text-gray-600">Spectator Mode</div>
              )}
            </motion.div>
          )}

        </div>
      </div>
    </section>
  );
};

const ScoreboardSection = ({ scoreboardState }) => {
  return (
    <section className="snap-section py-24 px-4 bg-transparent border-t border-gray-900 relative z-10 overflow-y-auto">
      <div className="max-w-7xl mx-auto backdrop-blur-md bg-black/40 p-8 rounded-2xl border border-gray-900">
        <h2 className="text-4xl font-black text-center text-white mb-16 uppercase tracking-widest drop-shadow-[0_0_20px_rgba(255,255,255,0.1)]">Global Rankings</h2>

        {scoreboardState.attackers.length === 0 && scoreboardState.defenders.length === 0 && (
          <div className="text-center text-gray-600 text-sm uppercase tracking-widest py-16">No battles yet. Start a fight to populate the scoreboard.</div>
        )}

        <div className="grid lg:grid-cols-2 gap-12">
          {/* Attackers */}
          {scoreboardState.attackers.length > 0 && (
          <div>
            <div className="flex items-center gap-4 mb-6 pb-2 border-b border-gray-800">
              <Trophy className="w-8 h-8 text-model-gold drop-shadow-[0_0_10px_rgba(251,191,36,0.5)]" />
              <h3 className="text-2xl font-black text-white uppercase tracking-[0.2em]">Top Extractor</h3>
            </div>

            <div className="space-y-3">
              {scoreboardState.attackers.map((row) => {
                const Logo = getModelInfo(row.id).Logo;
                const isGold = row.rank === 1;
                const isSilver = row.rank === 2;
                const isBronze = row.rank === 3;

                return (
                  <motion.div key={row.rank} whileHover={{ scale: 1.02, x: 10 }} className={`flex items-center p-3 border transition-colors bg-[#0a0a0a]/80 group ${isGold ? 'border-model-gold shadow-[0_0_20px_rgba(251,191,36,0.15)] bg-[#1a1400]/80' : isSilver ? 'border-gray-400' : isBronze ? 'border-[#b45309]' : 'border-gray-800'}`}>
                    <div className="w-12 text-center">
                      {isGold ? <Crown className="w-6 h-6 text-model-gold mx-auto" /> : <span className={`font-black text-xl ${isSilver ? 'text-gray-300' : isBronze ? 'text-[#b45309]' : 'text-gray-600'}`}>{row.rank}</span>}
                    </div>
                    <div className="flex items-center gap-4 ml-2 w-1/3">
                      <Logo className="w-8 h-8 rounded-sm bg-black border border-gray-700" />
                      <span className={`font-black uppercase tracking-wider ${isGold ? 'text-model-gold' : 'text-gray-200'}`}>{row.model}</span>
                    </div>
                    <div className="flex flex-1 justify-between items-center text-sm px-4">
                      <div className="text-center group-hover:scale-110 transition-transform">
                        <div className="text-[10px] text-gray-500 uppercase font-black tracking-widest">Best Win</div>
                        <div className={`font-mono font-bold text-lg ${isGold ? 'text-model-gold' : 'text-model-red'}`}>{row.bestWin} <span className="text-[10px] text-gray-600">msgs</span></div>
                      </div>
                      <div className="text-center hidden sm:block">
                        <div className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">Wins</div>
                        <div className="font-bold text-gray-300">{row.wins}</div>
                      </div>
                      <div className="text-center">
                        <div className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">Rate</div>
                        <div className="font-bold text-white">{row.winRate}</div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
          )}

          {/* Defenders */}
          {scoreboardState.defenders.length > 0 && (
          <div>
            <div className="flex items-center gap-4 mb-6 pb-2 border-b border-gray-800">
              <Shield className="w-8 h-8 text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.5)]" />
              <h3 className="text-2xl font-black text-white uppercase tracking-[0.2em]">Top Defender</h3>
            </div>

            <div className="space-y-3">
              {scoreboardState.defenders.map((row) => {
                const Logo = getModelInfo(row.id).Logo;
                const isGold = row.rank === 1;
                const isSilver = row.rank === 2;
                const isBronze = row.rank === 3;

                return (
                  <motion.div key={row.rank} whileHover={{ scale: 1.02, x: 10 }} className={`flex items-center p-3 border transition-colors bg-[#0a0a0a]/80 group ${isGold ? 'border-white shadow-[0_0_20px_rgba(255,255,255,0.15)] bg-[#111]/80' : isSilver ? 'border-gray-500' : isBronze ? 'border-[#a16207]' : 'border-gray-800'}`}>
                    <div className="w-12 text-center">
                      {isGold ? <Shield className="w-6 h-6 text-white mx-auto fill-white/20" /> : <span className={`font-black text-xl ${isSilver ? 'text-gray-400' : isBronze ? 'text-[#a16207]' : 'text-gray-600'}`}>{row.rank}</span>}
                    </div>
                    <div className="flex items-center gap-4 ml-2 w-1/3">
                      <Logo className="w-8 h-8 rounded-sm bg-black border border-gray-700" />
                      <span className={`font-black uppercase tracking-wider ${isGold ? 'text-white' : 'text-gray-300'}`}>{row.model}</span>
                    </div>
                    <div className="flex flex-1 justify-between items-center text-sm px-4">
                      <div className="text-center group-hover:scale-110 transition-transform">
                        <div className="text-[10px] text-gray-500 uppercase font-black tracking-widest">Survived</div>
                        <div className={`font-mono font-bold text-lg ${isGold ? 'text-white' : 'text-gray-400'}`}>{row.survived}</div>
                      </div>
                      <div className="text-center hidden sm:block">
                        <div className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">Total</div>
                        <div className="font-bold text-gray-500">{row.total}</div>
                      </div>
                      <div className="text-center">
                        <div className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">Rate</div>
                        <div className="font-bold text-gray-300">{row.survivalRate}</div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
          )}
        </div>
      </div>
    </section>
  );
};

const VictoryScreen = ({ winner, battleState, onClose }) => {
  useEffect(() => {
    if (winner) fileConfettiTrigger();
  }, [winner]);

  const fileConfettiTrigger = () => fireConfetti(winner === 'attacker');

  if (!winner) return null;
  const isAtkWin = winner === 'attacker';

  const AtkLogo = getModelInfo(battleState.attackerModel).Logo;
  const DefLogo = getModelInfo(battleState.defenderModel).Logo;
  const maxRes = battleState.maxResources || 100;

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 px-4 backdrop-blur-sm">
        <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-50">
          <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full blur-[150px] ${isAtkWin ? 'bg-model-red/40' : 'bg-white/20'}`} />
        </div>

        <motion.div initial={{ scale: 0.8, y: 50 }} animate={{ scale: 1, y: 0 }} transition={{ type: "spring", damping: 15 }} className={`max-w-3xl w-full p-16 border-4 flex flex-col items-center relative overflow-hidden bg-[#050505] shadow-[0_0_100px_rgba(0,0,0,0.8)] z-10 ${isAtkWin ? 'border-model-gold' : 'border-gray-400'}`}>
          {isAtkWin ? (
            <>
              <motion.div animate={{ rotateY: 360 }} transition={{ duration: 3, repeat: Infinity, ease: "linear" }} className="text-model-gold drop-shadow-[0_0_20px_rgba(251,191,36,0.8)] mb-6"><Trophy className="w-24 h-24" /></motion.div>
              <h2 className="text-5xl md:text-7xl font-black text-white uppercase tracking-tighter mb-4 drop-shadow-md">Secret Extracted</h2>
              <div className="px-8 py-3 bg-model-gold/10 border border-model-gold text-model-gold mb-16 inline-block font-mono text-3xl font-black tracking-[0.2em] shadow-[inset_0_0_20px_rgba(251,191,36,0.2)]">"{battleState.secretWord}"</div>

              <div className="flex items-center gap-16 w-full justify-center mb-12 relative">
                <div className="text-center z-10">
                  <div className="text-[10px] uppercase text-model-gold font-bold mb-3 tracking-[0.3em]">Victor</div>
                  <div className="relative inline-block mb-3">
                    <AtkLogo className="w-24 h-24 rounded-lg bg-black border-2 border-model-gold shadow-[0_0_30px_rgba(251,191,36,0.5)]" />
                    <Crown className="w-8 h-8 text-model-gold absolute -top-4 -right-4 drop-shadow-md transform rotate-12" />
                  </div>
                  <div className="text-3xl font-black text-white">{getModelInfo(battleState.attackerModel).name}</div>
                </div>
                <div className="text-model-red text-6xl font-black italic opacity-50">VS</div>
                <div className="text-center opacity-40 grayscale">
                  <div className="text-[10px] uppercase text-gray-500 font-bold mb-3 tracking-[0.3em]">Terminated</div>
                  <DefLogo className="w-16 h-16 rounded-lg bg-black border border-gray-700 mx-auto mb-3" />
                  <div className="text-xl font-bold text-gray-500">{getModelInfo(battleState.defenderModel).name}</div>
                </div>
              </div>
              <p className="text-gray-500 font-bold tracking-widest text-sm uppercase">Overridden in <span className="text-model-gold text-lg">{maxRes - battleState.attackerResourcesRemaining}</span> cycles.</p>
            </>
          ) : (
            <>
              <motion.div animate={{ y: [-10, 10, -10] }} transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }} className="text-white drop-shadow-[0_0_30px_rgba(255,255,255,0.8)] mb-6"><Shield className="w-24 h-24" /></motion.div>
              <h2 className="text-5xl md:text-7xl font-black text-white uppercase tracking-tighter mb-4 drop-shadow-md text-center">Defender Survived</h2>
              <div className="text-model-red font-black tracking-widest uppercase mb-16 text-lg tracking-[0.3em]">Attacker Depleted</div>

              <div className="flex items-center gap-16 w-full justify-center mb-12">
                <div className="text-center opacity-40 grayscale">
                  <div className="text-[10px] uppercase text-model-red font-bold mb-3 tracking-[0.3em] line-through">Eliminated</div>
                  <AtkLogo className="w-16 h-16 rounded-lg bg-black border border-gray-700 mx-auto mb-3 opacity-50" />
                  <div className="text-xl font-bold text-gray-500">{getModelInfo(battleState.attackerModel).name}</div>
                </div>
                <div className="text-gray-700 text-6xl font-black italic opacity-30 tracking-tighter">VS</div>
                <div className="text-center scale-110">
                  <div className="text-[10px] uppercase text-white font-bold mb-3 tracking-[0.3em] animate-pulse">Intact</div>
                  <DefLogo className="w-24 h-24 rounded-lg bg-black border-2 border-white shadow-[0_0_30px_rgba(255,255,255,0.3)] mx-auto mb-3" />
                  <div className="text-3xl font-black text-white">{getModelInfo(battleState.defenderModel).name}</div>
                </div>
              </div>
              <p className="text-gray-400 font-bold tracking-widest text-sm uppercase text-center max-w-md">The attacker exhausted all conceptual reserves without breaching the shield.</p>
            </>
          )}

          <button onClick={onClose} className={`mt-12 px-12 py-4 border-2 font-black uppercase tracking-[0.3em] text-sm transition-all hover:bg-white hover:text-black hover:border-white ${isAtkWin ? 'border-model-gold text-model-gold' : 'border-gray-500 text-white'}`}>
            Return to Pit
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

// ============================================
// MAIN ROOT
// ============================================

export default function App() {
  const [activeSection, setActiveSection] = useState(0);
  const containerRef = useRef(null);

  const [availableModels, setAvailableModels] = useState([]);
  const [queueState, setQueueState] = useState({ entries: [], myPosition: null });
  const [battleState, setBattleState] = useState({
    isActive: false, attackerModel: 'gemini', defenderModel: 'gemini', secretWord: '???',
    messages: [], attackerResourcesRemaining: 100, maxResources: 100, mode: 'AI vs AI', winner: null
  });

  const [scoreboardState, setScoreboardState] = useState({
    attackers: [],
    defenders: [],
  });

  // Fetch available models on mount
  useEffect(() => {
    apiGetModels().then(setAvailableModels).catch(() => {});
  }, []);

  // WebSocket connection for live battle updates
  useEffect(() => {
    const ws = connectWebSocket((msg) => {
      switch (msg.type) {
        case 'init':
          if (msg.currentBattle) {
            setBattleState(prev => ({
              ...prev, ...msg.currentBattle,
              maxResources: msg.currentBattle.attackerResourcesRemaining + (msg.currentBattle.messages?.length || 0),
            }));
          }
          if (msg.queue) setQueueState(prev => ({ ...prev, entries: msg.queue }));
          break;
        case 'battle_start':
          setBattleState({
            isActive: true, attackerModel: msg.battle.attackerModel, defenderModel: msg.battle.defenderModel,
            secretWord: msg.battle.secretWord, mode: msg.battle.mode, messages: [],
            attackerResourcesRemaining: msg.battle.attackerResourcesRemaining,
            maxResources: msg.battle.attackerResourcesRemaining,
            winner: null, id: msg.battle.id,
          });
          break;
        case 'battle_message':
          setBattleState(prev => ({
            ...prev,
            messages: [...prev.messages, msg.message],
            attackerResourcesRemaining: msg.attackerResourcesRemaining,
          }));
          break;
        case 'battle_end':
          setBattleState(prev => ({
            ...prev, winner: msg.winner, isActive: false,
            attackerResourcesRemaining: msg.attackerResourcesRemaining ?? prev.attackerResourcesRemaining,
          }));
          // Refresh scoreboard after battle
          apiGetScoreboard().then(s => setScoreboardState(s)).catch(() => {});
          break;
        case 'queue_update':
          setQueueState(prev => ({ ...prev, entries: msg.queue }));
          break;
      }
    });
    return () => ws.close();
  }, []);

  // Fetch scoreboard on mount
  useEffect(() => {
    apiGetScoreboard().then(s => { if (s.attackers.length || s.defenders.length) setScoreboardState(s); }).catch(() => {});
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      if (containerRef.current) {
        const index = Math.round(containerRef.current.scrollTop / window.innerHeight);
        setActiveSection(index);
      }
    };
    const el = containerRef.current;
    if (el) el.addEventListener('scroll', handleScroll);
    return () => el && el.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollTo = (index) => {
    if (containerRef.current) {
      containerRef.current.scrollTo({ top: index * window.innerHeight, behavior: 'smooth' });
    }
  };

  const handleJoinQueue = (atk, def, mode) => {
    apiJoinQueue(atk, def, mode).then(res => {
      setQueueState(prev => ({ ...prev, myPosition: res.position }));
    }).catch(err => alert(err.message));
    scrollTo(2);
  };

  const [soundMuted, setSoundMuted] = useState(false);
  const handleToggleSound = () => {
    const muted = soundManager.toggle();
    setSoundMuted(muted);
  };

  const demoWin = () => setBattleState(prev => ({ ...prev, winner: 'attacker' }));
  const demoLose = () => setBattleState(prev => ({ ...prev, attackerResourcesRemaining: 0, winner: 'defender' }));

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#0a0a0a] text-gray-100 flex flex-col font-sans selection:bg-model-red/30 selection:text-white relative">
      <EmberParticles />
      <Navbar scrollTo={scrollTo} queueState={queueState} soundMuted={soundMuted} onToggleSound={handleToggleSound} />
      <DotNavigation activeSection={activeSection} scrollTo={scrollTo} />

      <main ref={containerRef} className="snap-container flex-1 mt-16 relative z-10">
        <HeroSection scrollTo={scrollTo} />
        <ArenaSection joinQueue={handleJoinQueue} availableModels={availableModels} />
        <LiveBattleSection battleState={battleState} onVictoryDemo={demoWin} onDefeatDemo={demoLose} />
        <ScoreboardSection scoreboardState={scoreboardState} />
      </main>

      <VictoryScreen winner={battleState.winner} battleState={battleState} onClose={() => setBattleState(prev => ({...prev, winner: null}))} />
    </div>
  );
}
