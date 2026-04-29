import { Button } from "@/components/ui/button"

interface PageHeaderProps {
  title: string
  description: string
  actionLabel?: string
}

export function PageHeader({ title, description, actionLabel }: PageHeaderProps) {
  return (
    <div className="page-section flex flex-col gap-5 px-4 py-5 sm:px-6 sm:py-6 md:flex-row md:items-end md:justify-between">
      <div className="space-y-3">
        <span className="section-kicker">Operativa Trainium</span>
        <div>
          <h1 className="section-title-accent text-[1.75rem] font-bold tracking-[-0.035em] sm:text-[2.1rem]">{title}</h1>
          <p className="section-copy mt-3 max-w-3xl">{description}</p>
        </div>
      </div>
      {actionLabel ? (
        <Button className="min-w-[11rem] self-stretch sm:self-start md:self-auto">{actionLabel}</Button>
      ) : null}
    </div>
  )
}
