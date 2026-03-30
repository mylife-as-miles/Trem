import { ai, extractJSON, fileToBase64 } from '../base';
// @ts-ignore
import repoGenerationPrompt from '../../../prompts/repo-generation.md?raw';

export interface RepoGenerationInputs {
    duration?: string;
    transcript?: string;
    sceneBoundaries?: string;
    assetContext?: string;
    images?: string[];
}

export interface AnalyzedAsset {
    id: string;
    description: string;
    tags: string[];
}

export const analyzeAsset = async (
    asset: { id: string; name: string; blob?: Blob; images?: string[] },
): Promise<AnalyzedAsset> => {
    if (!ai) {
        await new Promise((resolve) => setTimeout(resolve, 900));
        return {
            id: asset.id,
            description: `Analyzed content for ${asset.name}`,
            tags: ['auto-detected', 'mock'],
        };
    }

    try {
        const parts: any[] = [
            {
                text: 'Analyze this media and return JSON with a short description and three tags: {"description":"...","tags":["..."]}',
            },
        ];

        if (asset.images?.length) {
            asset.images.forEach((base64Image) => {
                const cleanBase64 = base64Image.replace(/^data:image\/[a-z]+;base64,/, '');
                parts.push({
                    inlineData: {
                        mimeType: 'image/jpeg',
                        data: cleanBase64,
                    },
                });
            });
        } else if (asset.blob) {
            const base64Data = await fileToBase64(asset.blob);
            parts.push({
                inlineData: {
                    mimeType: asset.blob.type || 'video/mp4',
                    data: base64Data,
                },
            });
        }

        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            config: {
                responseMimeType: 'application/json',
            },
            contents: [{ role: 'user', parts }],
        } as any);

        return { id: asset.id, ...extractJSON(response.text || '{}') };
    } catch (error) {
        console.error(`Failed to analyze asset ${asset.name}`, error);
        return {
            id: asset.id,
            description: 'Analysis failed',
            tags: ['error'],
        };
    }
};

export const generateRepoStructure = async (
    inputs: RepoGenerationInputs,
    onLog?: (msg: string) => void,
) => {
    if (!ai) {
        await new Promise((resolve) => setTimeout(resolve, 1200));
        return {
            commit: {
                message: 'Initialize repository structure',
            },
            summary: 'Mock repository structure generated without a configured Gemini API key.',
            files: [
                { path: 'README.md', content: `# ${inputs.duration || 'New'} Repository\n\n${inputs.assetContext || ''}` },
                { path: 'scenes.json', content: JSON.stringify({ transcript: inputs.transcript || '', tags: [] }, null, 2) },
            ],
        };
    }

    const promptText = repoGenerationPrompt
        .replace('{{DURATION}}', inputs.duration || 'Unknown')
        .replace('{{TRANSCRIPT}}', inputs.transcript || 'None (detect from context)')
        .replace(
            '{{SCENE_BOUNDARIES}}',
            inputs.sceneBoundaries !== 'auto-detected'
                ? inputs.sceneBoundaries || 'AUTO-DETECT'
                : 'AUTO-DETECT (Analyze visual cues to find cuts)',
        )
        .replace('{{ASSET_CONTEXT}}', inputs.assetContext || 'None provided')
        .replace('{{VISUAL_CONTEXT_COUNT}}', String(inputs.images?.length || 0));

    const parts: any[] = [{ text: promptText }];

    inputs.images?.forEach((base64Image) => {
        const cleanBase64 = base64Image.replace(/^data:image\/[a-z]+;base64,/, '');
        parts.push({
            inlineData: {
                mimeType: 'image/jpeg',
                data: cleanBase64,
            },
        });
    });

    const result = await ai.models.generateContentStream({
        model: 'gemini-3-flash-preview',
        config: {
            thinkingConfig: {
                thinkingLevel: 'HIGH',
            },
            responseMimeType: 'application/json',
        } as any,
        contents: [{ role: 'user', parts }],
    } as any);

    let fullText = '';
    let lastLogTime = 0;

    for await (const chunk of result) {
        fullText += chunk.text || '';
        const now = Date.now();

        if (onLog && now - lastLogTime > 2000) {
            onLog(`Thinking... (${fullText.length} chars generated)`);
            lastLogTime = now;
        }
    }

    return extractJSON(fullText);
};
