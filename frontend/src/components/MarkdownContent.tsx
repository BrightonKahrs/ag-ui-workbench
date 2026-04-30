import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Props {
  content: string;
  className?: string;
}

export default function MarkdownContent({ content, className = "" }: Props) {
  return (
    <div className={`prose prose-sm prose-gray max-w-none ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          table: ({ children, ...props }) => (
            <table className="border-collapse text-xs my-2 w-full" {...props}>
              {children}
            </table>
          ),
          th: ({ children, ...props }) => (
            <th className="border border-gray-300 px-2 py-1 bg-gray-50 font-medium text-left" {...props}>
              {children}
            </th>
          ),
          td: ({ children, ...props }) => (
            <td className="border border-gray-300 px-2 py-1" {...props}>
              {children}
            </td>
          ),
          code: ({ children, className: codeClassName, ...props }) => {
            const isInline = !codeClassName;
            return isInline ? (
              <code className="bg-gray-100 px-1 py-0.5 rounded text-xs font-mono" {...props}>
                {children}
              </code>
            ) : (
              <code className={`block bg-gray-50 p-3 rounded-lg text-xs font-mono overflow-x-auto ${codeClassName || ""}`} {...props}>
                {children}
              </code>
            );
          },
          pre: ({ children, ...props }) => (
            <pre className="bg-gray-50 rounded-lg p-0 my-2 overflow-x-auto" {...props}>
              {children}
            </pre>
          ),
          h1: ({ children, ...props }) => (
            <h1 className="text-lg font-bold mt-3 mb-1" {...props}>{children}</h1>
          ),
          h2: ({ children, ...props }) => (
            <h2 className="text-base font-bold mt-3 mb-1" {...props}>{children}</h2>
          ),
          h3: ({ children, ...props }) => (
            <h3 className="text-sm font-semibold mt-2 mb-1" {...props}>{children}</h3>
          ),
          p: ({ children, ...props }) => (
            <p className="my-1 leading-relaxed" {...props}>{children}</p>
          ),
          ul: ({ children, ...props }) => (
            <ul className="list-disc pl-4 my-1" {...props}>{children}</ul>
          ),
          ol: ({ children, ...props }) => (
            <ol className="list-decimal pl-4 my-1" {...props}>{children}</ol>
          ),
          li: ({ children, ...props }) => (
            <li className="my-0.5" {...props}>{children}</li>
          ),
          blockquote: ({ children, ...props }) => (
            <blockquote className="border-l-3 border-gray-300 pl-3 my-2 text-gray-600 italic" {...props}>
              {children}
            </blockquote>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
