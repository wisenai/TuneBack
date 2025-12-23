
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Step, FeedbackData } from './types';
import { PERFORMANCE_ID, EMOTIONS, CAREERS, SYNC_ENDPOINT } from './constants';
import { Layout } from './components/Layout';
import { processVoiceFeedback } from './services/geminiService';
import { pushToCloud, pullFromCloud } from './services/syncService';

const STORAGE_KEY = 'senior_music_feedback_data';

const App: React.FC = () => {
  const [currentStep, setCurrentStep] = useState<Step>(Step.LANDING);
  const [allFeedback, setAllFeedback] = useState<FeedbackData[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [data, setData] = useState<FeedbackData>({
    id: Math.random().toString(36).substr(2, 9),
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

  // Load local data on boot
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

  // Persist local data whenever it changes
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(allFeedback));
  }, [allFeedback]);

  // Background Sync Engine: Try to sync unsynced records
  useEffect(() => {
    if (!SYNC_ENDPOINT) return;

    const syncInterval = setInterval(async () => {
      const unsynced = allFeedback.filter(f => !f.isSynced);
      if (unsynced.length > 0 && !isSyncing) {
        console.log(`Syncing ${unsynced.length} records...`);
        for (const record of unsynced) {
          const success = await pushToCloud(record);
          if (success) {
            setAllFeedback(prev => 
              prev.map(f => f.id === record.id ? { ...f, isSynced: true } : f)
            );
          }
        }
      }
    }, 30000); // Check every 30 seconds

    return () => clearInterval(syncInterval);
  }, [allFeedback, isSyncing]);

  // Auto-reset timer for the Thank You screen
  useEffect(() => {
    let timeout: number;
    if (currentStep === Step.THANK_YOU) {
      timeout = window.setTimeout(() => {
        resetApp();
      }, 10000); // 10 seconds
    }
    return () => clearTimeout(timeout);
  }, [currentStep]);

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
      isSynced: false
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const startNewSession = () => {
    setData({
      id: Math.random().toString(36).substr(2, 9),
      timestamp: Date.now(),
      emotion: null,
      memoryRecalled: null,
      voiceAudioBase64: null,
      career: null,
      performanceId: PERFORMANCE_ID,
      isSynced: false
    });
    setCurrentStep(Step.EMOTION);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const updateDatabaseRecord = async (updatedRecord: FeedbackData) => {
    setAllFeedback(prev => {
      const exists = prev.find(f => f.id === updatedRecord.id);
      if (exists) {
        return prev.map(f => f.id === updatedRecord.id ? { ...f, ...updatedRecord } : f);
      }
      return [...prev, updatedRecord];
    });

    // Immediate sync attempt
    if (SYNC_ENDPOINT) {
      const success = await pushToCloud(updatedRecord);
      if (success) {
        setAllFeedback(prev => 
          prev.map(f => f.id === updatedRecord.id ? { ...f, isSynced: true } : f)
        );
      }
    }
  };

  const startRecording = async () => {
    try {
      // Capture the ID of the session that STARTED the recording
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
          
          // 1. Optimistic UI update (only affects current screen if ID matches)
          setData(prev => {
            if (prev.id === sessionID) {
               return { ...prev, voiceAudioBase64: base64 };
            }
            return prev;
          });
          
          processVoiceFeedback(base64, recordedMimeType).then(transcription => {
            // 2. Transcription complete. We must save this to the correct record, 
            // regardless of whether the user is still on the screen or has finished.

            // A. Update in Persistent List (if user has already finished flow and it was saved)
            setAllFeedback(prevList => {
               const index = prevList.findIndex(f => f.id === sessionID);
               if (index !== -1) {
                  const newList = [...prevList];
                  const updatedRecord = { 
                    ...newList[index], 
                    voiceAudioBase64: base64, 
                    aiTranscription: transcription,
                    isSynced: false // Mark unsynced so it pushes to cloud again
                  };
                  newList[index] = updatedRecord;
                  
                  // Trigger background sync for this updated record
                  pushToCloud(updatedRecord).then(success => {
                    if (success) {
                      setAllFeedback(currentList => 
                        currentList.map(item => item.id === sessionID ? { ...item, isSynced: true } : item)
                      );
                    }
                  });
                  
                  return newList;
               }
               return prevList;
            });

            // B. Update in Active State (if user is still in the flow)
            setData(prevData => {
              if (prevData.id === sessionID) {
                // We update local state, so when they click 'Career', it saves the transcript
                return { ...prevData, voiceAudioBase64: base64, aiTranscription: transcription };
              }
              return prevData;
            });
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
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleEmotionSelect = (emotion: string) => {
    setData(prev => ({ ...prev, emotion }));
    setCurrentStep(Step.MEMORY_PROMPT);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleMemoryResponse = (recalled: boolean) => {
    setData(prev => ({ ...prev, memoryRecalled: recalled }));
    if (recalled) {
      setCurrentStep(Step.VOICE_INPUT);
    } else {
      setCurrentStep(Step.CAREER);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCareerSelect = (career: string) => {
    setData(prev => {
      const finalData = { ...prev, career };
      updateDatabaseRecord(finalData);
      return finalData;
    });
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

  const syncAllFromCloud = async () => {
    if (!SYNC_ENDPOINT) {
      alert("No Sync Endpoint configured in constants.tsx");
      return;
    }
    setIsSyncing(true);
    const cloudData = await pullFromCloud();
    if (cloudData.length > 0) {
      setAllFeedback(prev => {
        const combined = [...prev];
        cloudData.forEach(cloudRecord => {
          const exists = combined.findIndex(f => f.id === cloudRecord.id);
          if (exists === -1) {
            combined.push({ ...cloudRecord, isSynced: true });
          } else {
            combined[exists] = { ...combined[exists], ...cloudRecord, isSynced: true };
          }
        });
        return combined;
      });
      alert(`Success! Merged ${cloudData.length} records from the central database.`);
    } else {
      alert("No new data found on the cloud.");
    }
    setIsSyncing(false);
  };

  const exportToCSV = () => {
    if (allFeedback.length === 0) {
      alert("No data to export yet.");
      return;
    }
    const headers = ['ID', 'Timestamp', 'Performance', 'Emotion', 'Memory Recalled', 'Career', 'Transcription', 'Synced'];
    const rows = allFeedback.map(f => [
      f.id,
      new Date(f.timestamp).toISOString(),
      f.performanceId,
      f.emotion,
      f.memoryRecalled ? 'Yes' : 'No',
      f.career,
      `"${(f.aiTranscription || '').replace(/"/g, '""')}"`,
      f.isSynced ? 'Yes' : 'No'
    ]);
    
    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `all_feedback_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const renderStep = () => {
    switch (currentStep) {
      case Step.LANDING:
        return (
          <div className="text-center w-full flex flex-col items-center py-12 md:py-20">
            <h1 className="text-5xl md:text-7xl font-black mb-10 text-slate-800 leading-tight">Thank you for listening 🎶</h1>
            <p className="text-2xl md:text-4xl text-slate-600 mb-16 max-w-3xl leading-relaxed">
              We'd love to know how the music made you feel.
            </p>
            <button
              onClick={startNewSession}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-3xl md:text-5xl font-black py-10 px-20 md:py-12 md:px-28 rounded-[3rem] shadow-2xl active:scale-95 transition-all w-full md:w-auto"
            >
              Start
            </button>
          </div>
        );

      case Step.EMOTION:
        return (
          <div className="w-full flex flex-col items-center py-6">
            <h2 className="text-4xl md:text-5xl font-black mb-10 text-slate-800 text-center leading-tight">How did the music make you feel?</h2>
            <div className="w-full max-w-6xl mx-auto px-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
                {EMOTIONS.map((e) => (
                  <button
                    key={e.label}
                    onClick={() => handleEmotionSelect(e.label)}
                    className={`${e.color} flex flex-col items-center justify-center p-6 md:p-8 rounded-[2rem] border-4 shadow-lg active:scale-95 transition-all text-center min-h-[180px] md:min-h-[220px]`}
                  >
                    <span className="text-5xl md:text-7xl mb-4">{e.icon}</span>
                    <span className="text-xl md:text-3xl font-black text-slate-800">{e.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        );

      case Step.MEMORY_PROMPT:
        return (
          <div className="text-center w-full py-10">
            <h2 className="text-4xl md:text-6xl font-black mb-16 text-slate-800 px-4 leading-tight">Did this music bring back any specific memories?</h2>
            <div className="flex flex-col md:flex-row gap-8 justify-center w-full max-w-3xl mx-auto px-4">
              <button
                onClick={() => handleMemoryResponse(true)}
                className="flex-1 bg-emerald-100 hover:bg-emerald-200 border-4 md:border-8 border-emerald-400 text-emerald-900 text-4xl md:text-6xl font-black py-16 md:py-24 rounded-[3rem] transition-all shadow-xl active:scale-95"
              >
                Yes
              </button>
              <button
                onClick={() => handleMemoryResponse(false)}
                className="flex-1 bg-slate-100 hover:bg-slate-200 border-4 md:border-8 border-slate-300 text-slate-900 text-4xl md:text-6xl font-black py-16 md:py-24 rounded-[3rem] transition-all shadow-xl active:scale-95"
              >
                No
              </button>
            </div>
          </div>
        );

      case Step.VOICE_INPUT:
        return (
          <div className="text-center w-full py-6">
            <h2 className="text-4xl md:text-6xl font-black mb-8 text-slate-800 leading-tight">Tell us about it...</h2>
            <div className="mb-12">
              <div className={`w-56 h-56 md:w-72 md:h-72 rounded-full mx-auto flex items-center justify-center transition-all duration-500 shadow-inner ${isRecording ? 'bg-red-50 ring-[12px] ring-red-100' : 'bg-indigo-50 ring-[12px] ring-indigo-100'}`}>
                {isRecording ? (
                  <div className="flex space-x-2 md:space-x-3 items-end h-16 md:h-20">
                    {[0, 1, 2, 3, 4].map(i => (
                      <div key={i} className="w-3 md:w-4 bg-red-500 rounded-full animate-pulse" style={{ height: `${Math.random() * 80 + 20}%`, animationDelay: `${i * 0.1}s` }} />
                    ))}
                  </div>
                ) : (
                  <span className="text-7xl md:text-9xl">🎙️</span>
                )}
              </div>
              {isRecording && (
                <p className="mt-8 text-4xl md:text-5xl font-black text-red-600 font-mono tracking-tighter">00:{recordingTime.toString().padStart(2, '0')}</p>
              )}
            </div>
            {!isRecording ? (
              <button
                onClick={startRecording}
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-3xl md:text-4xl font-black py-8 px-16 md:py-10 md:px-24 rounded-[3rem] shadow-xl active:scale-95 transition-all"
              >
                Tap to Start
              </button>
            ) : (
              <button
                onClick={stopRecording}
                className="bg-red-600 hover:bg-red-700 text-white text-3xl md:text-4xl font-black py-8 px-16 md:py-10 md:px-24 rounded-[3rem] shadow-xl active:scale-95 transition-all"
              >
                Done
              </button>
            )}
            <p className="mt-12 text-xl font-bold text-slate-400 uppercase tracking-widest">Optional Voice Recording</p>
          </div>
        );

      case Step.CAREER:
        return (
          <div className="w-full flex flex-col items-center py-6">
            <h2 className="text-4xl md:text-5xl font-black mb-10 text-slate-800 text-center leading-tight">What was your main work or passion?</h2>
            <div className="grid grid-cols-1 gap-4 w-full max-w-2xl mx-auto px-4 pb-12">
              {CAREERS.map((c) => (
                <button
                  key={c.id}
                  onClick={() => handleCareerSelect(c.label)}
                  className="bg-white hover:bg-indigo-50 border-4 border-slate-200 text-slate-800 text-2xl md:text-3xl font-black py-6 px-10 rounded-[2.5rem] shadow-md transition-all text-left flex justify-between items-center"
                >
                  {c.label}
                  <svg className="w-6 h-6 md:w-8 md:h-8 text-indigo-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M9 5l7 7-7 7"/></svg>
                </button>
              ))}
            </div>
          </div>
        );

      case Step.THANK_YOU:
        return (
          <div className="text-center py-16 md:py-24">
            <div className="text-8xl md:text-9xl mb-8 md:mb-12">❤️</div>
            <h1 className="text-6xl md:text-8xl font-black mb-8 text-slate-800">Thank you!</h1>
            <p className="text-2xl md:text-4xl text-slate-500 mb-16 md:mb-20 font-bold">Your story has been saved.</p>
            <button
              onClick={resetApp}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-3xl md:text-5xl font-black py-10 px-20 rounded-[3rem] shadow-2xl transition-all active:scale-95"
            >
              Finish
            </button>
          </div>
        );

      case Step.ADMIN:
        return (
          <div className="w-full flex flex-col pb-20">
            <div className="bg-slate-900 text-white p-8 rounded-[2.5rem] mb-10 shadow-2xl flex flex-col lg:flex-row justify-between items-start lg:items-center gap-8">
              <div>
                <h2 className="text-4xl font-black mb-2">Researcher Dashboard</h2>
                <div className="flex flex-wrap gap-4 items-center">
                   <span className="bg-indigo-500 text-white px-3 py-1 rounded-lg text-sm font-bold uppercase tracking-wider">Device ID: {Math.random().toString(36).substr(2, 4)}</span>
                   <p className="text-xl text-slate-400 font-bold">{allFeedback.length} Total Records</p>
                </div>
              </div>
              
              <div className="flex flex-wrap gap-4 w-full lg:w-auto">
                <button 
                  onClick={syncAllFromCloud}
                  disabled={isSyncing}
                  className={`${isSyncing ? 'opacity-50' : ''} flex-1 lg:flex-none bg-emerald-600 hover:bg-emerald-500 text-white px-8 py-5 rounded-[1.5rem] font-black shadow-lg flex items-center justify-center gap-3 text-lg transition-all active:scale-95`}
                >
                  <svg className={`w-6 h-6 ${isSyncing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357-2H15"/></svg>
                  {isSyncing ? 'Syncing...' : 'Pull Cloud Data'}
                </button>
                <button 
                  onClick={exportToCSV}
                  className="flex-1 lg:flex-none bg-indigo-600 hover:bg-indigo-500 text-white px-8 py-5 rounded-[1.5rem] font-black shadow-lg flex items-center justify-center gap-3 text-lg transition-all active:scale-95"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                  Export CSV
                </button>
                <button 
                  onClick={() => setCurrentStep(Step.LANDING)}
                  className="bg-white text-slate-900 px-8 py-5 rounded-[1.5rem] font-black shadow-lg transition-all active:scale-95"
                >
                  Exit
                </button>
              </div>
            </div>
            
            <div className="bg-white border-4 border-slate-200 rounded-[2.5rem] shadow-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse min-w-[900px]">
                  <thead className="bg-slate-100 text-slate-500 border-b-4 border-slate-200">
                    <tr>
                      <th className="p-6 text-left text-xs font-black uppercase tracking-widest">Time / Status</th>
                      <th className="p-6 text-left text-xs font-black uppercase tracking-widest">Emotion</th>
                      <th className="p-6 text-left text-xs font-black uppercase tracking-widest">Memory</th>
                      <th className="p-6 text-left text-xs font-black uppercase tracking-widest">Career</th>
                      <th className="p-6 text-left text-xs font-black uppercase tracking-widest">Transcription</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {allFeedback.length === 0 ? (
                      <tr><td colSpan={5} className="p-24 text-center text-2xl font-bold text-slate-300 italic">No responses recorded yet.</td></tr>
                    ) : (
                      [...allFeedback].sort((a,b) => b.timestamp - a.timestamp).map((f) => (
                        <tr key={f.id} className="hover:bg-indigo-50/50 transition-colors">
                          <td className="p-6 align-top">
                            <p className="font-bold text-slate-900 text-sm">{new Date(f.timestamp).toLocaleDateString()}</p>
                            <p className="text-[10px] text-slate-400 font-mono mb-2">{new Date(f.timestamp).toLocaleTimeString()}</p>
                            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[9px] font-black uppercase ${f.isSynced ? 'bg-emerald-50 text-emerald-600' : 'bg-orange-50 text-orange-600'}`}>
                              {f.isSynced ? (
                                <><svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path d="M5.5 13a3.5 3.5 0 01-.369-6.98 4 4 0 117.753-1.977A4.5 4.5 0 1113.5 13H5.5z"/></svg> Cloud Synced</>
                              ) : (
                                <><svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M2 5a2 2 0 012-2h12a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V5zm3.293 1.293A1 1 0 016 6h8a1 1 0 110 2H6a1 1 0 01-.707-.293zM5 10a1 1 0 011-1h8a1 1 0 110 2H6a1 1 0 01-1-1zm0 4a1 1 0 011-1h4a1 1 0 110 2H6a1 1 0 01-1-1z" clipRule="evenodd"/></svg> Local Only</>
                              )}
                            </span>
                          </td>
                          <td className="p-6 align-top text-3xl">
                             {EMOTIONS.find(e => e.label === f.emotion)?.icon}
                             <span className="text-[10px] font-black block mt-1 text-slate-400 uppercase">{f.emotion}</span>
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
                                 ) : <span className="text-slate-200">None</span>
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
          </div>
        );

      default:
        return null;
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
