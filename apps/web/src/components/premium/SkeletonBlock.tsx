import React from 'react'

export const SkeletonBlock: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`premium-skeleton ${className}`} aria-hidden />
)

export const SkeletonCard: React.FC = () => (
  <div className="premium-glass space-y-3 rounded-2xl p-4">
    <SkeletonBlock className="h-4 w-28" />
    <SkeletonBlock className="h-8 w-20" />
    <SkeletonBlock className="h-3 w-full" />
  </div>
)

export const SkeletonTable: React.FC<{ rows?: number }> = ({ rows = 4 }) => (
  <div className="space-y-2">
    {Array.from({ length: rows }).map((_, i) => (
      <SkeletonBlock key={i} className="h-10 w-full" />
    ))}
  </div>
)

export const SkeletonList: React.FC<{ rows?: number }> = ({ rows = 3 }) => (
  <div className="space-y-3">
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="flex gap-3">
        <SkeletonBlock className="h-8 w-8 rounded-full" />
        <div className="flex-1 space-y-2">
          <SkeletonBlock className="h-3 w-2/3" />
          <SkeletonBlock className="h-3 w-full" />
        </div>
      </div>
    ))}
  </div>
)
