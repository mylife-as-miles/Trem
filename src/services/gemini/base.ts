import { GoogleGenAI } from '@google/genai';

const apiKey = process.env.API_KEY || '';

export const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

export const retryWithBackoff = async <T>(
    fn: () => Promise<T>,
    retries = 3,
    delay = 1000,
): Promise<T> => {
    try {
        return await fn();
    } catch (error) {
        if (retries === 0) {
            throw error;
        }

        await new Promise((resolve) => setTimeout(resolve, delay));
        return retryWithBackoff(fn, retries - 1, delay * 2);
    }
};

export const fileToBase64 = (file: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);

        reader.onload = () => {
            if (typeof reader.result === 'string') {
                resolve(reader.result.split(',')[1]);
                return;
            }

            reject(new Error('Failed to convert file to base64'));
        };

        reader.onerror = (error) => reject(error);
    });
};

export const extractJSON = (text: string): any => {
    try {
        return JSON.parse(text);
    } catch {
        const markdownMatch = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/```([\s\S]*?)```/);
        if (markdownMatch?.[1]) {
            try {
                return JSON.parse(markdownMatch[1]);
            } catch {
                // keep falling through
            }
        }

        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }

        throw new Error('No JSON found in response');
    }
};
