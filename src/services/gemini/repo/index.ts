import { ai, extractJSON, retryWithBackoff, fileToBase64 } from '../base';
// @ts-ignore
import repoGenerationPrompt from '../../../prompts/repo-generation.md?raw';

export interface RepoGenerationInputs {
    duration?: string;
    transcript?: string;
    sceneBoundaries?: string;
    assetContext?: string;
    images?: string[]; // Array of base64 strings (keyframes)
}

export interface AnalyzedAsset {
    id: string;
    description: string;
    tags: string[];
}

/**
 * Analyzes a single asset (video/image) using keyframes or the blob itself.
 * Uses gemini-1.5-flash for speed and reliability.
 */
export const analyzeAsset = async (asset: { id: string, name: string, blob?: Blob, images?: string[] }): Promise<AnalyzedAsset> => {
    if (!ai) {
        // Mock fallback
        await new Promise(r => setTimeout(r, 1500));
        return {
            id: asset.id,
            description: `Analyzed content for ${asset.name}`,
            tags: ['auto-detected', 'mock']
        };
    }

    try {
        const parts: any[] = [
            { text: "Analyze this video clip based on these keyframes. Return a short description and 3 tags. Format: JSON { \"description\": \"...\", \"tags\": [...] }" }
        ];

        // Use Keyframes if available
        if (asset.images && asset.images.length > 0) {
            asset.images.forEach(base64Image => {
                const cleanBase64 = base64Image.replace(/^data:image\/[a-z]+;base64,/, "");
                parts.push({
                    inlineData: {
                        mimeType: "image/jpeg",
                        data: cleanBase64
                    }
                });
            });
        } else if (asset.blob) {
            // Fallback to Blob if no images
            const base64Data = await fileToBase64(asset.blob);
            parts.push({
                inlineData: {
                    mimeType: asset.blob.type || 'video/mp4',
                    data: base64Data
                }
            });
        }

        const config = {
            model: 'gemini-3-flash-preview',
            config: {
                responseMimeType: 'application/json'
            },
            contents: [
                {
                    role: 'user',
                    parts: parts
                }
            ]
        };

        const response = await ai.models.generateContent(config as any);
        const text = response.text || "{}";
        return extractJSON(text);

    } catch (e) {
        console.error(`Failed to analyze asset ${asset.name}`, e);
        return {
            id: asset.id,
            description: "Analysis failed",
            tags: ['error']
        };
    }
};

/**
 * Generates the full repository structure based on ingested assets.
 * Uses gemini-3-flash-preview with Streaming and Thinking.
 */
export const generateRepoStructure = async (inputs: RepoGenerationInputs, onLog?: (msg: string) => void) => {
    if (!ai) {
        console.warn("Gemini API Key missing.");
        throw new Error("Gemini API Key is missing. Please configure GEMINI_API_KEY in your environment to use AI features.");
    }

    // Pre-calculate inputs for template
    const duration = inputs.duration || 'Unknown';
    const transcript = inputs.transcript || 'None (detect from context)';
    const sceneBoundaries = inputs.sceneBoundaries !== 'auto-detected' ? inputs.sceneBoundaries : 'AUTO-DETECT (Analyze visual cues to find cuts)';
    const assetContext = inputs.assetContext || 'None provided';
    const visualContextCount = (inputs.images?.length || 0).toString();

    // Interpolate Prompt
    const promptText = repoGenerationPrompt
        .replace('{{DURATION}}', duration)
        .replace('{{TRANSCRIPT}}', transcript)
        .replace('{{SCENE_BOUNDARIES}}', sceneBoundaries)
        .replace('{{ASSET_CONTEXT}}', assetContext)
        .replace('{{VISUAL_CONTEXT_COUNT}}', visualContextCount);

    try {
        // Construct Parts
        const parts: any[] = [{ text: promptText }];

        // Add Images if provided
        if (inputs.images && inputs.images.length > 0) {
            inputs.images.forEach(base64Image => {
                const cleanBase64 = base64Image.replace(/^data:image\/[a-z]+;base64,/, "");
                parts.push({
                    inlineData: {
                        mimeType: "image/jpeg",
                        data: cleanBase64
                    }
                });
            });
        }

        const config = {
            model: 'gemini-3-flash-preview',
            config: {
                thinkingConfig: {
                    thinkingLevel: "HIGH",
                },
                responseMimeType: 'application/json'
            },
            contents: [{ role: 'user', parts }]
        };

        // @ts-ignore
        console.log("[Gemini] Requesting Repo Structure (Stream)...", JSON.stringify(config.config));

        // Use Streaming to prevent timeouts
        // @ts-ignore
        const result = await ai.models.generateContentStream(config as any);

        let fullText = '';
        let lastLogTime = 0;

        for await (const chunk of result) {
            const chunkText = chunk.text || '';
            fullText += chunkText;

            // Log progress every 2 seconds to keep connection/user alive
            const now = Date.now();
            if (now - lastLogTime > 2000) {
                if (onLog) onLog(`🧠 Thinking... (${fullText.length} chars generated)`);
                lastLogTime = now;
            }
        }

        console.log("[Gemini] Request finished.");
        return extractJSON(fullText);

    } catch (error) {
        console.error("Gemini Generation Error:", error);
        throw error;
    }
};
