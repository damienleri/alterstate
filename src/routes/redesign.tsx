import { createFileRoute } from '@tanstack/react-router'
import RedesignInterface from '@/components/RedesignInterface'

export const Route = createFileRoute('/redesign')({
  component: RedesignInterface,
})
