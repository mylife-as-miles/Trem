import { ai } from '../base';

/**
 * Interprets a user command for video processing agents.
 * Uses gemini-3-flash-preview.
 */
export const interpretAgentCommand = async (command: string): Promise<string> => {
    if (!ai) {
        console.warn("Gemini API Key is missing. Returning mock response.");
        return new Promise((resolve) => {
            setTimeout(() => {
                resolve("Simulated Plan: Analysis complete. Starting 3 parallel agents.");
            }, 1500);
        });
    }

    try {
        const model = 'gemini-3-flash-preview';
        const response = await ai.models.generateContent({
            model,
            contents: `You are an AI Video Orchestrator System. 
      Interpret the following user command for video processing agents and return a brief, technical summary of the actions triggered.
      Keep it under 20 words.
      
      Command: ${command}`,
        });

        return response.text || "Command processed.";
    } catch (error) {
        console.error("Gemini API Error:", error);
        return "Error interpreting command. Please check system logs.";
    }
};
