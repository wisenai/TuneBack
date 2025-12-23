
import { GoogleGenAI } from "@google/genai";

/**
 * Processes audio feedback using Gemini to generate a transcription.
 * Designed to be highly conservative to prevent hallucinations in noisy environments.
 */
export const processVoiceFeedback = async (base64Audio: string, mimeType: string) => {
  if (!base64Audio) return null;

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
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
            text: `TASK: Transcribe the audio provided.
CONTEXT: This is a short voice recording from a senior citizen sharing a memory after a music performance. The environment might have background noise.

STRICT RULES:
1. Transcribe EXACTLY what is spoken.
2. If the audio contains only background noise, breathing, or silence, return ONLY: "[No speech detected]".
3. DO NOT "guess" or "hallucinate" words if the audio is unclear. Use "[Inaudible]" for specific unclear segments.
4. DO NOT add any descriptions like (clears throat) or [Music playing].
5. DO NOT provide any summaries or interpretations.
6. If you are not at least 80% confident that actual speech is present, return: "[No speech detected]".`
          }
        ]
      },
      config: {
        // Temperature 0 makes the model more deterministic and less likely to "creatively" fill in gaps
        temperature: 0,
        topP: 0.1,
        topK: 1
      }
    });

    const text = response.text?.trim();
    
    // Safety check for empty or whitespace-only returns
    if (!text || text.length === 0) return "[No speech detected]";
    
    return text;
  } catch (error) {
    console.error("Gemini Transcription Error:", error);
    return `[Transcription error: ${error instanceof Error ? error.message : 'Unknown'}]`;
  }
};
