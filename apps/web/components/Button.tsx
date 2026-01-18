'use client'

import { type ButtonHTMLAttributes, forwardRef } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'text'
  size?: 'default' | 'large'
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = '', variant = 'primary', size = 'default', disabled, children, ...props }, ref) => {
    const baseStyles = `
      font-medium rounded-full
      transition-all duration-200
      focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]
      disabled:opacity-40 disabled:cursor-not-allowed
      active:scale-[0.98]
    `.replace(/\s+/g, ' ').trim()

    const variants = {
      primary: `
        bg-[var(--primary)] text-[var(--primary-foreground)]
        hover:bg-[var(--primary-hover)]
        focus-visible:ring-[var(--primary)]
      `.replace(/\s+/g, ' ').trim(),
      secondary: `
        bg-[var(--background-secondary)] text-[var(--foreground)]
        hover:bg-[var(--background-tertiary)]
        focus-visible:ring-[var(--border)]
        border border-[var(--border)]
      `.replace(/\s+/g, ' ').trim(),
      text: `
        bg-transparent text-[var(--primary)]
        hover:bg-[var(--background-secondary)]
        focus-visible:ring-[var(--primary)]
      `.replace(/\s+/g, ' ').trim(),
    }

    const sizes = {
      default: 'px-5 py-2.5 text-sm',
      large: 'px-8 py-4 text-base w-full',
    }

    return (
      <button
        ref={ref}
        className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
        disabled={disabled}
        {...props}
      >
        {children}
      </button>
    )
  }
)

Button.displayName = 'Button'
