
import { EmotionOption, CareerOption } from './types';

export const PERFORMANCE_ID = "GardenTerrace_2025-12-27";

/**
 * CENTRAL SYNC ENDPOINT
 * Point this to a Google Apps Script Web App URL or a Firebase Function
 * to enable cross-device data centralization.
 */
export const SYNC_ENDPOINT = ""; // e.g., "https://script.google.com/macros/s/.../exec"

export const EMOTIONS: EmotionOption[] = [
  { label: 'Happy', icon: '😊', color: 'bg-yellow-100 hover:bg-yellow-200 border-yellow-300' },
  { label: 'Calm', icon: '😌', color: 'bg-blue-100 hover:bg-blue-200 border-blue-300' },
  { label: 'Nostalgic', icon: '🥲', color: 'bg-indigo-100 hover:bg-indigo-200 border-indigo-300' },
  { label: 'Sad', icon: '😢', color: 'bg-slate-100 hover:bg-slate-200 border-slate-300' },
  { label: 'Energized', icon: '⚡', color: 'bg-orange-100 hover:bg-orange-200 border-orange-300' },
  { label: 'Inspired', icon: '✨', color: 'bg-purple-100 hover:bg-purple-200 border-purple-300' },
  { label: 'Peaceful', icon: '🕊️', color: 'bg-teal-100 hover:bg-teal-200 border-teal-300' },
  { label: 'Touched', icon: '❤️', color: 'bg-red-100 hover:bg-red-200 border-red-300' },
  { label: 'Pensive', icon: '🧐', color: 'bg-emerald-100 hover:bg-emerald-200 border-emerald-300' },
  { label: 'Wonder', icon: '🌟', color: 'bg-amber-100 hover:bg-amber-200 border-amber-300' },
  { label: 'Content', icon: '🍵', color: 'bg-lime-100 hover:bg-lime-200 border-lime-300' },
  { label: 'Neutral', icon: '😐', color: 'bg-gray-100 hover:bg-gray-200 border-gray-300' },
];

export const CAREERS: CareerOption[] = [
  { id: 'business', label: 'Office / Business' },
  { id: 'arts', label: 'Arts / Music' },
  { id: 'science', label: 'Science / Tech' },
  { id: 'education', label: 'Education' },
  { id: 'trades', label: 'Trades / Labor' },
  { id: 'healthcare', label: 'Healthcare' },
  { id: 'other', label: 'Other' },
  { id: 'skip', label: 'Prefer not to say' },
];
