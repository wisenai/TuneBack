
import { FeedbackData } from '../types';
import { SYNC_ENDPOINT } from '../constants';

export const pushToCloud = async (data: FeedbackData): Promise<boolean> => {
  if (!SYNC_ENDPOINT) return false;

  try {
    const response = await fetch(SYNC_ENDPOINT, {
      method: 'POST',
      mode: 'no-cors', // Common for Google Apps Script
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'push', record: data }),
    });
    // With no-cors, we can't see the response body, but we assume it sent if no exception
    return true;
  } catch (error) {
    console.error("Sync Push Error:", error);
    return false;
  }
};

export const pullFromCloud = async (): Promise<FeedbackData[]> => {
  if (!SYNC_ENDPOINT) return [];

  try {
    const response = await fetch(`${SYNC_ENDPOINT}?action=pull`);
    if (!response.ok) throw new Error("Cloud pull failed");
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error("Sync Pull Error:", error);
    return [];
  }
};
