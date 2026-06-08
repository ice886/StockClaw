import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import './AssistantBubble.css';

interface Props {
  content: string;
}

export function AssistantBubble({ content }: Props) {
  return (
    <div className="assistant-markdown">
      <ReactMarkdown
        components={{
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '');
            const code = String(children).replace(/\n$/, '');

            // inline code: `like this`
            if (!match && !code.includes('\n')) {
              return (
                <code className="inline-code" {...props}>
                  {children}
                </code>
              );
            }

            // block code: ```lang ... ```
            return (
              <SyntaxHighlighter
                style={oneDark}
                language={match?.[1] ?? 'text'}
                PreTag="div"
              >
                {code}
              </SyntaxHighlighter>
            );
          },
          a({ href, children }) {
            return (
              <a href={href} target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            );
          },
          table({ children }) {
            return <div className="table-wrapper"><table>{children}</table></div>;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
