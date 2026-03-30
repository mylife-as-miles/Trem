import { ai } from '../base';

export const interpretAgentCommand = async (command: string): Promise<string> => {
    if (!ai) {
        await new Promise((resolve) => setTimeout(resolve, 800));
        return 'Simulated plan: analysis complete and work queued for execution.';
    }

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: `You are an AI Video Orchestrator System.
Interpret the following user command for video processing agents and return a brief technical summary of the actions triggered.
Keep it under 20 words.

Command: ${command}`,
        });

        return response.text || 'Command processed.';
    } catch (error) {
        console.error('Gemini API error:', error);
        return 'Error interpreting command. Please check system logs.';
    }
};
