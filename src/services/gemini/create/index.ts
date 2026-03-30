import { ai, extractJSON } from '../base';
// @ts-ignore
import remotionGenerationPrompt from '../../../prompts/remotion-generation.md?raw';
// @ts-ignore
import remotionSkills from '../../../prompts/remotion-skills-combined.md?raw';

export const generateRemotionProject = async (userPrompt: string): Promise<Record<string, string>> => {
    if (!ai) {
        await new Promise((resolve) => setTimeout(resolve, 1200));
        return {
            'Root.tsx': `import {Composition} from 'remotion';\nimport {MyVideo} from './MyVideo';\n\nexport const Root: React.FC = () => {\n  return (\n    <Composition\n      id="MyVideo"\n      component={MyVideo}\n      durationInFrames={150}\n      width={1920}\n      height={1080}\n      fps={30}\n    />\n  );\n};`,
            'MyVideo.tsx': `import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';\n\nexport const MyVideo: React.FC = () => {\n  const frame = useCurrentFrame();\n  const opacity = interpolate(frame, [0, 30], [0, 1]);\n\n  return (\n    <AbsoluteFill className="bg-white flex items-center justify-center">\n      <h1 style={{opacity}} className="text-6xl font-bold text-slate-900">Hello Trem AI</h1>\n    </AbsoluteFill>\n  );\n};`,
        };
    }

    const promptText = remotionGenerationPrompt
        .replace('{{USER_PROMPT}}', userPrompt)
        .replace('{{REMOTION_SKILLS}}', remotionSkills);

    const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        config: {
            thinkingConfig: {
                thinkingLevel: 'HIGH',
            },
            tools: [{ codeExecution: {} }],
        } as any,
        contents: [{ role: 'user', parts: [{ text: promptText }] }],
    } as any);

    const json = extractJSON(response.text || '{}');
    return json.files || json;
};
