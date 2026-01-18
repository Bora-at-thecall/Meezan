'use client'

import { type HTMLAttributes, forwardRef } from 'react'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'elevated' | 'outlined'
  padding?: 'none' | 'default' | 'large'
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className = '', variant = 'default', padding = 'default', children, ...props }, ref) => {
    const baseStyles = 'rounded-2xl transition-all duration-200'

    const variants = {
      default: 'bg-[var(--background-secondary)]',
      elevated: 'bg-[var(--background-secondary)] border border-[var(--border-strong)]',
      outlined: 'bg-transparent border border-[var(--border)]',
    }

    const paddings = {
      none: '',
      default: 'p-4',
      large: 'p-6',
    }

    return (
      <div
        ref={ref}
        className={`${baseStyles} ${variants[variant]} ${paddings[padding]} ${className}`}
        {...props}
      >
        {children}
      </div>
    )
  }
)

Card.displayName = 'Card'
