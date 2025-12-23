
import { GoogleGenAI } from "@google/genai";

export const processVoiceFeedback = async (base64Audio: string, mimeType: string) => {
  if (!base64Audio) return null;

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    // We use gemini-3-flash-preview for multimodal content generation (audio to text)
    // The previous native-audio model is specific to the Live API session.
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType.split(';')[0], // Extract base mime type (e.g., audio/webm)
              data: base64Audio,
            },
          },
          {
            text: "You are an expert transcriber. Listen to this audio recording from a senior citizen sharing a memory about music. Transcribe exactly what they say. Do not add any conversational filler from yourself or any interpretation. If there is no talking or the audio is silent, return only: [No speech detected]."
          }
        ]
      },
    });

    const text = response.text;
    return text || "[Empty transcription]";
  } catch (error) {
    console.error("Gemini Transcription Error:", error);
    return `[Transcription error: ${error instanceof Error ? error.message : 'Unknown'}]`;
  }
};
