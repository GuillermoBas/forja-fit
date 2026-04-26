import ReactMarkdown from "react-markdown"
import remarkBreaks from "remark-breaks"
import remarkGfm from "remark-gfm"
import { cn } from "@/lib/utils"

export function NutritionMessageMarkdown({
  content,
  className
}: {
  content: string
  className?: string
}) {
  return (
    <div className={cn("max-w-none text-sm leading-6", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        components={{
          p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
          strong: ({ children }) => <strong className="font-semibold text-current">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          ul: ({ children }) => <ul className="mb-3 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>,
          ol: ({ children }) => <ol className="mb-3 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>,
          li: ({ children }) => <li className="marker:text-current">{children}</li>,
          h1: ({ children }) => <h4 className="mb-2 text-base font-semibold">{children}</h4>,
          h2: ({ children }) => <h4 className="mb-2 text-base font-semibold">{children}</h4>,
          h3: ({ children }) => <h5 className="mb-2 text-sm font-semibold uppercase tracking-[0.08em]">{children}</h5>,
          blockquote: ({ children }) => (
            <blockquote className="mb-3 border-l-2 border-current/25 pl-3 italic last:mb-0">
              {children}
            </blockquote>
          ),
          code: ({ children, className: codeClassName }) => (
            <code className={cn("rounded border border-border/80 bg-surface-alt px-1.5 py-0.5 text-[0.92em]", codeClassName)}>
              {children}
            </code>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="font-medium underline underline-offset-4"
            >
              {children}
            </a>
          )
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
