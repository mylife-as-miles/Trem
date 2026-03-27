import React from 'react';

interface SimpleMarkdownProps {
    children: string;
    className?: string;
}

const SimpleMarkdown: React.FC<SimpleMarkdownProps> = ({ children, className = '' }) => {
    if (!children) return null;

    const lines = children.split('\n');
    const elements: React.ReactNode[] = [];

    let inCodeBlock = false;
    let codeBlockContent: string[] = [];
    let codeBlockLanguage = '';

    const parseLine = (line: string, index: number) => {
        // Code Blocks
        if (line.trim().startsWith('```')) {
            if (inCodeBlock) {
                // End code block
                elements.push(
                    <div key={`code-${index}`} className="my-4 rounded-lg bg-slate-900 p-4 font-mono text-sm text-slate-100 overflow-x-auto">
                        <code className={codeBlockLanguage ? `language-${codeBlockLanguage}` : ''}>
                            {codeBlockContent.join('\n')}
                        </code>
                    </div>
                );
                inCodeBlock = false;
                codeBlockContent = [];
                codeBlockLanguage = '';
            } else {
                // Start code block
                inCodeBlock = true;
                codeBlockLanguage = line.trim().substring(3).trim();
            }
            return;
        }

        if (inCodeBlock) {
            codeBlockContent.push(line);
            return;
        }

        // Headers
        const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);
        if (headerMatch) {
            const level = headerMatch[1].length;
            const content = headerMatch[2];
            const sizes = ['text-3xl', 'text-2xl', 'text-xl', 'text-lg', 'text-base', 'text-sm'];
            const classes = `font-bold mt-6 mb-3 ${sizes[level - 1]} text-slate-900 dark:text-white`;

            elements.push(React.createElement(
                `h${level}`,
                { key: `h-${index}`, className: classes },
                parseInline(content)
            ));
            return;
        }

        // Horizontal Rules
        if (line.match(/^(\*{3,}|-{3,}|_{3,})$/)) {
            elements.push(<hr key={`hr-${index}`} className="my-6 border-slate-200 dark:border-white/10" />);
            return;
        }

        // Lists (Unordered)
        const listMatch = line.match(/^(\s*)[-*+]\s+(.+)$/);
        if (listMatch) {
            // Simple list handling - successive lines would ideally be grouped
            // For now, render as individual list items div mimicking li
            // A robust implementation would group them into <ul>
            elements.push(
                <div key={`li-${index}`} className="flex items-start gap-2 ml-4 my-1">
                    <span className="mt-2 w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-slate-500 flex-shrink-0"></span>
                    <span className="text-slate-700 dark:text-slate-300 leading-relaxed">{parseInline(listMatch[2])}</span>
                </div>
            );
            return;
        }

        // Blockquotes
        const quoteMatch = line.match(/^>\s+(.+)$/);
        if (quoteMatch) {
            elements.push(
                <blockquote key={`bq-${index}`} className="border-l-4 border-slate-300 dark:border-white/20 pl-4 my-4 italic text-slate-600 dark:text-slate-400">
                    {parseInline(quoteMatch[1])}
                </blockquote>
            );
            return;
        }

        // Empty lines
        if (!line.trim()) {
            elements.push(<div key={`br-${index}`} className="h-4"></div>);
            return;
        }

        // Standard Paragraph
        elements.push(
            <p key={`p-${index}`} className="mb-2 leading-relaxed text-slate-700 dark:text-slate-300">
                {parseInline(line)}
            </p>
        );
    };

    const parseInline = (text: string): React.ReactNode[] => {
        const parts: React.ReactNode[] = [];
        let remaining = text;
        let pIndex = 0;

        // Simple tokenizer for **bold**, *italic*, `code`, [link](url)
        // Note: This simple regex approach processes one match at a time and doesn't handle nesting well
        // A proper parser is much more complex. This checks for the first occurrence of any pattern.

        while (remaining) {
            // Find earliest match
            const bold = remaining.match(/\*\*(.+?)\*\*/);
            const italic = remaining.match(/\*(.+?)\*/); // Simplified, doesn't handle _italic_ for now to avoid conflict
            const code = remaining.match(/`(.+?)`/);
            const link = remaining.match(/\[(.+?)\]\((.+?)\)/);

            let bestMatch: RegExpMatchArray | null = null;
            let type = '';
            let index = Infinity;

            if (bold && (formatIndex(bold) < index)) { bestMatch = bold; type = 'bold'; index = formatIndex(bold); }
            if (italic && (formatIndex(italic) < index)) { bestMatch = italic; type = 'italic'; index = formatIndex(italic); }
            if (code && (formatIndex(code) < index)) { bestMatch = code; type = 'code'; index = formatIndex(code); }
            if (link && (formatIndex(link) < index)) { bestMatch = link; type = 'link'; index = formatIndex(link); }

            if (bestMatch && bestMatch.index !== undefined) {
                // Push text before match
                if (bestMatch.index > 0) {
                    parts.push(<span key={pIndex++}>{remaining.substring(0, bestMatch.index)}</span>);
                }

                // Push match
                if (type === 'bold') {
                    parts.push(<strong key={pIndex++} className="font-bold text-slate-900 dark:text-white">{bestMatch[1]}</strong>);
                } else if (type === 'italic') {
                    parts.push(<em key={pIndex++} className="italic">{bestMatch[1]}</em>);
                } else if (type === 'code') {
                    parts.push(<code key={pIndex++} className="font-mono text-sm bg-slate-100 dark:bg-white/10 px-1 py-0.5 rounded text-blue-500">{bestMatch[1]}</code>);
                } else if (type === 'link') {
                    parts.push(
                        <a key={pIndex++} href={bestMatch[2]} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
                            {bestMatch[1]}
                        </a>
                    );
                }

                remaining = remaining.substring(bestMatch.index + bestMatch[0].length);
            } else {
                // No more matches
                parts.push(<span key={pIndex++}>{remaining}</span>);
                remaining = '';
            }
        }

        return parts;
    };

    const formatIndex = (match: RegExpMatchArray | null) => match && match.index !== undefined ? match.index : Infinity;

    lines.forEach((line, i) => parseLine(line, i));

    if (inCodeBlock) {
        elements.push(
            <div key="code-incomplete" className="my-4 rounded-lg bg-slate-900 p-4 font-mono text-sm text-slate-100 overflow-x-auto">
                <code className={codeBlockLanguage ? `language-${codeBlockLanguage}` : ''}>
                    {codeBlockContent.join('\n')}
                </code>
            </div>
        );
    }

    return <div className={`simple-markdown ${className}`}>{elements}</div>;
};

export default SimpleMarkdown;
