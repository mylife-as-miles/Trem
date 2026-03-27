import React from 'react';

interface MarkdownRendererProps {
    content: string;
    className?: string;
}

const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, className = '' }) => {
    // Basic markdown parser
    const parseMarkdown = (text: string) => {
        if (!text) return null;

        const lines = text.split('\n');
        const elements: React.ReactNode[] = [];
        let listBuffer: React.ReactNode[] = [];
        let inList = false;

        lines.forEach((line, index) => {
            const trimmedLine = line.trim();

            if (trimmedLine.startsWith('- ') || trimmedLine.startsWith('* ') || /^\d+\.\s/.test(trimmedLine)) {
                // List item
                const content = trimmedLine.replace(/^[-*] |^\d+\.\s/, '');
                // Handle bold in list items
                const parts = content.split(/(\*\*.*?\*\*)/g);
                const listContent = parts.map((part, i) => {
                    if (part.startsWith('**') && part.endsWith('**')) {
                        return <strong key={i}>{part.slice(2, -2)}</strong>;
                    }
                    return part;
                });

                listBuffer.push(<li key={`li-${index}`} className="mb-1">{listContent}</li>);
                inList = true;
            } else {
                // Flush list if needed
                if (inList) {
                    elements.push(<ul key={`ul-${index}`} className="list-disc list-outside ml-5 mb-4 space-y-1">{listBuffer}</ul>);
                    listBuffer = [];
                    inList = false;
                }

                // Empty line
                if (trimmedLine === '') {
                    // elements.push(<div key={`br-${index}`} className="h-2"></div>); 
                    // Let paragraphs handle spacing
                    return;
                }

                // Heading 1
                if (trimmedLine.startsWith('# ')) {
                    elements.push(<h1 key={`h1-${index}`} className="text-xl font-bold mb-2 mt-4">{trimmedLine.slice(2)}</h1>);
                    return;
                }

                // Heading 2
                if (trimmedLine.startsWith('## ')) {
                    elements.push(<h2 key={`h2-${index}`} className="text-lg font-bold mb-2 mt-4">{trimmedLine.slice(3)}</h2>);
                    return;
                }

                // Paragraph
                const parts = line.split(/(\*\*.*?\*\*)/g);
                const paragraphContent = parts.map((part, i) => {
                    if (part.startsWith('**') && part.endsWith('**')) {
                        return <strong key={i} className="font-bold text-slate-900 dark:text-white">{part.slice(2, -2)}</strong>;
                    }
                    // Handle italic * *
                    if (part.includes('*') && !part.includes('**')) {
                        const italicParts = part.split(/(\*.*?\*)/g);
                        return italicParts.map((subPart, j) => {
                            if (subPart.startsWith('*') && subPart.endsWith('*')) {
                                return <em key={`${i}-${j}`} className="italic">{subPart.slice(1, -1)}</em>;
                            }
                            return subPart;
                        });
                    }
                    return part;
                });

                elements.push(<p key={`p-${index}`} className="mb-4 leading-relaxed">{paragraphContent}</p>);
            }
        });

        // Flush remaining list
        if (inList) {
            elements.push(<ul key="ul-end" className="list-disc list-outside ml-5 mb-4 space-y-1">{listBuffer}</ul>);
        }

        return elements;
    };

    return (
        <div className={`markdown-content text-slate-600 dark:text-slate-300 text-sm md:text-base font-light ${className}`}>
            {parseMarkdown(content)}
        </div>
    );
};

export default MarkdownRenderer;
