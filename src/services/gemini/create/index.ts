import { ai, extractJSON } from '../base';
// @ts-ignore
import remotionGenerationPrompt from '../../../prompts/remotion-generation.md?raw';
// @ts-ignore
import remotionSkills from '../../../prompts/remotion-skills-combined.md?raw';

/**
 * Generates a Remotion project structure based on a user prompt.
 * Uses gemini-3-pro-preview with Thinking and Code Execution.
 */
export const generateRemotionProject = async (userPrompt: string): Promise<Record<string, string>> => {
    if (!ai) {
        // Mock response for dev without API key
        await new Promise(r => setTimeout(r, 2000));
        return {
            "Root.tsx": `import {Composition} from 'remotion';\nimport {MyVideo} from './MyVideo';\n\nexport const Root: React.FC = () => {\n  return (\n    <Composition\n      id="MyVideo"\n      component={MyVideo}\n      durationInFrames={150}\n      width={1920}\n      height={1080}\n      fps={30}\n    />\n  );\n};`,
            "MyVideo.tsx": `import {AbsoluteFill, useCurrentFrame, interpolate} from 'remotion';\n\nexport const MyVideo: React.FC = () => {\n  const frame = useCurrentFrame();\n  const opacity = interpolate(frame, [0, 30], [0, 1]);\n  return (\n    <AbsoluteFill className="bg-white flex items-center justify-center">\n      <h1 style={{ opacity }} className="text-6xl font-bold text-slate-900">Hello Trem AI</h1>\n    </AbsoluteFill>\n  );\n};`
        };
    }

    try {
        const promptText = remotionGenerationPrompt
            .replace('{{USER_PROMPT}}', userPrompt)
            .replace('{{REMOTION_SKILLS}}', remotionSkills);

        const model = 'gemini-3-pro-preview';

        // Config with thinking and code execution
        const config = {
            thinkingConfig: {
                thinkingLevel: 'HIGH',
            },
            tools: [
                { codeExecution: {} }
            ],
        };

        const response = await ai.models.generateContent({
            model,
            config: config as any,
            contents: [{ role: 'user', parts: [{ text: promptText }] }]
        } as any);

        const text = response.text || "{}";
        const json = extractJSON(text);
        return json.files || json;

    } catch (error) {
        console.error("Remotion Generation Failed:", error);
        throw error;
    }
};
