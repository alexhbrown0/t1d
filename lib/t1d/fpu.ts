export function computeFpu(fat_g: number, protein_g: number): number {
  return ((fat_g * 9) + (protein_g * 4)) / 100
}

export function fpuCategory(fpu: number): 'none' | 'low' | 'medium' | 'high' {
  if (fpu < 0.5) return 'none'
  if (fpu < 1.0) return 'low'
  if (fpu < 2.0) return 'medium'
  return 'high'
}
