
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Step, FeedbackData } from './types';
import { PERFORMANCE_ID, EMOTIONS, CAREERS } from './constants';
import { Layout } from './components/Layout';
import { processVoiceFeedback } from './services/geminiService';

const STORAGE_KEY = 'senior_music_feedback_data';

const App: React.FC = () => {
  const [currentStep, setCurrentStep] = useState<Step>(Step.LANDING);
  const [allFeedback, setAllFeedback] = useState<FeedbackData[]>([]);
  const [data, setData] = useState<FeedbackData>({
    id: Math.random().toString(36).substr(2, 9),
    timestamp: Date.now(),
    emotion: null,
    memoryRecalled: null,
    voiceAudioBase64: null,
    career: null,
    performanceId: PERFORMANCE_ID,
  });

  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  
  const tapRef = useRef({ count: 0, last: 0 });

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        setAllFeedback(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse saved feedback");
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(allFeedback));
  }, [allFeedback]);

  const resetApp = useCallback(() => {
    setCurrentStep(Step.LANDING);
    setData({
      id: Math.random().toString(36).substr(2, 9),
      timestamp: Date.now(),
      emotion: null,
      memoryRecalled: null,
      voiceAudioBase64: null,
      career: null,
      performanceId: PERFORMANCE_ID,
    });
    window.scrollTo(0, 0);
  }, []);

  const updateDatabaseRecord = (updatedRecord: FeedbackData) => {
    setAllFeedback(prev => {
      const exists = prev.find(f => f.id === updatedRecord.id);
      if (exists) {
        return prev.map(f => f.id === updatedRecord.id ? { ...f, ...updatedRecord } : f);
      }
      return [...prev, updatedRecord];
    });
  };

  const startRecording = async () => {
    try {
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
          const currentId = data.id;
          setData(prev => ({ ...prev, voiceAudioBase64: base64 }));
          
          processVoiceFeedback(base64, recordedMimeType).then(transcription => {
            setAllFeedback(prev => 
              prev.map(f => f.id === currentId ? { ...f, aiTranscription: transcription } : f)
            );
          });
        };
        stream.getTracks().forEach(track => track.stop());
      };

      recorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      
      timerRef.current = window.setInterval(() => {
        setRecordingTime(prev => {
          if (prev >= 29) {
            stopRecording();
            return 30;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (err) {
      console.error("Failed to start recording:", err);
      alert("Please allow microphone access to record your voice.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
      setCurrentStep(Step.CAREER);
      window.scrollTo(0, 0);
    }
  };

  const handleEmotionSelect = (emotion: string) => {
    setData(prev => ({ ...prev, emotion }));
    setCurrentStep(Step.MEMORY_PROMPT);
    window.scrollTo(0, 0);
  };

  const handleMemoryResponse = (recalled: boolean) => {
    setData(prev => ({ ...prev, memoryRecalled: recalled }));
    if (recalled) {
      setCurrentStep(Step.VOICE_INPUT);
    } else {
      setCurrentStep(Step.CAREER);
    }
    window.scrollTo(0, 0);
  };

  const handleCareerSelect = (career: string) => {
    const finalData = { ...data, career };
    setData(finalData);
    updateDatabaseRecord(finalData);
    setCurrentStep(Step.THANK_YOU);
    window.scrollTo(0, 0);
  };

  const handleHiddenAdminTrigger = () => {
    const now = Date.now();
    if (now - tapRef.current.last < 500) {
      tapRef.current.count++;
    } else {
      tapRef.current.count = 1;
    }
    tapRef.current.last = now;

    if (tapRef.current.count === 3) {
      setCurrentStep(Step.ADMIN);
      tapRef.current.count = 0;
      window.scrollTo(0, 0);
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case Step.LANDING:
        return (
          <div className="text-center w-full flex flex-col items-center py-10">
            <h1 className="text-6xl md:text-7xl font-black mb-8 text-slate-800 leading-tight">Thank you for listening 🎶</h1>
            <p className="text-3xl md:text-4xl text-slate-600 mb-16 max-w-3xl leading-relaxed">
              We'd love to know how the music made you feel.
            </p>
            <button
              onClick={() => setCurrentStep(Step.EMOTION)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-4xl md:text-5xl font-black py-12 px-24 rounded-[3rem] shadow-2xl active:scale-95 transition-all w-full md:w-auto"
            >
              Start
            </button>
          </div>
        );

      case Step.EMOTION:
        return (
          <div className="w-full flex flex-col items-center">
            <h2 className="text-4xl md:text-5xl font-black mb-10 text-slate-800 text-center leading-tight">How did the music make you feel?</h2>
            <div className="w-full max-w-5xl mx-auto px-2">
              <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 gap-6">
                {EMOTIONS.map((e) => (
                  <button
                    key={e.label}
                    onClick={() => handleEmotionSelect(e.label)}
                    className={`${e.color} flex flex-col items-center justify-center p-8 rounded-[2.5rem] border-4 shadow-lg active:scale-95 transition-all text-center min-h-[220px]`}
                  >
                    <span className="text-7xl mb-4">{e.icon}</span>
                    <span className="text-3xl font-black text-slate-800">{e.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        );

      case Step.MEMORY_PROMPT:
        return (
          <div className="text-center w-full py-10">
            <h2 className="text-5xl md:text-6xl font-black mb-16 text-slate-800 px-4 leading-tight">Did this music bring back any specific memories?</h2>
            <div className="flex flex-col md:flex-row gap-8 justify-center w-full max-w-3xl mx-auto px-4">
              <button
                onClick={() => handleMemoryResponse(true)}
                className="flex-1 bg-emerald-100 hover:bg-emerald-200 border-4 md:border-8 border-emerald-400 text-emerald-900 text-5xl md:text-6xl font-black py-20 rounded-[3.5rem] transition-all shadow-xl active:scale-95"
              >
                Yes
              </button>
              <button
                onClick={() => handleMemoryResponse(false)}
                className="flex-1 bg-slate-100 hover:bg-slate-200 border-4 md:border-8 border-slate-300 text-slate-900 text-5xl md:text-6xl font-black py-20 rounded-[3.5rem] transition-all shadow-xl active:scale-95"
              >
                No
              </button>
            </div>
          </div>
        );

      case Step.VOICE_INPUT:
        return (
          <div className="text-center w-full py-6">
            <h2 className="text-5xl font-black mb-8 text-slate-800 leading-tight">Tell us about it...</h2>
            <div className="mb-12">
              <div className={`w-64 h-64 md:w-72 md:h-72 rounded-full mx-auto flex items-center justify-center transition-all duration-500 shadow-inner ${isRecording ? 'bg-red-50 ring-[15px] ring-red-100' : 'bg-indigo-50 ring-[15px] ring-indigo-100'}`}>
                {isRecording ? (
                  <div className="flex space-x-3 items-end h-20">
                    {[0, 1, 2, 3, 4].map(i => (
                      <div key={i} className="w-4 bg-red-500 rounded-full animate-pulse" style={{ height: `${Math.random() * 80 + 20}%`, animationDelay: `${i * 0.1}s` }} />
                    ))}
                  </div>
                ) : (
                  <span className="text-9xl">🎙️</span>
                )}
              </div>
              {isRecording && (
                <p className="mt-10 text-5xl font-black text-red-600 font-mono tracking-tighter">00:{recordingTime.toString().padStart(2, '0')}</p>
              )}
            </div>
            {!isRecording ? (
              <button
                onClick={startRecording}
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-4xl font-black py-10 px-24 rounded-[3.5rem] shadow-xl active:scale-95 transition-all"
              >
                Tap to Start
              </button>
            ) : (
              <button
                onClick={stopRecording}
                className="bg-red-600 hover:bg-red-700 text-white text-4xl font-black py-10 px-24 rounded-[3.5rem] shadow-xl active:scale-95 transition-all"
              >
                Stop
              </button>
            )}
            <p className="mt-12 text-2xl font-bold text-slate-400 uppercase tracking-widest">Optional Voice Recording</p>
          </div>
        );

      case Step.CAREER:
        return (
          <div className="w-full flex flex-col items-center">
            <h2 className="text-4xl md:text-5xl font-black mb-10 text-slate-800 text-center leading-tight">What was your main work or passion?</h2>
            <div className="grid grid-cols-1 gap-4 w-full max-w-2xl mx-auto px-4 pb-12">
              {CAREERS.map((c) => (
                <button
                  key={c.id}
                  onClick={() => handleCareerSelect(c.label)}
                  className="bg-white hover:bg-indigo-50 border-4 border-slate-200 text-slate-800 text-3xl font-black py-8 px-10 rounded-[2.5rem] shadow-md transition-all text-left flex justify-between items-center"
                >
                  {c.label}
                  <svg className="w-8 h-8 text-indigo-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M9 5l7 7-7 7"/></svg>
                </button>
              ))}
            </div>
          </div>
        );

      case Step.THANK_YOU:
        return (
          <div className="text-center py-10">
            <div className="text-9xl mb-10">❤️</div>
            <h1 className="text-7xl font-black mb-8 text-slate-800">Thank you!</h1>
            <p className="text-4xl text-slate-500 mb-20 font-bold">Your story has been saved.</p>
            <button
              onClick={resetApp}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-4xl font-black py-12 px-20 rounded-[3.5rem] shadow-2xl transition-all active:scale-95"
            >
              Finish
            </button>
          </div>
        );

      case Step.ADMIN:
        return (
          <div className="w-full flex flex-col pb-10">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-10 gap-6">
              <div>
                <h2 className="text-5xl font-black text-slate-900 mb-2">Performance Logs</h2>
                <p className="text-2xl text-slate-500 font-bold">Responses: {allFeedback.length} • Memories: {allFeedback.filter(f => f.memoryRecalled).length}</p>
              </div>
              <div className="flex gap-4 w-full md:w-auto">
                <button 
                  onClick={() => { if(confirm("Clear database?")) { setAllFeedback([]); localStorage.removeItem(STORAGE_KEY); } }}
                  className="flex-1 md:flex-none bg-red-50 text-red-600 px-8 py-4 rounded-3xl font-black border-4 border-red-100"
                >
                  Wipe
                </button>
                <button 
                  onClick={() => setCurrentStep(Step.LANDING)}
                  className="flex-1 md:flex-none bg-slate-900 text-white px-10 py-4 rounded-3xl font-black shadow-lg"
                >
                  Exit
                </button>
              </div>
            </div>
            
            <div className="bg-white border-4 border-slate-200 rounded-[2.5rem] shadow-xl overflow-x-auto">
              <table className="w-full border-collapse min-w-[800px]">
                <thead className="bg-slate-900 text-white">
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
                    <tr><td colSpan={5} className="p-24 text-center text-3xl font-bold text-slate-300 italic">No responses recorded</td></tr>
                  ) : (
                    [...allFeedback].reverse().map((f) => (
                      <tr key={f.id} className="hover:bg-indigo-50/50 transition-colors">
                        <td className="p-6 align-top">
                          <p className="font-bold text-slate-900 text-sm">{new Date(f.timestamp).toLocaleDateString()}</p>
                          <p className="text-[10px] text-slate-400 font-mono">{new Date(f.timestamp).toLocaleTimeString()}</p>
                        </td>
                        <td className="p-6 align-top font-black text-3xl">
                           {EMOTIONS.find(e => e.label === f.emotion)?.icon}
                        </td>
                        <td className="p-6 align-top">
                          <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${f.memoryRecalled ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-400'}`}>
                            {f.memoryRecalled ? 'YES' : 'NO'}
                          </span>
                        </td>
                        <td className="p-6 align-top font-bold text-slate-700 text-sm">{f.career}</td>
                        <td className="p-6 align-top">
                          <div className="text-sm text-slate-600 leading-relaxed italic bg-slate-50 p-4 rounded-xl border border-slate-100 min-h-[50px]">
                            {f.aiTranscription ? (
                              `"${f.aiTranscription}"`
                            ) : (
                              f.memoryRecalled && f.voiceAudioBase64 ? (
                                <span className="flex items-center gap-2 text-indigo-400 animate-pulse font-black text-xs uppercase">
                                  Transcribing...
                                </span>
                               ) : <span className="text-slate-200">N/A</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div onClick={handleHiddenAdminTrigger} className="min-h-screen w-full bg-slate-50">
      <Layout stepName={currentStep === Step.ADMIN ? 'DATABASE' : currentStep.replace('_', ' ')}>
        {renderStep()}
      </Layout>
    </div>
  );
};

export default App;
