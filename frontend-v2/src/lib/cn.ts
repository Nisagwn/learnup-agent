import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Tailwind sınıf birleştirici — çakışan utility'lerde sonuncusu kazanır. */
export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs))
