
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Step, FeedbackData } from './types';
import { PERFORMANCE_ID, EMOTIONS, CAREERS, FIREBASE_CONFIG, GOOGLE_SHEETS_URL } from './constants';
import { Layout } from './components/Layout';
import { processVoiceFeedback } from './services/geminiService';
import { 
  createFeedbackSession, 
  updateFeedbackSession, 
  listenToAllFeedback 
} from './services/databaseService';
import { pushToGoogleSheets } from './services/syncService';

const App: React.FC = () => {
  const [currentStep, setCurrentStep] = useState<Step>(Step.LANDING);
  const [allFeedback, setAllFeedback] = useState<FeedbackData[]>([]);
  const [dbError, setDbError] = useState<string | null>(null);
  const [lastSheetSync, setLastSheetSync] = useState<number | null>(null);
  const [data, setData] = useState<FeedbackData>({
    id: '', 
    timestamp: Date.now(),
    emotion: null,
    memoryRecalled: null,
    voiceAudioBase64: null,
    career: null,
    performanceId: PERFORMANCE_ID,
    isSynced: false
  });

  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const tapRef = useRef({ count: 0, last: 0 });

  useEffect(() => {
    const isConfigPlaceholder = FIREBASE_CONFIG.apiKey === "REPLACE_WITH_YOUR_KEY";
    if (isConfigPlaceholder && !GOOGLE_SHEETS_URL) {
      setDbError("Setup Required: Configure Firebase or Google Sheets in constants.tsx");
      return;
    }

    const unsubscribe = listenToAllFeedback(
      (records) => {
        setAllFeedback(records);
        setDbError(null);
      },
      (error) => {
        if (error.code === 'permission-denied') {
          setDbError("Firestore Locked: Ensure Security Rules are published.");
        } else {
          setDbError(`DB Issue: ${error.message}`);
        }
      }
    );
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    let timeout: number;
    if (currentStep === Step.THANK_YOU) {
      timeout = window.setTimeout(() => resetApp(), 10000); 
    }
    return () => clearTimeout(timeout);
  }, [currentStep]);

  const resetApp = useCallback(() => {
    setCurrentStep(Step.LANDING);
    setData({
      id: '',
      timestamp: Date.now(),
      emotion: null,
      memoryRecalled: null,
      voiceAudioBase64: null,
      career: null,
      performanceId: PERFORMANCE_ID,
      isSynced: false
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const startNewSession = async () => {
    const newId = Math.random().toString(36).substr(2, 9);
    const initialData: FeedbackData = {
      id: newId,
      timestamp: Date.now(),
      emotion: null,
      memoryRecalled: null,
      voiceAudioBase64: null,
      career: null,
      performanceId: PERFORMANCE_ID,
      isSynced: false
    };
    
    setData(initialData);
    setCurrentStep(Step.EMOTION);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    
    try {
      await createFeedbackSession(initialData);
    } catch (e) {
      console.warn("Firestore unavailable, continuing local session.");
    }
  };

  const startRecording = async () => {
    try {
      const sessionID = data.id;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const options = { mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4' };
      const recorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        const recordedMimeType = recorder.mimeType;
        const blob = new Blob(chunksRef.current, { type: recordedMimeType });
        const reader = new FileReader();
        reader.readAsDataURL(blob);
        reader.onloadend = async () => {
          const base64 = (reader.result as string).split(',')[1];
          setData(prev => (prev.id === sessionID ? { ...prev, voiceAudioBase64: base64 } : prev));

          processVoiceFeedback(base64, recordedMimeType).then(transcription => {
            updateFeedbackSession(sessionID, { voiceAudioBase64: base64, aiTranscription: transcription });
            setData(prevData => (prevData.id === sessionID ? { ...prevData, aiTranscription: transcription } : prevData));
          });
        };
        stream.getTracks().forEach(track => track.stop());
      };

      recorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      timerRef.current = window.setInterval(() => {
        setRecordingTime(prev => {
          if (prev >= 29) { stopRecording(); return 30; }
          return prev + 1;
        });
      }, 1000);
    } catch (err) {
      console.error("Mic error:", err);
      alert("Microphone access is required for voice feedback.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
      setCurrentStep(Step.CAREER);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleEmotionSelect = (emotion: string) => {
    setData(prev => {
      updateFeedbackSession(prev.id, { emotion });
      return { ...prev, emotion };
    });
    setCurrentStep(Step.MEMORY_PROMPT);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleMemoryResponse = (recalled: boolean) => {
    setData(prev => {
      updateFeedbackSession(prev.id, { memoryRecalled: recalled });
      return { ...prev, memoryRecalled: recalled };
    });
    if (recalled) {
      setCurrentStep(Step.VOICE_INPUT);
    } else {
      setCurrentStep(Step.CAREER);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCareerSelect = (career: string) => {
    const finalData = { ...data, career };
    updateFeedbackSession(data.id, { career });
    
    // Double-Redundancy: Also push to Google Sheets
    pushToGoogleSheets(finalData).then(success => {
      if (success) setLastSheetSync(Date.now());
    });

    setData(finalData);
    setCurrentStep(Step.THANK_YOU);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleHiddenAdminTrigger = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    const now = Date.now();
    if (now - tapRef.current.last < 800) {
      tapRef.current.count++;
    } else {
      tapRef.current.count = 1;
    }
    tapRef.current.last = now;
    if (tapRef.current.count === 3) {
      setCurrentStep(Step.ADMIN);
      tapRef.current.count = 0;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const exportToCSV = () => {
    if (allFeedback.length === 0) return alert("No data to export.");
    const headers = ['ID', 'Timestamp', 'Performance', 'Emotion', 'Memory Recalled', 'Career', 'Transcription'];
    const rows = allFeedback.map(f => [
      f.id, new Date(f.timestamp).toISOString(), f.performanceId, f.emotion,
      f.memoryRecalled ? 'Yes' : 'No', f.career, `"${(f.aiTranscription || '').replace(/"/g, '""')}"`
    ]);
    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `study_data_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const renderStep = () => {
    switch (currentStep) {
      case Step.LANDING:
        return (
          <div className="text-center w-full flex flex-col items-center py-12 md:py-20">
            <h1 className="text-5xl md:text-7xl font-black mb-10 text-slate-800 leading-tight">Thank you for listening 🎶</h1>
            <p className="text-2xl md:text-4xl text-slate-600 mb-16 max-w-3xl leading-relaxed">We'd love to know how the music made you feel.</p>
            <button onClick={startNewSession} className="bg-indigo-600 hover:bg-indigo-700 text-white text-3xl md:text-5xl font-black py-10 px-20 md:py-12 md:px-28 rounded-[3rem] shadow-2xl active:scale-95 transition-all w-full md:w-auto">Start</button>
          </div>
        );
      case Step.EMOTION:
        return (
          <div className="w-full flex flex-col items-center py-6">
            <h2 className="text-4xl md:text-5xl font-black mb-10 text-slate-800 text-center">How did the music make you feel?</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6 w-full max-w-6xl px-4">
              {EMOTIONS.map(e => (
                <button key={e.label} onClick={() => handleEmotionSelect(e.label)} className={`${e.color} flex flex-col items-center justify-center p-6 md:p-8 rounded-[2rem] border-4 shadow-lg active:scale-95 transition-all min-h-[180px]`}>
                  <span className="text-5xl md:text-7xl mb-4">{e.icon}</span>
                  <span className="text-xl md:text-3xl font-black text-slate-800">{e.label}</span>
                </button>
              ))}
            </div>
          </div>
        );
      case Step.MEMORY_PROMPT:
        return (
          <div className="text-center w-full py-10">
            <h2 className="text-4xl md:text-6xl font-black mb-16 text-slate-800 px-4">Did this music bring back any specific memories?</h2>
            <div className="flex flex-col md:flex-row gap-8 justify-center w-full max-w-3xl px-4">
              <button onClick={() => handleMemoryResponse(true)} className="flex-1 bg-emerald-100 border-4 border-emerald-400 text-emerald-900 text-4xl md:text-6xl font-black py-16 rounded-[3rem] shadow-xl active:scale-95">Yes</button>
              <button onClick={() => handleMemoryResponse(false)} className="flex-1 bg-slate-100 border-4 border-slate-300 text-slate-900 text-4xl md:text-6xl font-black py-16 rounded-[3rem] shadow-xl active:scale-95">No</button>
            </div>
          </div>
        );
      case Step.VOICE_INPUT:
        return (
          <div className="text-center w-full py-6">
            <h2 className="text-4xl md:text-6xl font-black mb-8 text-slate-800">Tell us about it...</h2>
            <div className="mb-12">
              <div className={`w-56 h-56 md:w-72 md:h-72 rounded-full mx-auto flex items-center justify-center transition-all duration-500 shadow-inner ${isRecording ? 'bg-red-50 ring-[12px] ring-red-100' : 'bg-indigo-50 ring-[12px] ring-indigo-100'}`}>
                {isRecording ? (
                  <div className="flex space-x-2 md:space-x-3 items-end h-16 md:h-20">
                    {[0, 1, 2, 3, 4].map(i => <div key={i} className="w-3 md:w-4 bg-red-500 rounded-full animate-pulse" style={{ height: `${Math.random() * 80 + 20}%`, animationDelay: `${i * 0.1}s` }} />)}
                  </div>
                ) : <span className="text-7xl md:text-9xl">🎙️</span>}
              </div>
              {isRecording && <p className="mt-8 text-4xl font-black text-red-600 font-mono">00:{recordingTime.toString().padStart(2, '0')}</p>}
            </div>
            <button onClick={isRecording ? stopRecording : startRecording} className={`${isRecording ? 'bg-red-600' : 'bg-indigo-600'} text-white text-3xl font-black py-8 px-16 rounded-[3rem] shadow-xl active:scale-95`}>
              {isRecording ? 'Done' : 'Tap to Start'}
            </button>
          </div>
        );
      case Step.CAREER:
        return (
          <div className="w-full flex flex-col items-center py-6">
            <h2 className="text-4xl md:text-5xl font-black mb-10 text-slate-800 text-center">What was your main work or passion?</h2>
            <div className="grid grid-cols-1 gap-4 w-full max-w-2xl px-4">
              {CAREERS.map(c => (
                <button key={c.id} onClick={() => handleCareerSelect(c.label)} className="bg-white border-4 border-slate-200 text-slate-800 text-2xl font-black py-6 px-10 rounded-[2.5rem] shadow-md transition-all text-left flex justify-between items-center">
                  {c.label} <svg className="w-6 h-6 text-indigo-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M9 5l7 7-7 7"/></svg>
                </button>
              ))}
            </div>
          </div>
        );
      case Step.THANK_YOU:
        return (
          <div className="text-center py-16">
            <div className="text-8xl md:text-9xl mb-8">❤️</div>
            <h1 className="text-6xl md:text-8xl font-black mb-8 text-slate-800">Thank you!</h1>
            <p className="text-2xl md:text-4xl text-slate-500 mb-16 font-bold">Your story has been saved.</p>
            <button onClick={resetApp} className="bg-indigo-600 text-white text-3xl font-black py-10 px-20 rounded-[3rem] shadow-2xl active:scale-95">Finish</button>
          </div>
        );
      case Step.ADMIN:
        return (
          <div className="w-full flex flex-col pb-20">
            <div className="bg-slate-900 text-white p-8 rounded-[2.5rem] mb-10 shadow-2xl flex flex-col lg:flex-row justify-between items-start lg:items-center gap-8">
              <div className="flex-1">
                <h2 className="text-4xl font-black mb-2">Researcher Dashboard</h2>
                <div className="flex flex-wrap gap-4 items-center">
                   <span className={`${dbError ? 'bg-amber-500' : 'bg-emerald-500'} text-white px-3 py-1 rounded-lg text-sm font-bold uppercase tracking-wider`}>
                     {dbError ? 'Sheet Only Mode' : 'Firestore Live'}
                   </span>
                   {GOOGLE_SHEETS_URL && (
                     <span className="bg-indigo-500 text-white px-3 py-1 rounded-lg text-sm font-bold uppercase tracking-wider">
                       Sheet Active
                     </span>
                   )}
                   <p className="text-xl text-slate-400 font-bold">{allFeedback.length} Total Records</p>
                </div>
                {dbError && <p className="mt-4 text-amber-400 font-bold text-sm bg-amber-900/30 p-3 rounded-lg border border-amber-700/50">{dbError}</p>}
                {lastSheetSync && <p className="mt-2 text-indigo-400 text-xs font-bold uppercase">Last Sheet Sync: {new Date(lastSheetSync).toLocaleTimeString()}</p>}
              </div>
              <div className="flex flex-wrap gap-4 w-full lg:w-auto">
                <button onClick={exportToCSV} className="flex-1 lg:flex-none bg-indigo-600 hover:bg-indigo-500 text-white px-8 py-5 rounded-[1.5rem] font-black shadow-lg flex items-center justify-center gap-3 text-lg transition-all active:scale-95">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg> Export CSV
                </button>
                <button onClick={() => setCurrentStep(Step.LANDING)} className="bg-white text-slate-900 px-8 py-5 rounded-[1.5rem] font-black shadow-lg transition-all active:scale-95">Exit</button>
              </div>
            </div>
            <div className="bg-white border-4 border-slate-200 rounded-[2.5rem] shadow-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse min-w-[900px]">
                  <thead className="bg-slate-100 text-slate-500 border-b-4 border-slate-200">
                    <tr>
                      <th className="p-6 text-left text-xs font-black uppercase tracking-widest">Time</th>
                      <th className="p-6 text-left text-xs font-black uppercase tracking-widest">Emotion</th>
                      <th className="p-6 text-left text-xs font-black uppercase tracking-widest">Memory</th>
                      <th className="p-6 text-left text-xs font-black uppercase tracking-widest">Career</th>
                      <th className="p-6 text-left text-xs font-black uppercase tracking-widest">Transcription</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {allFeedback.length === 0 ? (
                      <tr><td colSpan={5} className="p-24 text-center text-2xl font-bold text-slate-300 italic">No records found.</td></tr>
                    ) : (
                      allFeedback.map(f => (
                        <tr key={f.id} className="hover:bg-indigo-50/50 transition-colors">
                          <td className="p-6 align-top">
                            <p className="font-bold text-slate-900 text-sm">{new Date(f.timestamp).toLocaleDateString()}</p>
                            <p className="text-[10px] text-slate-400 font-mono">{new Date(f.timestamp).toLocaleTimeString()}</p>
                          </td>
                          <td className="p-6 align-top text-3xl">
                             {EMOTIONS.find(e => e.label === f.emotion)?.icon || '❔'}
                             <span className="text-[10px] font-black block mt-1 text-slate-400 uppercase">{f.emotion || 'Not Set'}</span>
                          </td>
                          <td className="p-6 align-top">
                            <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${f.memoryRecalled ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-400'}`}>
                              {f.memoryRecalled === null ? '-' : f.memoryRecalled ? 'YES' : 'NO'}
                            </span>
                          </td>
                          <td className="p-6 align-top font-bold text-slate-700 text-sm">{f.career || '-'}</td>
                          <td className="p-6 align-top">
                            <div className="text-sm text-slate-600 leading-relaxed italic bg-slate-50 p-4 rounded-xl border border-slate-100 min-h-[50px]">
                              {f.aiTranscription || <span className="text-slate-200">None</span>}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );
      default: return null;
    }
  };

  return (
    <div onClick={handleHiddenAdminTrigger} className="min-h-screen w-full bg-slate-50 overflow-y-auto">
      <Layout stepName={currentStep === Step.ADMIN ? 'RESEARCHER DASHBOARD' : currentStep.replace('_', ' ')}>
        {renderStep()}
      </Layout>
    </div>
  );
};

export default App;
