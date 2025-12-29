
import { Injectable } from '@angular/core';
import { GoogleGenAI, GenerateContentResponse } from '@google/genai';

export interface LandmarkHistory {
  history: string;
  sources: any[];
}

@Injectable({
  providedIn: 'root',
})
export class GeminiService {
  private ai: GoogleGenAI;

  constructor() {
    if (!process.env.API_KEY) {
      throw new Error("API_KEY environment variable not set");
    }
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  }

  async identifyLandmark(base64ImageData: string): Promise<string> {
    const imagePart = {
      inlineData: {
        mimeType: 'image/jpeg',
        data: base64ImageData,
      },
    };
    const textPart = {
      text: 'What is the name of the landmark in this photo? Be concise and only provide the name of the landmark.'
    };

    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts: [imagePart, textPart] },
      });
      return response.text.trim();
    } catch (error) {
      console.error('Error identifying landmark:', error);
      throw new Error('Could not identify the landmark from the image.');
    }
  }

  async fetchLandmarkHistory(landmarkName: string): Promise<LandmarkHistory> {
    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `Provide a concise, engaging history of ${landmarkName}, suitable for a short audio tour guide.`,
        config: {
          tools: [{ googleSearch: {} }],
        },
      });

      const history = response.text;
      const sources = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];

      return { history, sources };
    } catch (error) {
      console.error('Error fetching landmark history:', error);
      throw new Error('Could not fetch the history for this landmark.');
    }
  }
}
