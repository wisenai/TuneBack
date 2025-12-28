
import { FeedbackData } from '../types';
import { GOOGLE_SHEETS_URL } from '../constants';

/**
 * Pushes feedback record to a Google Sheet via a Google Apps Script Web App.
 */
export const pushToGoogleSheets = async (data: FeedbackData): Promise<boolean> => {
  if (!GOOGLE_SHEETS_URL) return false;

  try {
    const response = await fetch(GOOGLE_SHEETS_URL, {
      method: 'POST',
      mode: 'no-cors', // Required for Google Apps Script Web Apps
      cache: 'no-cache',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ record: data }),
    });
    
    // With no-cors, we can't see the response body, but absence of error usually means success.
    return true;
  } catch (error) {
    console.error("Sheet Sync Error:", error);
    return false;
  }
};
